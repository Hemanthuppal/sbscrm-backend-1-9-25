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

    db.query(sqlLead, paramsLead, (err, result) => {
        if (err) {
            console.error("Error inserting lead:", err);
            return callback(err);
        }
        const leadId = result.insertId;

        if (!Array.isArray(data.products) || data.products.length === 0) {
            return callback(null, result);
        }

        let insertedProducts = 0;
        data.products.forEach((product, index) => {
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

            console.log(`Inserting product ${index + 1}:`, paramsProduct);

            db.query(sqlProduct, paramsProduct, (err) => {
                if (err) {
                    console.error(`Error inserting product ${index + 1}:`, err);
                    return;
                }
                insertedProducts++;
                if (insertedProducts === data.products.length) {
                    callback(null, result);
                }
            });
        });
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

Return a valid JSON object with contact and product details extracted from the raw email content, including headers, forwarded sections, HTML, and multi-part MIME structures, without any preprocessing.

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
  "terms_conditions": "<Terms and Conditions or null>",
  "source": "Email",
  "confidence": <Confidence Score 0.0-1.0>,
  "is_contact_inquiry": <Boolean>
}

**Instructions**:
- **Email Content Analysis**:
  - Process the raw email content as provided, including headers (e.g., "From:", "Date:"), forwarded sections (e.g., "---------- Forwarded message ---------"), HTML tags, and multi-part MIME structures (e.g., "Content-Type: text/plain").
  - Ignore MIME headers (e.g., "--00000000000089a93d063d795e0e") and focus on email body, headers, and forwarded sections.
  - Prioritize contact details (name, email, mobile) from the innermost forwarded section's sender (e.g., "From: Roza Sheikh <sbsroza1@gmail.com>", "ROZA SHEIKH - PH: 7879985320") or email body.
  - Use top-level sender (${fromName}, ${fromEmail}) only if no valid contact info is found in forwarded sections or body.
  - Extract contact info from signatures, body, or headers. Look for patterns like "Name:", "PH:", "E MAIL:", or phone numbers (e.g., "7879985320", "+91-7879985320", "PH - 7879985320").

- **Product Details Extraction**:
  - Identify product details from any part of the email, including headers, subject line, body, forwarded sections, or HTML. Look for table-like structures, key-value pairs, text listings, or patterns like "ITEM:", "Qty-", "RFQ-" (e.g., "RFQ-5000387076", "RFQ-11672325864").
  - Recognize machine tools-related terms (e.g., "HAMMER", "DRILL", "FLOODLIGHT", "BALL PEIN", "GROZ", "BPID/20/14").
  - Map fields to JSON:
    - "PR No" or "RFQ number" (e.g., "11672325864" or "5000387076") to "pr_no".
    - "PR Date" or date in headers/forwarded sections/body (e.g., "28-07-2025", "Fri, 29 Aug 2025 at 09:25") to "pr_date".
    - "Material Code" or "Legacy Code" (e.g., "461916000033", "M12345") to "legacy_code".
    - "Item Code", "New IC", or "MODEL NUMBER" (e.g., "BPID/20/14") to "new_ic".
    - "Description" or "Item Long Description" (e.g., "HAMMER,TYPE:BALL PEIN,HEAD WEIGHT:565 GMS,...") to "description".
    - "Quantity" or "Qty" (e.g., "12" from "Qty-12 Nos") to "qty" (as integer).
    - "UOM" (e.g., "NOS" from "Qty-12 Nos", "NUMBER") to "uom".
    - "Unit" (e.g., "MAINTENANCE") to "unit" if mentioned; else null.
  - Extract multiple products into "products" array if listed.
  - If no products, return empty "products" array.
  - Check subject line for product details (e.g., "RFQ-5000387076_HAMMER,BL PN,565GMS,MM:BPID/20/14").

- **Terms and Conditions**:
  - Extract from sections labeled "Terms and Conditions", "Special Instruction", or similar, even within HTML or forwarded sections (e.g., "TERMS AND CONDITIONS: Kindly ensure all terms are mentioned.").
  - Combine into a single string with newlines for numbered/listed terms.
  - Set to null if not found.

- **Additional Rules**:
  - Set "is_contact_inquiry" to true if the email contains RFQ, BOQ, product specs, PR No, Item Code, Quantity, UOM, or machine tools terms (e.g., "HAMMER", "DRILL", "GROZ", "BPID/20/14", "Qty-12 Nos"). Set to false only for clear spam (e.g., "newsletter", "unsubscribe" without products).
  - If "products" array has items or RFQ keywords are present, set "is_contact_inquiry" to true and "confidence" to at least 0.8.
  - Confidence: 0.9-0.95 for clear RFQs with detailed product info (e.g., "ITEM:", "Qty-"), 0.7-0.8 for partial data, <0.5 for ambiguous/spam content.
  - Return valid JSON, prioritizing innermost forwarded section or email body for contact and product details.
  - Preserve special characters in descriptions (e.g., ":", ",", ";").
  - Handle malformed, partial, or missing content gracefully, setting fields to null if not found.
  - Ensure complete extraction of product details, even for large descriptions or multiple products.

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
                    max_tokens: 5000, // Increased to handle large responses
                    response_format: { type: "json_object" },
                },
                {
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${this.apiKey}`,
                        "HTTP-Referer": process.env.SITE_URL || "http://localhost:3000",
                        "X-Title": "Email Contact Extractor",
                    },
                    timeout: 30000, // Increased timeout for larger inputs
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
                    new_ic: product.new_ic || null,
                    description: product.description || null,
                    qty: product.qty ? parseInt(product.qty, 10) : null,
                    uom: product.uom || null,
                    unit: product.unit || null
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
                has_product_requirements: extracted.products.length > 0
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

        db.query(productSql, (err, productResults) => {
            if (err) {
                console.error("Error fetching products:", err);
                return res.status(500).json({ error: "Database error" });
            }

            const productsByLeadId = productResults.reduce((acc, product) => {
                if (!acc[product.lead_id]) {
                    acc[product.lead_id] = [];
                }
                acc[product.lead_id].push(product);
                return acc;
            }, {});

            results.forEach(contact => {
                contact.products = productsByLeadId[contact.id] || [];
            });

            res.json(results);
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
        tlsOptions: { rejectUnauthorized: false },
        authTimeout: 10000,
    },
};

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