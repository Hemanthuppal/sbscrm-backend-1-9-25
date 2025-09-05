require("dotenv").config();
const imaps = require("imap-simple");
const { simpleParser } = require("mailparser");
const axios = require("axios");
const db = require("../Config/db");
const prompt = require("../Aiprompt/Aiprompt");

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

  try {
    const [results] = await db.query(sqlMatch, params);
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
    return {
      matches,
      is_ambiguous: matches.length > 1 && !nProduct.item_code
    };
  } catch (err) {
    console.error("Error matching product:", err);
    throw err;
  }
}

async function insertOrUpdateContact(data) {
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

  try {
    const [result] = await db.query(sqlLead, paramsLead);
    const leadId = result.insertId;

    if (!Array.isArray(data.products) || data.products.length === 0) {
      return { leadId, matchedProducts: [] };
    }

    let insertedProducts = 0;
    const matchedProducts = [];

    for (const product of data.products) {
      const nProduct = normalizeProduct(product);
      try {
        const { matches, is_ambiguous } = await matchProductWithDatabase(product);
        
        // Insert into emailproducts
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

        const [productResult] = await db.query(sqlProduct, paramsProduct);
        const productId = productResult.insertId;

        // Store matched products in matched_products table
        for (const match of matches) {
          const sqlMatchedProduct = `
            INSERT INTO matched_products 
              (lead_id, email_product_id, maincategory_name, subcategory_name, product_name, 
               batch, description, size, hsncode, gstrate, listprice, moq, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;

          const paramsMatchedProduct = [
            leadId,
            productId,
            match.maincategory_name,
            match.subcategory_name,
            match.product_name,
            match.batch,
            match.description,
            match.size,
            match.hsncode,
            match.gstrate,
            match.listprice,
            match.moq,
            match.created_at
          ];

          await db.query(sqlMatchedProduct, paramsMatchedProduct);
        }

        matchedProducts.push({
          emailProduct: { ...nProduct, is_ambiguous },
          matchedDbProducts: matches,
        });

        insertedProducts++;
      } catch (matchErr) {
        console.error("Product matching error:", matchErr);
        insertedProducts++;
      }
    }

    return { leadId, matchedProducts };
  } catch (err) {
    console.error("DB save error:", err);
    throw err;
  }
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
    connection = await imaps.connect({
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
      }
    });
    await connection.openBox("INBOX");

    const searchCriteria = ["UNSEEN"];
    const fetchOptions = {
      bodies: ["HEADER", "TEXT"],
      markSeen: true,
    };

    const messages = await connection.search(searchCriteria, fetchOptions);
    console.log(`Found ${messages.length} new email(s) to process`);

    for (const message of messages) {
      try {
        const header = message.parts.find((p) => p.which === "HEADER")?.body;
        const text = message.parts.find((p) => p.which === "TEXT")?.body;

        const parsed = await simpleParser(text || message.parts.map(p => p.body || '').join('\n') || '');
        const { fromEmail, fromName, subject } = getEmailInfo(parsed, header);
        const emailBody = text || message.parts.map(p => p.body || '').join('\n') || '';

        console.log(`Processing email from ${fromName} <${fromEmail}>, Subject: ${subject}`);

        const extractedData = await openRouterAI.extractContactInfo(
          emailBody,
          subject,
          fromEmail,
          fromName
        );

        if (!extractedData) {
          console.log("Email filtered out - not a contact inquiry");
          continue;
        }

        console.log("AI Extracted:", JSON.stringify(extractedData, null, 2));

        const { leadId, matchedProducts } = await insertOrUpdateContact(extractedData);
        console.log(`Saved contact: ${extractedData.email}, Lead ID: ${leadId}`);
        if (matchedProducts.length > 0) {
          console.log("Matched Products:", JSON.stringify(matchedProducts, null, 2));
        }
      } catch (error) {
        console.error("Error processing email:", error.message);
      }
    }

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

module.exports = { fetchAndProcessEmails };