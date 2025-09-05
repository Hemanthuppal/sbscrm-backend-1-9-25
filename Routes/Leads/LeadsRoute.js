
const express = require('express');
const router = express.Router();
const db = require('./../../Config/db');


router.get("/contacts", async (req, res) => {
  try {
    const [results] = await db.query(`
      SELECT l.id, l.lead_name, l.email, l.contact_number, l.lead_source, l.terms_conditions, l.created_at
      FROM emailleads l  ORDER BY l.created_at DESC
    `);

    if (results.length === 0) {
      return res.json([]);
    }

    const contactIds = results.map(contact => contact.id);

    const [productResults] = await db.query(`
      SELECT p.lead_id, p.unit, p.pr_no, p.pr_date, p.legacy_code, p.item_code, p.item_description, p.uom, p.pr_quantity
      FROM emailproducts p
      WHERE p.lead_id IN (?)
    `, [contactIds]);

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
  } catch (err) {
    console.error("Error fetching contacts:", err);
    res.status(500).json({ error: "Database error" });
  }
});


//manager
router.get('/contacts/:userid', async (req, res) => {
  try {
    const { userid } = req.params;

    if (!userid || isNaN(userid)) {
      return res.status(400).json({ message: 'Invalid userId' });
    }

    const [results] = await db.query(`
      SELECT l.id, l.lead_name, l.email, l.contact_number, l.lead_source, l.terms_conditions, l.created_at, l.assigned_by, l.assigned_to
      FROM emailleads l
      LEFT JOIN employees e ON l.assigned_to = e.id
      WHERE l.assigned_to = ? OR e.managerId = ?
    `, [userid, userid]);

    if (results.length === 0) {
      return res.json([]);
    }

    const contactIds = results.map(contact => contact.id);

    const [productResults] = await db.query(`
      SELECT p.lead_id, p.unit, p.pr_no, p.pr_date, p.legacy_code, p.item_code, p.item_description, p.uom, p.pr_quantity
      FROM emailproducts p
      WHERE p.lead_id IN (?)
    `, [contactIds]);

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
  } catch (err) {
    console.error('Error fetching contacts:', err);
    res.status(500).json({ error: 'Database error' });
  }
});


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

router.get('/categories', async (req, res) => {
  try {
    const [result] = await db.query('SELECT DISTINCT category FROM products ORDER BY category');
    const categories = result.map((row, index) => ({
      id: index + 1,
      name: row.category,
    }));
    res.json(categories);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Get products by category
router.get('/products', async (req, res) => {
  const { category } = req.query;
  if (!category) return res.status(400).json({ error: 'Category is required' });

  try {
    const [result] = await db.query(
      'SELECT id, description, cat_nr FROM products WHERE category = ?',
      [category]
    );
    const products = result.map(product => ({
      id: product.id,
      name: `${product.description} (${product.cat_nr})`,
    }));
    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});


module.exports = router;