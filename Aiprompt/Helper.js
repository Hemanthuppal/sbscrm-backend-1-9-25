// utils/helpers.js
const db = require('../Config/db');

function normalizePhone(raw) {
    if (!raw) return null;
    const digits = (raw + '').replace(/\D/g, '');
    if (digits.length >= 10) return digits.slice(-10);
    return digits || null;
}

function normalizeLead(data) {
    return {
        lead_name: (data.name || 'Unknown').trim(),
        email: (data.email || 'unknown@example.com').toLowerCase().trim(),
        contact_number: normalizePhone(data.mobile),
        lead_source: data.source || 'Email',
        terms_conditions: data.terms_conditions || null
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
        pr_quantity: product.qty ? parseInt(product.qty, 10) : null
    };
}

async function fetchDatabaseProducts() {
    try {
        const [results] = await db.query(`
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
        `);
        console.log(`Fetched ${results.length} database products`);
        return results;
    } catch (err) {
        console.error('Error fetching database products:', err);
        throw err;
    }
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
        nLead.terms_conditions
    ];

    try {
        const [result] = await db.query(sqlLead, paramsLead);
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
                nProduct.pr_quantity
            ];

            console.log(`Inserting email product ${index + 1}:`, paramsProduct);

            const [productResult] = await db.query(sqlProduct, paramsProduct);
            const emailProductId = productResult.insertId;

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
                    matchedProduct.moq || null
                ];

                console.log(`Inserting matched product ${index + 1} for lead ${leadId}:`, paramsMatched);

                await db.query(sqlMatched, paramsMatched);
                console.log(`Inserted matched product ${index + 1} for lead ${leadId}`);
            } else {
                console.log(`No matched product for email product ${index + 1}:`, nProduct);
            }

            insertedProducts++;
            if (insertedProducts === data.products.length) {
                callback(null, result);
            }
        }
    } catch (err) {
        console.error('Error inserting lead:', err);
        callback(err);
    }
}

module.exports = {
    normalizePhone,
    normalizeLead,
    normalizeProduct,
    fetchDatabaseProducts,
    insertOrUpdateContact
};