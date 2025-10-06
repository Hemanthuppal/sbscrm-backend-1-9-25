
const express = require('express');
const router = express.Router();
const db = require('./../../Config/db');


router.get("/contacts", async (req, res) => {
  try {
    const [results] = await db.query(`
      SELECT l.id, l.lead_name, l.email, l.contact_number, l.lead_source, l.terms_conditions, l.created_at,
      l.status
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

// API 1: Fetch contacts with status = 'New'
router.get("/contacts/new", async (req, res) => {
  try {
    const [results] = await db.query(`
      SELECT l.id, l.lead_name, l.email, l.contact_number, l.lead_source, l.terms_conditions, l.created_at,
      l.status
      FROM emailleads l  
      WHERE l.status != 'Qualified'
      ORDER BY l.created_at DESC
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
    console.error("Error fetching contacts (New):", err);
    res.status(500).json({ error: "Database error" });
  }
});


// API 2: Fetch contacts with status = 'Qualified'
router.get("/contacts/qualified", async (req, res) => {
  try {
    const [results] = await db.query(`
      SELECT l.id, l.lead_name, l.email, l.contact_number, l.lead_source, l.terms_conditions, l.created_at,
      l.status, l.opp_status,l.quotation_status,l.message_id, l.quotation_body
      FROM emailleads l  
      WHERE l.status = 'Qualified'
      ORDER BY l.created_at DESC
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
    console.error("Error fetching contacts (Qualified):", err);
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
      SELECT l.id, l.lead_name, l.email, l.contact_number, l.lead_source, l.terms_conditions, l.created_at, l.assigned_by, l.assigned_to,
      l.status
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

router.get('/contacts/new/:userid', async (req, res) => {
  try {
    const { userid } = req.params;

    if (!userid || isNaN(userid)) {
      return res.status(400).json({ message: 'Invalid userId' });
    }

    const [results] = await db.query(`
      SELECT l.id, l.lead_name, l.email, l.contact_number, l.lead_source, l.terms_conditions, 
             l.created_at, l.assigned_by, l.assigned_to, l.status
      FROM emailleads l
      LEFT JOIN employees e ON l.assigned_to = e.id
      WHERE (l.assigned_to = ? OR e.managerId = ?)
      AND l.status != 'Qualified'
      ORDER BY l.created_at DESC
    `, [userid, userid]);

    if (results.length === 0) {
      return res.json([]);
    }

    const contactIds = results.map(contact => contact.id);

    const [productResults] = await db.query(`
      SELECT p.lead_id, p.unit, p.pr_no, p.pr_date, p.legacy_code, p.item_code, 
             p.item_description, p.uom, p.pr_quantity
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
    console.error('Error fetching contacts (New):', err);
    res.status(500).json({ error: 'Database error' });
  }
});


router.get('/contacts/qualified/:userid', async (req, res) => {
  try {
    const { userid } = req.params;

    if (!userid || isNaN(userid)) {
      return res.status(400).json({ message: 'Invalid userId' });
    }

    const [results] = await db.query(`
      SELECT l.id, l.lead_name, l.email, l.contact_number, l.lead_source, l.terms_conditions, 
             l.created_at, l.assigned_by, l.assigned_to, l.status, l.opp_status,l.quotation_status,l.message_id, l.quotation_body
      FROM emailleads l
      LEFT JOIN employees e ON l.assigned_to = e.id
      WHERE (l.assigned_to = ? OR e.managerId = ?)
      AND l.status = 'Qualified'
      ORDER BY l.created_at DESC
    `, [userid, userid]);

    if (results.length === 0) {
      return res.json([]);
    }

    const contactIds = results.map(contact => contact.id);

    const [productResults] = await db.query(`
      SELECT p.lead_id, p.unit, p.pr_no, p.pr_date, p.legacy_code, p.item_code, 
             p.item_description, p.uom, p.pr_quantity
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
    console.error('Error fetching contacts (Qualified):', err);
    res.status(500).json({ error: 'Database error' });
  }
});


router.put('/contacts/:leadId/status', async (req, res) => {
  const { leadId } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ message: 'status is required' });
  }

  try {
    // Validate lead exists
    const [leadExists] = await db.query('SELECT id FROM emailleads WHERE id = ?', [leadId]);
    if (leadExists.length === 0) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    // Validate status value
    const validStatuses = ['New', 'Qualified', 'Not Qualified', 'Loss'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    // Update only the lead status
    const updateQuery = 'UPDATE emailleads SET status = ? WHERE id = ?';
    
    await db.query(updateQuery, [status, leadId]);

    res.json({
      message: 'Status updated successfully',
      data: { id: leadId, status: status }
    });

  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update Opportunity Status
router.put('/contacts/:leadId/opp-status', async (req, res) => {
  const { leadId } = req.params;
  const { opp_status } = req.body;

  if (!opp_status) {
    return res.status(400).json({ message: 'opp_status is required' });
  }

  try {
    // Validate lead exists
    const [leadExists] = await db.query('SELECT id FROM emailleads WHERE id = ?', [leadId]);
    if (leadExists.length === 0) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    // Valid Opportunity Status values
    const validOppStatuses = [
      'Prospecting',
      'Proposal Sent',
      'Negotiation',
      'Regret',
      'Closed Won',
      'Closed Lost',
      'On Hold'
    ];

    if (!validOppStatuses.includes(opp_status)) {
      return res.status(400).json({ message: 'Invalid opportunity status value' });
    }

    // Update opp_status
    const updateQuery = 'UPDATE emailleads SET opp_status = ? WHERE id = ?';
    await db.query(updateQuery, [opp_status, leadId]);

    res.json({
      message: 'Opportunity status updated successfully',
      data: { id: leadId, opp_status }
    });
  } catch (error) {
    console.error('Error updating opportunity status:', error);
    res.status(500).json({ message: 'Server error' });
  }
});



router.get("/viewcontacts/:id", (req, res) => {
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






// -------------------- MAIN CATEGORIES --------------------
router.get('/main-categories', async (_req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        maincategory_id AS id,
        maincategory_name
      FROM main_category
      ORDER BY maincategory_name
    `);
    res.json(rows);
  } catch (err) {
    console.error('GET /api/main-categories error:', err);
    res.status(500).json({ code: err.code, message: err.message });
  }
});

// -------------------- SUB-CATEGORIES BY MAIN --------------------
router.get('/sub-categories/:mainId', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        subcategory_id AS id,
        subcategory_name,
        maincategory_id
      FROM sub_category
      WHERE maincategory_id = ?
      ORDER BY subcategory_name
    `, [req.params.mainId]);
    res.json(rows);
  } catch (err) {
    console.error('GET /api/sub-categories/:mainId error:', err);
    res.status(500).json({ code: err.code, message: err.message });
  }
});

// -------------------- PRODUCTS BY SUB-CATEGORY --------------------
router.get('/products/:subId', async (req, res) => {
  try {
    const subId = Number(req.params.subId);
    const [rows] = await db.query(`
      SELECT 
        d.detail_id,
        d.product_id,
        p.product_name,
        d.batch,
        d.description,
        d.size,
        d.hsncode,
        d.gstrate,
        d.listprice,
        d.moq,
        d.maincategory_id,
        d.subcategory_id
      FROM product_details d
      LEFT JOIN product_name p
        ON p.product_id = d.product_id
      WHERE d.subcategory_id = ?
      ORDER BY p.product_name, d.batch, d.size
    `, [subId]);

    res.json(rows);
  } catch (err) {
    console.error('GET /api/products/:subId error:', err);
    res.status(500).json({ code: err.code, message: err.message });
  }
});

// -------------------- CREATE LEAD --------------------
router.post('/newleads', async (req, res) => {
  const { lead_name, business_name, lead_source, contact_number, email, whatsapp_number, preferred_contact_method, terms_conditions, products } = req.body;
  console.log("Received lead data:", req.body);

  const connection = await db.getConnection(); 
  try {
    await connection.beginTransaction();

    // Insert into emailleads
    const [leadResult] = await connection.query(
      `INSERT INTO emailleads (lead_name, business_name, lead_source, contact_number, email, whatsapp_number, preferred_contact_method, terms_conditions, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [lead_name, business_name, lead_source, contact_number, email, whatsapp_number, preferred_contact_method, terms_conditions]
    );

    const lead_id = leadResult.insertId;

    // Insert into matched_products
    for (const product of products) {
      await connection.query(
        `INSERT INTO matched_products (lead_id, email_product_id, maincategory_name, subcategory_name, product_name, batch, description, size, hsncode, gstrate, listprice, moq, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          lead_id,
          product.detail_id,
          product.maincategory_name || '',
          product.subcategory_name || '',
          product.product_name,
          product.batch,
          product.description || '',
          product.size || '',
          product.hsncode || '',
          product.gstrate || 0,
          product.listprice || 0,
          product.quantity || 1,
        ]
      );
    }

    await connection.commit();
    res.status(201).json({ message: 'Lead created successfully', lead_id });
  } catch (err) {
    await connection.rollback();
    console.error('POST /api/newleads error:', err);
    res.status(500).json({ code: err.code, message: err.message });
  } finally {
    connection.release();
  }
});

// 📌 This api was used in Manager and Associate panel which stores user_id in assigned_to 
router.post('/newleads/manager', async (req, res) => {
  const { 
    lead_name, 
    business_name, 
    lead_source, 
    contact_number, 
    email, 
    whatsapp_number, 
    preferred_contact_method, 
    terms_conditions, 
    products,
    user_id    // 👈 Manager's user ID will come from frontend
  } = req.body;

  console.log("Received manager lead data:", req.body);

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Insert into emailleads with assigned_to (manager)
    const [leadResult] = await connection.query(
      `INSERT INTO emailleads 
       (lead_name, business_name, lead_source, contact_number, email, whatsapp_number, preferred_contact_method, terms_conditions, assigned_to, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [lead_name, business_name, lead_source, contact_number, email, whatsapp_number, preferred_contact_method, terms_conditions, user_id]
    );

    const lead_id = leadResult.insertId;

    // Insert matched products
    for (const product of products) {
      await connection.query(
        `INSERT INTO matched_products 
        (lead_id, email_product_id, maincategory_name, subcategory_name, product_name, batch, description, size, hsncode, gstrate, listprice, moq, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          lead_id,
          product.detail_id,
          product.maincategory_name || '',
          product.subcategory_name || '',
          product.product_name,
          product.batch,
          product.description || '',
          product.size || '',
          product.hsncode || '',
          product.gstrate || 0,
          product.listprice || 0,
          product.quantity || 1,
        ]
      );
    }

    await connection.commit();
    res.status(201).json({ message: 'Lead created successfully (Manager)', lead_id });
  } catch (err) {
    await connection.rollback();
    console.error('POST /api/newleads/manager error:', err);
    res.status(500).json({ code: err.code, message: err.message });
  } finally {
    connection.release();
  }
});


// -------------------- UPDATE LEAD --------------------
router.put('/leads/:id', async (req, res) => {
  const { id } = req.params;
  const { lead_name, business_name, lead_source, contact_number, email, whatsapp_number, preferred_contact_method, terms_conditions, products } = req.body;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Update emailleads
    await connection.query(
      `UPDATE emailleads SET lead_name = ?, business_name = ?, lead_source = ?, contact_number = ?, email = ?, whatsapp_number = ?, preferred_contact_method = ?, terms_conditions = ?
       WHERE id = ?`,
      [lead_name, business_name, lead_source, contact_number, email, whatsapp_number, preferred_contact_method, terms_conditions, id]
    );

    // Delete old products
    await connection.query('DELETE FROM matched_products WHERE lead_id = ?', [id]);

    // Insert updated products
    for (const product of products) {
      await connection.query(
        `INSERT INTO matched_products (lead_id, email_product_id, maincategory_name, subcategory_name, product_name, batch, description, size, hsncode, gstrate, listprice, moq, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          id,
          product.detail_id,
          product.maincategory_name || '',
          product.subcategory_name || '',
          product.product_name,
          product.batch,
          product.description || '',
          product.size || '',
          product.hsncode || '',
          product.gstrate || 0,
          product.listprice || 0,
          product.quantity || 1,
        ]
      );
    }

    await connection.commit();
    res.json({ message: 'Lead updated successfully' });
  } catch (err) {
    await connection.rollback();
    console.error('PUT /api/leads/:id error:', err);
    res.status(500).json({ code: err.code, message: err.message });
  } finally {
    connection.release();
  }
});

// -------------------- GET LEAD --------------------
router.get('/leads/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [leadRows] = await db.query('SELECT * FROM emailleads WHERE id = ?', [id]);
    if (leadRows.length === 0) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    const [productRows] = await db.query('SELECT * FROM matched_products WHERE lead_id = ?', [id]);

    const lead = {
      ...leadRows[0],
      products: productRows.map((p) => ({
        detail_id: p.email_product_id,
        maincategory_name: p.maincategory_name,
        subcategory_name: p.subcategory_name,
        product_name: p.product_name,
        batch: p.batch,
        description: p.description,
        size: p.size,
        hsncode: p.hsncode,
        gstrate: p.gstrate,
        listprice: p.listprice,
        quantity: p.moq,
      })),
    };

    res.json(lead);
  } catch (err) {
    console.error('GET /api/leads/:id error:', err);
    res.status(500).json({ code: err.code, message: err.message });
  }
});

router.get('/leads/:id/terms-conditions', async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query('SELECT terms_conditions FROM emailleads WHERE id = ?', [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'Lead not found' 
      });
    }

    res.status(200).json({
      success: true,
      data: {
        terms_conditions: rows[0].terms_conditions
      }
    });
    
  } catch (err) {
    console.error('GET /api/leads/:id/terms-conditions error:', err);
    res.status(500).json({ 
      success: false,
      code: err.code, 
      message: err.message 
    });
  }
});

// PUT API to update terms_conditions
router.put('/leads/:id/terms-conditions', async (req, res) => {
  const { id } = req.params;
  const { terms_conditions } = req.body;
  
  try {
    // Validate input
    if (!terms_conditions || typeof terms_conditions !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Valid terms_conditions are required'
      });
    }

    const [result] = await db.query(
      'UPDATE emailleads SET terms_conditions = ? WHERE id = ?',
      [terms_conditions, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Terms & conditions updated successfully',
      data: {
        terms_conditions
      }
    });
    
  } catch (err) {
    console.error('PUT /api/leads/:id/terms-conditions error:', err);
    res.status(500).json({ 
      success: false,
      code: err.code, 
      message: err.message 
    });
  }
});

// GET Quotation Body
router.get('/leads/:id/quotation-body', async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query('SELECT quotation_body FROM emailleads WHERE id = ?', [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'Lead not found' 
      });
    }

    res.status(200).json({
      success: true,
      data: {
        quotation_body: rows[0].quotation_body
      }
    });
    
  } catch (err) {
    console.error('GET /api/leads/:id/quotation-body error:', err);
    res.status(500).json({ 
      success: false,
      code: err.code, 
      message: err.message 
    });
  }
});

// PUT Quotation Body
router.put('/leads/:id/quotation-body', async (req, res) => {
  const { id } = req.params;
  const { quotation_body } = req.body;
  
  try {
    // Validate input
    if (!quotation_body || typeof quotation_body !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Valid quotation_body is required'
      });
    }

    const [result] = await db.query(
      'UPDATE emailleads SET quotation_body = ? WHERE id = ?',
      [quotation_body, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Quotation body updated successfully',
      data: {
        quotation_body
      }
    });
    
  } catch (err) {
    console.error('PUT /api/leads/:id/quotation-body error:', err);
    res.status(500).json({ 
      success: false,
      code: err.code, 
      message: err.message 
    });
  }
});



router.delete("/contacts/:leadId", async (req, res) => {
  const { leadId } = req.params;

  let connection;
  try {
    // Get a connection from the pool
    connection = await db.getConnection();

    // Begin transaction
    await connection.beginTransaction();

    // 1. Delete from emailproducts
    await connection.query("DELETE FROM emailproducts WHERE lead_id = ?", [leadId]);

    // 2. Delete from matched_products
    await connection.query("DELETE FROM matched_products WHERE lead_id = ?", [leadId]);

    // 3. Delete from emailleads
    const [result] = await connection.query(
      "DELETE FROM emailleads WHERE id = ?",
      [leadId]
    );

    if (result.affectedRows === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ message: "Lead not found" });
    }

    // Commit transaction
    await connection.commit();
    connection.release();

    res.json({ message: "Lead and related data deleted successfully" });
  } catch (error) {
    console.error("Error deleting lead:", error);
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    res.status(500).json({ message: "Failed to delete lead" });
  }
});



module.exports = router;