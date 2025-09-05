const prompt = {
  role: "user",
  content: `
ANALYZE THIS RAW EMAIL CONTENT AND EXTRACT CONTACT AND PRODUCT INFORMATION IN JSON FORMAT:

Return a valid JSON object with contact and product details extracted from the raw email content, including headers, forwarded sections, HTML, and multi-part MIME structures, without any preprocessing. Handle cases with minimal or common details (e.g., product name, brand, quantity) that may match multiple database products, lacking unique identifiers (e.g., model number, HSN code).

EMAIL DETAILS:
- Subject: \${subject || "No Subject"}
- From: \${fromName || "Unknown"} <\${fromEmail || "unknown@example.com"}>

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
  - Use top-level sender (\${fromName}, \${fromEmail}) only if no valid contact info is found in forwarded sections or body.
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
\${emailContent || "No content"}
  `,
};

module.exports = prompt;