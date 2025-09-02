// routes/leadRoutes.js
const express = require('express');
const router = express.Router();
const db = require('./../../Config/db');

// Get leads
router.get("/contacts/:id", (req, res) => {
    const contactId = req.params.id;

    const sql = `
        SELECT l.id, l.lead_name, l.email, l.contact_number, l.lead_source, l.terms_conditions, l.created_at
        FROM emailleads l
        WHERE l.id = ?
    `;

    db.query(sql, [contactId], (err, results) => {
        if (err) {
            console.error("Error fetching contact:", err);
            return res.status(500).json({ error: "Database error" });
        }

        if (results.length === 0) {
            return res.status(404).json({ error: "Contact not found" });
        }

        // Fetch products for this contact
        const productSql = `
            SELECT p.lead_id, p.unit, p.pr_no, p.pr_date, p.legacy_code, 
                   p.item_code, p.item_description, p.uom, p.pr_quantity
            FROM emailproducts p
            WHERE p.lead_id = ?
        `;

        db.query(productSql, [contactId], (err, productResults) => {
            if (err) {
                console.error("Error fetching products:", err);
                return res.status(500).json({ error: "Database error" });
            }

            // Attach products to the contact
            const contact = results[0];
            contact.products = productResults || [];

            res.json(contact);
        });
    });
});



module.exports = router;