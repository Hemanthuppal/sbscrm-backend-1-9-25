// Routes/APIs/apiRoutes.js
const express = require('express');
const router = express.Router();
const db = require('../../Config/db');
const { insertOrUpdateContact } = require('../../Aiprompt/Helper');
const openRouterAI = require('../../Aiprompt/Aiprompt');

router.post('/submit', (req, res) => {
    const { name, email, mobile, message } = req.body || {};
    try {
        const contactData = {
            name: name || 'Unknown',
            email: email || 'unknown@example.com',
            mobile: mobile || null,
            source: 'website_form',
            products: [],
            matchedProducts: [],
            terms_conditions: null
        };

        insertOrUpdateContact(contactData, (err) => {
            if (err) {
                console.error('DB error:', err);
                return res.status(500).send('DB error');
            }
            return res.send('Form submitted successfully!');
        });
    } catch (error) {
        console.error('Submit error:', error);
        res.status(500).send('Error submitting form');
    }
});

router.post('/test-email', async (req, res) => {
    const { emailContent, subject, fromEmail, fromName } = req.body || {};

    try {
        const cleanSubject = subject || 'No Subject';
        const cleanFromEmail = fromEmail || 'unknown@example.com';
        const cleanFromName = fromName || 'Unknown';

        const extracted = await openRouterAI.extractContactInfo(
            emailContent || '',
            cleanSubject,
            cleanFromEmail,
            cleanFromName
        );

        if (!extracted) {
            return res.json({
                ok: true,
                filtered: true,
                message: 'Email was filtered out (not a contact inquiry)'
            });
        }

        insertOrUpdateContact(extracted, (err, result) => {
            if (err) {
                console.error('DB error:', err);
                return res.status(500).json({ ok: false, error: 'DB error' });
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
        console.error('test-email error:', e);
        res.status(500).json({ ok: false, error: e.message });
    }
});

router.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        ai_configured: !!process.env.OPENROUTER_API_KEY,
        db_connected: db !== null,
        mail_configured: !!process.env.MAIL_USER
    });
});

router.get('/contacts', async (req, res) => {
    try {
        const [results] = await db.query(`
            SELECT l.id, l.lead_name, l.email, l.contact_number, l.lead_source, l.terms_conditions, l.created_at
            FROM emailleads l
        `);

        const contactIds = results.map(contact => contact.id);
        const [productResults] = await db.query(`
            SELECT p.lead_id, p.unit, p.pr_no, p.pr_date, p.legacy_code, p.item_code, p.item_description, p.uom, p.pr_quantity
            FROM emailproducts p
            WHERE p.lead_id IN (${contactIds.length ? contactIds.join(',') : '0'})
        `);
        const [matchedProductResults] = await db.query(`
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
            WHERE mp.lead_id IN (${contactIds.length ? contactIds.join(',') : '0'})
        `);

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
    } catch (err) {
        console.error('Error fetching contacts:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

module.exports = router;