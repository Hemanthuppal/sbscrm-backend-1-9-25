require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const mysql = require("mysql2");
const imaps = require("imap-simple");
const { simpleParser } = require("mailparser");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// =========================
// MySQL CONNECTION
// =========================
const db = mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASS || "",
    database: process.env.DB_NAME || "sbs_crm_new",
});

// =========================
// HELPERS
// =========================
function normalizePhone(raw) {
    if (!raw) return null;
    const digits = (raw + "").replace(/\D/g, "");
    if (digits.length >= 10) return digits.slice(-10);
    return digits || null;
}

function normalizeLead(data) {
    return {
        lead_name: (data.name || "Unknown").trim(),
        email: (data.email || "unknown@example.com").toLowerCase().trim(),
        contact_number: normalizePhone(data.mobile),
        lead_source: data.source || "Email",
        terms_conditions: data.terms_conditions || null,
    };
}

function normalizeProduct(product) {
    return {
        unit: product.unit || null,
        pr_no: product.pr_no || null,
        pr_date: product.pr_date || null,
        legacy_code: product.legacy_code || null,
        item_code: product.item_code || null,
        item_description: product.description || null,
        uom: product.uom || null,
        pr_quantity: product.qty ? parseInt(product.qty, 10) : null,
        is_ambiguous: product.is_ambiguous || false,
    };
}

async function matchProductWithDatabase(product) {
    const nProduct = normalizeProduct(product);
    const sqlMatch = `
        SELECT 
            mc.maincategory_name,
            sc.subcategory_name,
            pn.product_name,
            pd.batch,
            pd.description,
            pd.size,
            pd.hsncode,
            pd.gstrate,
            pd.listprice,
            pd.moq,
            pd.created_at
        FROM product_details pd
        LEFT JOIN main_category mc ON pd.maincategory_id = mc.maincategory_id
        LEFT JOIN sub_category sc ON pd.subcategory_id = sc.subcategory_id
        LEFT JOIN product_name pn ON pd.product_id = pn.product_id
        WHERE pd.hsncode = ?
           OR pd.batch = ?
           OR pd.description LIKE ?
           OR pn.product_name LIKE ?
           OR pd.size LIKE ?
    `;
    
    const searchTerm = `%${nProduct.item_description || ''}%`;
    const sizeTerm = `%${nProduct.item_description?.match(/HEAD WEIGHT: *([\d.]+ *GMS|\d+ *oz\.|medium size)/i)?.[1] || ''}%`;
    const params = [
        nProduct.item_code || '',
        nProduct.item_code || '',
        searchTerm,
        searchTerm,
        sizeTerm
    ];

    return new Promise((resolve, reject) => {
        db.query(sqlMatch, params, (err, results) => {
            if (err) {
                console.error("Error matching product:", err);
                return reject(err);
            }
            const matches = results.map(row => ({
                maincategory_name: row.maincategory_name || null,
                subcategory_name: row.subcategory_name || null,
                product_name: row.product_name || null,
                batch: row.batch || null,
                description: row.description || null,
                size: row.size || null,
                hsncode: row.hsncode || null,
                gstrate: row.gstrate || null,
                listprice: row.listprice || null,
                moq: row.moq || null,
                created_at: row.created_at || null,
            }));
            console.log(`Product match: ${nProduct.item_description}, Matches found: ${matches.length}${matches.length > 1 ? ' (AMBIGUOUS)' : ''}`);
            resolve({
                matches,
                is_ambiguous: matches.length > 1 && !nProduct.item_code
            });
        });
    });
}

async function insertOrUpdateContact(data, callback) {
    const nLead = normalizeLead(data);

    const sqlLead = `
        INSERT INTO emailleads 
            (lead_name, email, contact_number, lead_source, terms_conditions, created_at)
        VALUES (?, ?, ?, ?, ?, NOW())
    `;

    const paramsLead = [
        nLead.lead_name,
        nLead.email,
        nLead.contact_number,
        nLead.lead_source,
        nLead.terms_conditions,
    ];

    db.query(sqlLead, paramsLead, async (err, result) => {
        if (err) {
            console.error("Error inserting lead:", err);
            return callback(err);
        }
        const leadId = result.insertId;

        if (!Array.isArray(data.products) || data.products.length === 0) {
            return callback(null, { leadId, matchedProducts: [] });
        }

        let insertedProducts = 0;
        const matchedProducts = [];

        for (const product of data.products) {
            const nProduct = normalizeProduct(product);
            try {
                const { matches, is_ambiguous } = await matchProductWithDatabase(product);
                matchedProducts.push({
                    emailProduct: { ...nProduct, is_ambiguous },
                    matchedDbProducts: matches,
                });

                const sqlProduct = `
                    INSERT INTO emailproducts 
                        (lead_id, unit, pr_no, pr_date, legacy_code, item_code, item_description, uom, pr_quantity)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `;

                const paramsProduct = [
                    leadId,
                    nProduct.unit,
                    nProduct.pr_no,
                    nProduct.pr_date,
                    nProduct.legacy_code,
                    nProduct.item_code,
                    nProduct.item_description,
                    nProduct.uom,
                    nProduct.pr_quantity,
                ];

                db.query(sqlProduct, paramsProduct, (err) => {
                    if (err) {
                        console.error(`Error inserting product ${insertedProducts + 1}:`, err);
                        return;
                    }
                    insertedProducts++;
                    if (insertedProducts === data.products.length) {
                        callback(null, { leadId, matchedProducts });
                    }
                });
            } catch (matchErr) {
                console.error("Product matching error:", matchErr);
                insertedProducts++;
                if (insertedProducts === data.products.length) {
                    callback(null, { leadId, matchedProducts });
                }
            }
        }
    });
}

// =========================
// OPENROUTER AI WRAPPER
// =========================
class OpenRouterAI {
    constructor() {
        this.apiKey = process.env.OPENROUTER_API_KEY;
        this.apiUrl = "https://openrouter.ai/api/v1/chat/completions";
        this.model = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
        this.minConfidence = parseFloat(process.env.AI_MIN_CONFIDENCE) || 0.5;
    }

    async extractContactInfo(emailContent, subject, fromEmail, fromName) {
        if (!this.apiKey) {
            console.error("OpenRouter API key not found");
            return null;
        }

        const prompt = {
            role: "user",
            content: `
ANALYZE THIS RAW EMAIL CONTENT AND EXTRACT CONTACT AND PRODUCT INFORMATION IN JSON FORMAT:

Return a valid JSON object with contact and product details extracted from the raw email content, including headers, forwarded sections, HTML, and multi-part MIME structures, without any preprocessing. Handle cases with minimal or common details (e.g., product name, brand, quantity) that may match multiple database products, lacking unique identifiers (e.g., model number, HSN code).

EMAIL DETAILS:
- Subject: ${subject || "No Subject"}
- From: ${fromName || "Unknown"} <${fromEmail || "unknown@example.com"}>

Output format:
{
  "name": "<Name or null>",
  "email": "<Email or null>",
  "mobile": "<Phone or null>",
  "products": [
    {
      "pr_no": "<Purchase Requisition Number or null>",
      "pr_date": "<PR Date (YYYY-MM-DD) or null>",
      "legacy_code": "<Legacy Code or null>",
      "item_code": "<HSN Code, Item Code, Model Number, or Batch Code or null>",
      "description": "<Full Item Description or constructed from available details>",
      "product_name": "<Concise Product Name or null>",
      "size": "<Normalized Size (e.g., weight in oz/kg/gms, length in in/mm) or null>",
      "qty": <Quantity or null>,
      "uom": "<Unit of Measure or null>",
      "unit": "<Unit or null>",
      "manufacturer": "<Manufacturer or null>",
      "additional_specs": "<Additional Specifications or null>",
      "is_ambiguous": <Boolean, true if details may match multiple products>
    }
  ],
  "terms_conditions": "<Terms and Conditions or null>",
  "source": "Email",
  "confidence": <Confidence Score 0.0-1.0>,
  "is_contact_inquiry": <Boolean>
}

**Instructions**:
- **Email Content Analysis**:
  - Process the raw email content, including headers (e.g., "From:", "Date:"), forwarded sections (e.g., "---------- Forwarded message ---------"), HTML tags, and multi-part MIME structures (e.g., "Content-Type: text/plain").
  - Ignore MIME headers (e.g., "--00000000000089a93d063d795e0e") and focus on email body, headers, and forwarded sections.
  - Prioritize contact details (name, email, mobile) from the innermost forwarded section's sender (e.g., "From: Roza Sheikh <sbsroza1@gmail.com>", "ROZA SHEIKH - PH: 7879985320") or email body.
  - Use top-level sender (${fromName}, ${fromEmail}) only if no valid contact info is found in forwarded sections or body.
  - Extract contact info from signatures, body, or headers. Look for patterns like "Name:", "PH:", "E MAIL:", or phone numbers (e.g., "7879985320", "+91-7879985320", "PH - 7879985320").

- **Product Details Extraction**:
  - Identify product details from any part of the email (headers, subject, body, forwarded sections, HTML). Support multiple formats:
    - Comma-separated: e.g., "HAMMER,TYPE:BALL PEIN,HEAD WEIGHT:565 GMS,INDESTRUCTIBLE HANDLE,HEAD:52 HRC,HANDLE LENGTH:350 MM,MODEL NUMBER:BPID/20/14,MANUFACTURER:GROZ,MAITENANCE WORK".
    - Colon-separated: e.g., "Item: Ball Pein Hammer, Brand: GROZ, Quantity: 12".
    - Tables: HTML or text tables with columns like "Item", "Qty", "Brand", "Details".
    - Lists: e.g., "- Ball Pein Hammer, GROZ, 12 units".
    - Free text: e.g., "Need 12 ball pein hammers, GROZ brand, for maintenance".
  - Recognize machine tools-related terms (e.g., "HAMMER", "DRILL", "BALL PEIN", "GROZ", "BPID/20/14", "SOCKETS", "HEX SOCKETS").
  - Extract multiple products if listed (e.g., separated by lines, numbers like "Item 1", "Item 2", tables, or newlines).
  - Handle minimal details (e.g., only product name, brand, quantity) by setting unavailable fields to null.
  - Map fields to JSON:
    - **pr_no**: Extract "PR No", "RFQ number", or number from subject/body (e.g., "5000387076"). If not found, set to null.
    - **pr_date**: Extract "PR Date" or any date (e.g., "26-08-2025", "26/8/2025"). Convert to "YYYY-MM-DD". If not found, set to null.
    - **legacy_code**: Extract "Material Code" or "Legacy Code" (e.g., "461916000033"). If not found, set to null.
    - **item_code**: Extract "Item Code", "MODEL NUMBER", "HSN Code", or code-like strings (e.g., "BPID/20/14", "8205") from description, subject, or body. Prioritize patterns like "MODEL NUMBER:BPID/20/14", "Model: BPID/20/14". If not found, set to null.
    - **description**: Capture full description if provided (e.g., "HAMMER,TYPE:BALL PEIN,...") or construct from available details (e.g., "Ball Pein Hammer, GROZ, 12 units"). Preserve special characters.
    - **product_name**: Derive concise name (e.g., "BALL PEIN HAMMER", "DRILL MACHINE") from description (first part before comma, e.g., "HAMMER"), "TYPE", "Item", or context clues in free text (e.g., "ball pein hammers" → "BALL PEIN HAMMER"). If unclear, use the main item name.
    - **size**: Extract measurements (e.g., "565 GMS", "0.565 Kg", "20 oz.", "350 MM", "14 in", "medium size") from "HEAD WEIGHT", "HANDLE LENGTH", "SIZE", or description. Normalize units with equivalents in parentheses (e.g., "565 GMS (20 oz.)" since 565g ≈ 20oz, "350 MM (14 in)" since 350mm ≈ 14in). If vague (e.g., "medium size"), include as-is. If not found, set to null.
    - **qty**: Extract "Quantity" or "Qty" (e.g., "12" from "Qty-12 Nos", "12 units") as an integer. If not found, set to null.
    - **uom**: Extract "Unit of Measure" (e.g., "NOS", "NUMBER", "UNITS") from "Qty-12 Nos" or context. If not found, set to null.
    - **unit**: Extract "Unit" (e.g., "MAINTENANCE", "MAINTENANCE WORK") if mentioned; else null.
    - **manufacturer**: Extract "MANUFACTURER", "Brand", or brand name (e.g., "GROZ", "BOSCH") from description or body. If not found, set to null.
    - **additional_specs**: Capture extra specs (e.g., "HEAD:52 HRC,INDESTRUCTIBLE HANDLE") excluding size, manufacturer, item_code. If not found, set to null.
    - **is_ambiguous**: Set to true if details are minimal (e.g., only product name, brand, quantity) and likely to match multiple products (e.g., no model number, HSN code, or specific size). Set to false if a unique identifier (e.g., "MODEL NUMBER:BPID/20/14") is present.
  - If no products, return empty array.
  - Check subject for product details (e.g., "RFQ-5000387076_HAMMER,BL PN,565GMS").

- **Handling Ambiguous Cases**:
  - For emails with minimal details (e.g., "Ball Pein Hammer, GROZ, 12 units") lacking unique identifiers (e.g., model number, HSN code), set **is_ambiguous** to true to indicate potential for multiple database matches.
  - Construct **description** from available details to aid matching (e.g., combine product name, brand, quantity).
  - Lower **confidence** (e.g., 0.7-0.8) for ambiguous cases to reflect uncertainty.

- **Handling Diverse Scenarios**:
  - Support emails from educated senders (formal RFQs, structured tables, key-value pairs) and non-educated senders (informal, free text, minimal details, spelling errors like "ball pein hammers").
  - Handle variations in formatting (comma, colon, tables, lists, free text), spelling (e.g., "565 gms", "medium size"), and structure (e.g., forwarded emails, HTML tables).
  - Extract multiple products accurately, even in mixed formats or with partial details.
  - Normalize size units to include equivalents for flexibility (e.g., "565 GMS (20 oz.)", "350 MM (14 in)").

- **Terms and Conditions**:
  - Extract from sections labeled "Terms and Conditions", "Special Instruction", or similar. Combine into a single string with newlines. Set to null if not found.

- **Additional Rules**:
  - Set **is_contact_inquiry** to true if email contains RFQ, BOQ, product specs, PR No, Quantity, or machine tools terms (e.g., "HAMMER", "GROZ", "Qty-12 Nos"). Set to false for spam (e.g., "newsletter").
  - If "products" array has items or RFQ keywords, set **is_contact_inquiry** to true and **confidence** to at least 0.7.
  - **Confidence**: 0.9-0.95 for detailed RFQs with unique identifiers, 0.7-0.8 for minimal or ambiguous data, <0.5 for ambiguous/spam.
  - Return valid JSON, prioritizing innermost forwarded section or email body.
  - Preserve special characters in descriptions.
  - Handle malformed or incomplete content gracefully, setting fields to null if not found.

Raw email content:
${emailContent || "No content"}
            `,
        };

        try {
            const response = await axios.post(
                this.apiUrl,
                {
                    model: this.model,
                    messages: [prompt],
                    temperature: 0.1,
                    max_tokens: 5000,
                    response_format: { type: "json_object" },
                },
                {
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${this.apiKey}`,
                        "HTTP-Referer": process.env.SITE_URL || "http://localhost:3000",
                        "X-Title": "Email Contact Extractor",
                    },
                    timeout: 30000,
                }
            );

            let content = response?.data?.choices?.[0]?.message?.content || "";
            console.log("Raw AI response content:", content);
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            let jsonText = jsonMatch ? jsonMatch[0] : content;

            let extractedData;
            try {
                extractedData = JSON.parse(jsonText);
            } catch (parseError) {
                console.error("JSON parse error:", parseError, "Content:", content);
                return null;
            }

            const isContactInquiry = extractedData.is_contact_inquiry === true;
            const confidence = parseFloat(extractedData.confidence) || 0;

            if (!isContactInquiry || confidence < this.minConfidence) {
                console.log(`Email filtered out - Is contact: ${isContactInquiry}, Confidence: ${confidence}`);
                return null;
            }

            return {
                name: extractedData.name || fromName || "Unknown",
                email: extractedData.email || fromEmail || "unknown@example.com",
                mobile: extractedData.mobile || null,
                products: Array.isArray(extractedData.products) ? extractedData.products.map(product => ({
                    pr_no: product.pr_no || null,
                    pr_date: product.pr_date || null,
                    legacy_code: product.legacy_code || null,
                    item_code: product.item_code || null,
                    description: product.description || null,
                    product_name: product.product_name || null,
                    size: product.size || null,
                    qty: product.qty ? parseInt(product.qty, 10) : null,
                    uom: product.uom || null,
                    unit: product.unit || null,
                    manufacturer: product.manufacturer || null,
                    additional_specs: product.additional_specs || null,
                    is_ambiguous: product.is_ambiguous || false
                })) : [],
                terms_conditions: extractedData.terms_conditions || null,
                source: extractedData.source || "Email",
                confidence: confidence,
                is_contact: isContactInquiry
            };
        } catch (err) {
            console.error("OpenRouter AI Error:", err?.response?.data || err.message);
            return null;
        }
    }
}

const openRouterAI = new OpenRouterAI();

// =========================
// EMAIL PARSE HELPERS
// =========================
function getEmailInfo(parsed, header) {
    let fromEmail = "unknown@example.com";
    let fromName = "Unknown";
    let subject = "No Subject";

    try {
        if (parsed.from?.value?.[0]) {
            fromEmail = parsed.from.value[0].address || fromEmail;
            fromName = parsed.from.value[0].name || fromName;
        } else if (header?.from) {
            const fromHeader = Array.isArray(header.from) ? header.from[0] : header.from;
            if (typeof fromHeader === "string") {
                const emailMatch = fromHeader.match(/<([^>]+)>/);
                if (emailMatch) {
                    fromEmail = emailMatch[1];
                    const nameMatch = fromHeader.match(/(.*)</);
                    if (nameMatch?.[1]) fromName = nameMatch[1].trim();
                } else {
                    fromEmail = fromHeader;
                }
            }
        }

        if (parsed.subject) subject = parsed.subject;
        else if (header?.subject) subject = Array.isArray(header.subject) ? header.subject[0] : header.subject;
    } catch (error) {
        console.error("Error extracting email info:", error);
    }

    return { fromEmail, fromName, subject };
}

// =========================
// FETCH + PROCESS EMAILS
// =========================
async function fetchAndProcessEmails() {
    let connection;
    try {
        console.log("Connecting to IMAP server...");
        connection = await imaps.connect(imapConfig);
        await connection.openBox("INBOX");

        const searchCriteria = ["UNSEEN"];
        const fetchOptions = {
            bodies: ["HEADER", "TEXT"],
            markSeen: true,
        };

        const messages = await connection.search(searchCriteria, fetchOptions);
        console.log(`Found ${messages.length} new email(s) to process`);

        let processedCount = 0;
        let filteredCount = 0;
        let productRequirementsCount = 0;

        for (const message of messages) {
            try {
                const header = message.parts.find((p) => p.which === "HEADER")?.body;
                const text = message.parts.find((p) => p.which === "TEXT")?.body;

                const parsed = await simpleParser(text || message.parts.map(p => p.body || '').join('\n') || '');
                console.log("Parsed object:", JSON.stringify(parsed, null, 2));
                console.log("Message parts:", message.parts?.map(p => ({
                    type: p.type || 'unknown',
                    which: p.which || 'unknown',
                    body: typeof p.body === 'string' ? p.body.substring(0, 200) : null
                })));

                const { fromEmail, fromName, subject } = getEmailInfo(parsed, header);
                const emailBody = text || message.parts.map(p => p.body || '').join('\n') || '';

                console.log("\n=== Processing Email ===");
                console.log(`From: ${fromName} <${fromEmail}>`);
                console.log(`Subject: ${subject}`);
                console.log(`Body length: ${emailBody.length} chars`);
                console.log(`Email body sample: ${emailBody.substring(0, 500) + "..."}`);

                const extractedData = await openRouterAI.extractContactInfo(
                    emailBody,
                    subject,
                    fromEmail,
                    fromName
                );

                if (!extractedData) {
                    console.log("Email filtered out - not a contact inquiry");
                    filteredCount++;
                    continue;
                }

                console.log("AI Extracted:", extractedData);
                processedCount++;

                if (extractedData.products.length > 0) {
                    console.log("Product Requirements Found:", extractedData.products);
                    productRequirementsCount++;
                } else {
                    console.log("No product requirements found in this email");
                }

                insertOrUpdateContact(extractedData, (err, result) => {
                    if (err) {
                        console.error("DB save error:", err);
                        return;
                    }
                    console.log(`Saved/Updated contact: ${extractedData.email}`);
                    console.log("Matched Products:", JSON.stringify(result.matchedProducts, null, 2));
                });
            } catch (error) {
                console.error("Error processing an email:", error.message);
            }
        }

        console.log(`\nProcessing complete: ${processedCount} contacts saved, ${filteredCount} emails filtered out, ${productRequirementsCount} product requirements found`);

    } catch (error) {
        console.error("IMAP connection error:", error.message);
    } finally {
        if (connection) {
            try {
                await connection.end();
            } catch (endError) {
                console.error("Error closing IMAP connection:", endError.message);
            }
        }
    }
}

// =========================
// API ENDPOINTS
// =========================
app.post("/api/submit", (req, res) => {
    const { name, email, mobile, message } = req.body || {};
    try {
        const contactData = {
            name: name || "Unknown",
            email: email || "unknown@example.com",
            mobile: mobile || null,
            source: "website_form",
            products: [],
            terms_conditions: null
        };

        insertOrUpdateContact(contactData, (err, result) => {
            if (err) {
                console.error("DB error:", err);
                return res.status(500).send("DB error");
            }

            return res.send("Form submitted successfully!");
        });
    } catch (error) {
        console.error("Submit error:", error);
        res.status(500).send("Error submitting form");
    }
});

app.post("/api/test-email", async (req, res) => {
    const { emailContent, subject, fromEmail, fromName } = req.body || {};

    try {
        const cleanSubject = subject || "No Subject";
        const cleanFromEmail = fromEmail || "unknown@example.com";
        const cleanFromName = fromName || "Unknown";

        const extracted = await openRouterAI.extractContactInfo(
            emailContent || "",
            cleanSubject,
            cleanFromEmail,
            cleanFromName
        );

        if (!extracted) {
            return res.json({
                ok: true,
                filtered: true,
                message: "Email was filtered out (not a contact inquiry)"
            });
        }

        insertOrUpdateContact(extracted, (err, result) => {
            if (err) {
                console.error("DB error:", err);
                return res.status(500).json({ ok: false, error: "DB error" });
            }

            res.json({
                ok: true,
                extracted,
                filtered: false,
                has_product_requirements: extracted.products.length > 0,
                matched_products: result.matchedProducts
            });
        });
    } catch (e) {
        console.error("test-email error:", e);
        res.status(500).json({ ok: false, error: e.message });
    }
});

app.get("/api/health", (req, res) => {
    res.json({
        status: "OK",
        ai_configured: !!process.env.OPENROUTER_API_KEY,
        db_connected: db.state === 'connected' || db.state === 'authenticated',
        mail_configured: !!process.env.MAIL_USER
    });
});



// =========================
// IMAP CONFIG
// =========================
const imapConfig = {
    imap: {
        user: process.env.MAIL_USER,
        password: process.env.MAIL_APP_PASS,
        host: "imap.gmail.com",
        port: 993,
        tls: true,
        connTimeout: 20000,
        authTimeout: 20000,
        socketTimeout: 60000,
        tlsOptions: { rejectUnauthorized: false },
        debug: (msg) => console.log("[imap-debug]", msg),
    },
};

const net = require("net");
function testPort(host, port) {
    return new Promise((resolve, reject) => {
        const s = net.createConnection({ host, port, timeout: 8000 }, () => {
            s.end();
            resolve(true);
        });
        s.on("error", reject);
        s.on("timeout", () => { s.destroy(); reject(new Error("timeout")); });
    });
}

(async () => {
    try {
        await testPort("imap.gmail.com", 993);
        console.log("TCP to imap.gmail.com:993 OK");
    } catch (e) {
        console.error("Cannot reach imap.gmail.com:993:", e.message);
    }
})();

// =========================
// SCHEDULER
// =========================
const POLL_MS = Number(process.env.IMAP_POLL_MS || 120000);
setInterval(fetchAndProcessEmails, POLL_MS);
console.log("Starting AI-powered email fetcher with OpenRouter integration...");
console.log(`AI Confidence Threshold: ${openRouterAI.minConfidence}`);
fetchAndProcessEmails();

// =========================
// START SERVER
// =========================
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));