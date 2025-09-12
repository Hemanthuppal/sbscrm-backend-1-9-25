// utils/openRouterAI.js
require('dotenv').config();
const axios = require('axios');
const { fetchDatabaseProducts } = require('./Helper');

class OpenRouterAI {
    constructor() {
        this.apiKey = process.env.OPENROUTER_API_KEY;
        this.apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
        this.model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
        this.minConfidence = parseFloat(process.env.AI_MIN_CONFIDENCE) || 0.5;
        this.matchConfidenceThreshold = 0.9;
    }

    async extractContactInfo(emailContent, subject, fromEmail, fromName) {
        if (!this.apiKey) {
            console.error('OpenRouter API key not found');
            return null;
        }

        let dbProducts;
        try {
            dbProducts = await fetchDatabaseProducts();
        } catch (err) {
            console.error('Failed to fetch database products:', err);
            dbProducts = [];
        }

        const prompt = {
            role: 'user',
            content: `
ANALYZE THIS RAW EMAIL CONTENT AND EXTRACT CONTACT AND PRODUCT INFORMATION, THEN MATCH PRODUCTS WITH DATABASE PRODUCTS IN JSON FORMAT:

Return a valid JSON object with contact details, extracted product details, and matched products from the provided database products. Only include matches with high confidence (> ${this.matchConfidenceThreshold}) based on strict semantic and field-based matching. Exclude unmatched products from matchedProducts.

EMAIL DETAILS:
- Subject: ${subject || 'No Subject'}
- From: ${fromName || 'Unknown'} <${fromEmail || 'unknown@example.com'}>

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
${emailContent || 'No content'}
            `
        };

        try {
            const response = await axios.post(
                this.apiUrl,
                {
                    model: this.model,
                    messages: [prompt],
                    temperature: 0.1,
                    max_tokens: 6000,
                    response_format: { type: 'json_object' }
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${this.apiKey}`,
                        'HTTP-Referer': process.env.SITE_URL || 'http://localhost:3000',
                        'X-Title': 'Email Contact and Product Matcher'
                    },
                    timeout: 30000
                }
            );

            let content = response?.data?.choices?.[0]?.message?.content || '';
            console.log('Raw AI response content:', content.substring(0, 500) + '...');
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            let jsonText = jsonMatch ? jsonMatch[0] : content;

            let extractedData;
            try {
                extractedData = JSON.parse(jsonText);
            } catch (parseError) {
                console.error('JSON parse error:', parseError, 'Content:', content.substring(0, 500) + '...');
                return null;
            }

            const isContactInquiry = extractedData.is_contact_inquiry === true;
            const confidence = parseFloat(extractedData.confidence) || 0;

            if (!isContactInquiry || confidence < this.minConfidence) {
                console.log(`Email filtered out - Is contact: ${isContactInquiry}, Confidence: ${confidence}`);
                return null;
            }

            return {
                name: extractedData.name || fromName || 'Unknown',
                email: extractedData.email || fromEmail || 'unknown@example.com',
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
                source: extractedData.source || 'Email',
                confidence: confidence,
                is_contact: isContactInquiry
            };
        } catch (err) {
            console.error('OpenRouter AI Error:', err?.response?.data || err.message);
            return null;
        }
    }
}

module.exports = new OpenRouterAI();