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
        item_code: product.new_ic || product.item_code || null,
        item_description: product.description || null,
        uom: product.uom || null,
        pr_quantity: product.qty ? parseInt(product.qty, 10) : null,
    };
}

async function fetchDatabaseProducts() {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT 
                mc.maincategory_id,
                mc.maincategory_name,
                sc.subcategory_id,
                sc.subcategory_name,
                p.product_id,
                p.product_name,
                pd.detail_id,
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
            LEFT JOIN product_name p ON pd.product_id = p.product_id
            ORDER BY pd.detail_id DESC
        `;
        db.query(sql, (err, results) => {
            if (err) {
                console.error("Error fetching database products:", err);
                reject(err);
                return;
            }
            console.log(`Fetched ${results.length} database products`);
            resolve(results);
        });
    });
}

function insertOrUpdateContact(data, callback) {
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
            return callback(null, result);
        }

        let insertedProducts = 0;
        const matchedProducts = data.matchedProducts || [];

        for (const [index, product] of data.products.entries()) {
            const nProduct = normalizeProduct(product);

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

            console.log(`Inserting email product ${index + 1}:`, paramsProduct);

            db.query(sqlProduct, paramsProduct, async (err, productResult) => {
                if (err) {
                    console.error(`Error inserting email product ${index + 1}:`, err);
                    return;
                }
                const emailProductId = productResult.insertId;

                // Insert matched products if they exist
                const matchedProduct = matchedProducts[index];
                if (matchedProduct) {
                    const sqlMatched = `
                        INSERT INTO matched_products 
                            (lead_id, email_product_id, maincategory_id, maincategory_name, subcategory_id, subcategory_name, 
                             product_id, product_name, detail_id, batch, description, size, hsncode, gstrate, listprice, moq, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
                    `;
                    const paramsMatched = [
                        leadId,
                        emailProductId,
                        matchedProduct.maincategory_id || null,
                        matchedProduct.maincategory_name || null,
                        matchedProduct.subcategory_id || null,
                        matchedProduct.subcategory_name || null,
                        matchedProduct.product_id || null,
                        matchedProduct.product_name || null,
                        matchedProduct.detail_id || null,
                        matchedProduct.batch || null,
                        matchedProduct.description || null,
                        matchedProduct.size || null,
                        matchedProduct.hsncode || null,
                        matchedProduct.gstrate || null,
                        matchedProduct.listprice || null,
                        matchedProduct.moq || null,
                    ];

                    console.log(`Inserting matched product ${index + 1} for lead ${leadId}:`, paramsMatched);

                    db.query(sqlMatched, paramsMatched, (err) => {
                        if (err) {
                            console.error(`Error inserting matched product ${index + 1}:`, err);
                        } else {
                            console.log(`Inserted matched product ${index + 1} for lead ${leadId}`);
                        }
                    });
                } else {
                    console.log(`No matched product for email product ${index + 1}:`, nProduct);
                }

                insertedProducts++;
                if (insertedProducts === data.products.length) {
                    callback(null, result);
                }
            });
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
        this.matchConfidenceThreshold = 0.9; // Increased for stricter matching
    }

    async extractContactInfo(emailContent, subject, fromEmail, fromName) {
        if (!this.apiKey) {
            console.error("OpenRouter API key not found");
            return null;
        }

        // Fetch database products
        let dbProducts;
        try {
            dbProducts = await fetchDatabaseProducts();
        } catch (err) {
            console.error("Failed to fetch database products:", err);
            dbProducts = [];
        }

        const prompt = {
            role: "user",
            content: `
ANALYZE THIS RAW EMAIL CONTENT AND EXTRACT CONTACT AND PRODUCT INFORMATION, THEN MATCH PRODUCTS WITH DATABASE PRODUCTS IN JSON FORMAT:

Return a valid JSON object with contact details, extracted product details, and matched products from the provided database products. Only include matches with high confidence (> ${this.matchConfidenceThreshold}) based on strict semantic and field-based matching. Exclude unmatched products from matchedProducts.

EMAIL DETAILS:
- Subject: ${subject || "No Subject"}
- From: ${fromName || "Unknown"} <${fromEmail || "unknown@example.com"}>

DATABASE PRODUCTS:
${JSON.stringify(dbProducts, null, 2)}

Output format:
{
  "name": "<Name or null>",
  "email": "<Email or null>",
  "mobile": "<Phone or null>",
  "products": [
    {
      "pr_no": "<PR Number or null>",
      "pr_date": "<PR Date or null>",
      "legacy_code": "<Legacy Code or null>",
      "new_ic": "<New IC or null>",
      "description": "<Item Description or null>",
      "qty": <Quantity or null>,
      "uom": "<Unit of Measure or null>",
      "unit": "<Unit or null>"
    }
  ],
  "matchedProducts": [
    {
      "maincategory_id": <Main Category ID or null>,
      "maincategory_name": "<Main Category or null>",
      "subcategory_id": <Sub Category ID or null>,
      "subcategory_name": "<Sub Category or null>",
      "product_id": <Product ID or null>,
      "product_name": "<Product Name or null>",
      "detail_id": <Detail ID or null>,
      "batch": "<Batch or null>",
      "description": "<Description or null>",
      "size": "<Size or null>",
      "hsncode": "<HSN Code or null>",
      "gstrate": <GST Rate or null>,
      "listprice": <List Price or null>,
      "moq": <MOQ or null>
    }
  ],
  "terms_conditions": "<Terms and Conditions or null>",
  "source": "Email",
  "confidence": <Confidence Score 0.0-1.0>,
  "is_contact_inquiry": <Boolean>
}

**Instructions**:
- **Email Content Analysis**:
  - Process the raw email content, including headers, forwarded sections, HTML tags, and multi-part MIME structures.
  - Ignore MIME headers and focus on email body, headers, and forwarded sections.
  - Prioritize contact details (name, email, mobile) from the innermost forwarded section or email body.
  - Use top-level sender (${fromName}, ${fromEmail}) only if no valid contact info is found.
  - Extract contact info from signatures, body, or headers using patterns like "Name:", "PH:", or phone numbers.

- **Product Details Extraction**:
  - Identify product details from headers, subject, body, forwarded sections, or HTML using patterns like "ITEM:", "Qty-", "RFQ-" (e.g., "SPL/25-26/31041368").
  - Recognize machine tools terms (e.g., "HAMMER", "DRILL", "CHAIN PULLEY", "BLOCK").
  - Map fields:
    - "PR No" or "RFQ number" to "pr_no".
    - "PR Date" or date to "pr_date".
    - "Material Code" or "Legacy Code" (e.g., "2100283612") to "legacy_code".
    - "Item Code" or "MODEL NUMBER" to "new_ic".
    - "Description" (e.g., "BLOCK,CHAIN PULLEY,CAPACITY:20 TON...") to "description".
    - "Quantity" to "qty" (as integer).
    - "UOM" (e.g., "NOS") to "uom".
    - "Unit" to "unit" if mentioned; else null.
  - Extract multiple products into "products" array or return empty array if none.

- **Product Matching**:
  - For each product in "products", match against DATABASE PRODUCTS using: hsncode, batch, description, product_name, size, maincategory_name, subcategory_name.
  - Use strict matching criteria (confidence > ${this.matchConfidenceThreshold}). Prioritize:
    1. Exact or near-exact matches on "hsncode" (e.g., "8425" for chain pulleys, "8205" for hammers, "8204" for sockets) or "batch" (e.g., "2100283612").
    2. High semantic similarity between email "description" and database "description" or "product_name" (e.g., "BLOCK,CHAIN PULLEY,CAPACITY:20 TON" should match "CHAIN PULLEY BLOCK 20 TON").
    3. Matches on "size" (e.g., "16 M" vs. "16 M").
    4. Matches on "legacy_code" or "new_ic" with database "batch" or "hsncode".
    5. Category alignment using "maincategory_name" and "subcategory_name" (e.g., "LIFTING EQUIPMENT" for chain pulleys vs. "SOCKETS & SOCKET ACCESSORIES" for sockets).
  - **Matching Rules**:
    - Only include matches in "matchedProducts" if confidence > ${this.matchConfidenceThreshold}.
    - Ensure category alignment: "CHAIN PULLEY" (lifting equipment, HSN 8425) must not match "SOCKETS & SOCKET ACCESSORIES" (hand tools, HSN 8204) or "STRIKING TOOLS" (hammers, HSN 8205).
    - Use "maincategory_id", "subcategory_id", "product_id", and "detail_id" for unique identification.
    - If no suitable match is found (e.g., no product matches "CHAIN PULLEY" or "2100283612"), exclude from "matchedProducts".
    - Avoid false positives by penalizing low semantic similarity or mismatched categories.
    - Include all database fields in matched products: maincategory_id, maincategory_name, subcategory_id, subcategory_name, product_id, product_name, detail_id, batch, description, size, hsncode, gstrate, listprice, moq.

- **Terms and Conditions**:
  - Extract from labeled sections (e.g., "Terms and Conditions") in HTML or forwarded sections.
  - Combine into a single string with newlines.
  - Set to null if not found.

- **Additional Rules**:
  - Set "is_contact_inquiry" to true for RFQs with product specs, PR No, or machine tools terms (e.g., "CHAIN PULLEY"). Set to false for spam.
  - Confidence: 0.9-0.95 for clear RFQs, 0.7-0.8 for partial data, <0.5 for spam.
  - Return valid JSON, prioritizing innermost forwarded section or body.
  - Preserve special characters in descriptions.
  - Handle malformed content gracefully.

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
                    max_tokens: 6000,
                    response_format: { type: "json_object" },
                },
                {
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${this.apiKey}`,
                        "HTTP-Referer": process.env.SITE_URL || "http://localhost:3000",
                        "X-Title": "Email Contact and Product Matcher",
                    },
                    timeout: 30000,
                }
            );

            let content = response?.data?.choices?.[0]?.message?.content || "";
            console.log("Raw AI response content:", content.substring(0, 500) + "...");
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            let jsonText = jsonMatch ? jsonMatch[0] : content;

            let extractedData;
            try {
                extractedData = JSON.parse(jsonText);
            } catch (parseError) {
                console.error("JSON parse error:", parseError, "Content:", content.substring(0, 500) + "...");
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
                    new_ic: product.new_ic || null,
                    description: product.description || null,
                    qty: product.qty ? parseInt(product.qty, 10) : null,
                    uom: product.uom || null,
                    unit: product.unit || null
                })) : [],
                matchedProducts: Array.isArray(extractedData.matchedProducts) ? extractedData.matchedProducts.map(product => ({
                    maincategory_id: product.maincategory_id || null,
                    maincategory_name: product.maincategory_name || null,
                    subcategory_id: product.subcategory_id || null,
                    subcategory_name: product.subcategory_name || null,
                    product_id: product.product_id || null,
                    product_name: product.product_name || null,
                    detail_id: product.detail_id || null,
                    batch: product.batch || null,
                    description: product.description || null,
                    size: product.size || null,
                    hsncode: product.hsncode || null,
                    gstrate: product.gstrate || null,
                    listprice: product.listprice || null,
                    moq: product.moq || null
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
        let matchedProductsCount = 0;

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

                console.log("AI Extracted:", JSON.stringify(extractedData, null, 2));
                processedCount++;

                if (extractedData.products.length > 0) {
                    console.log("Product Requirements Found:", extractedData.products);
                    productRequirementsCount++;
                } else {
                    console.log("No product requirements found in this email");
                }

                if (extractedData.matchedProducts.length > 0) {
                    console.log("Matched Products Found:", extractedData.matchedProducts);
                    matchedProductsCount += extractedData.matchedProducts.length;
                } else {
                    console.log("No matched products found for this email");
                }

                insertOrUpdateContact(extractedData, (err, result) => {
                    if (err) {
                        console.error("DB save error:", err);
                        return;
                    }
                    console.log(`Saved/Updated contact: ${extractedData.email}`);
                });
            } catch (error) {
                console.error("Error processing an email:", error.message);
            }
        }

        console.log(`\nProcessing complete: ${processedCount} contacts saved, ${filteredCount} emails filtered out, ${productRequirementsCount} product requirements found, ${matchedProductsCount} matched products saved`);

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
            matchedProducts: [],
            terms_conditions: null
        };

        insertOrUpdateContact(contactData, (err) => {
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
                has_matched_products: extracted.matchedProducts.length > 0
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

app.get("/api/contacts", (req, res) => {
    const sql = `
        SELECT l.id, l.lead_name, l.email, l.contact_number, l.lead_source, l.terms_conditions, l.created_at
        FROM emailleads l
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error("Error fetching contacts:", err);
            return res.status(500).json({ error: "Database error" });
        }

        const contactIds = results.map(contact => contact.id);
        const productSql = `
            SELECT p.lead_id, p.unit, p.pr_no, p.pr_date, p.legacy_code, p.item_code, p.item_description, p.uom, p.pr_quantity
            FROM emailproducts p
            WHERE p.lead_id IN (${contactIds.join(',')})
        `;
        const matchedProductSql = `
            SELECT 
                mp.lead_id, 
                mp.email_product_id, 
                mp.maincategory_id,
                mp.maincategory_name, 
                mp.subcategory_id,
                mp.subcategory_name, 
                mp.product_id,
                mp.product_name, 
                mp.detail_id,
                mp.batch, 
                mp.description, 
                mp.size, 
                mp.hsncode, 
                mp.gstrate, 
                mp.listprice, 
                mp.moq, 
                mp.created_at
            FROM matched_products mp
            WHERE mp.lead_id IN (${contactIds.join(',')})
        `;

        db.query(productSql, (err, productResults) => {
            if (err) {
                console.error("Error fetching products:", err);
                return res.status(500).json({ error: "Database error" });
            }

            db.query(matchedProductSql, (err, matchedProductResults) => {
                if (err) {
                    console.error("Error fetching matched products:", err);
                    return res.status(500).json({ error: "Database error" });
                }

                const productsByLeadId = productResults.reduce((acc, product) => {
                    if (!acc[product.lead_id]) {
                        acc[product.lead_id] = [];
                    }
                    acc[product.lead_id].push(product);
                    return acc;
                }, {});

                const matchedProductsByLeadId = matchedProductResults.reduce((acc, product) => {
                    if (!acc[product.lead_id]) {
                        acc[product.lead_id] = [];
                    }
                    acc[product.lead_id].push(product);
                    return acc;
                }, {});

                results.forEach(contact => {
                    contact.products = productsByLeadId[contact.id] || [];
                    contact.matched_products = matchedProductsByLeadId[contact.id] || [];
                });

                res.json(results);
            });
        });
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
console.log(`AI Confidence Threshold: ${openRouterAI.minConfidence}, Match Confidence Threshold: ${openRouterAI.matchConfidenceThreshold}`);
fetchAndProcessEmails();

// =========================
// START SERVER
// =========================
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));