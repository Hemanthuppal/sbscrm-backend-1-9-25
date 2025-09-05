// server.js (or your backend entry file)
const express = require('express');
const mysql = require('mysql2/promise');

const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const dbConfig = {
   host: 'localhost',
  user: 'root',
  password: '', 
  database: 'sbs_crm_new',
};

const pool = mysql.createPool(dbConfig);



// MAIN CATEGORIES (alias PK -> id)
app.get('/api/main-categories',  async (_req, res) => {
  try {
    const [rows] = await pool.query(`
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

// SUB-CATEGORIES BY MAIN (alias PK -> id)
app.get('/api/sub-categories/:mainId',  async (req, res) => {
  try {
    const [rows] = await pool.query(`
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

// PRODUCTS BY SUB-CATEGORY
app.get('/api/products/:subId',  async (req, res) => {
  try {
    const subId = Number(req.params.subId); // ensure numeric
    const [rows] = await pool.query(`
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

// Create Lead
app.post('/api/newleads',  async (req, res) => {
  const { lead_name, business_name, lead_source, contact_number, email, whatsapp_number, preferred_contact_method, terms_conditions, products } = req.body;
console.log("Received lead data:", req.body);
  try {
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Insert into emailleads (without assigned_by and assigned_to)
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
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error('POST /api/leads error:', err);
    res.status(500).json({ code: err.code, message: err.message });
  }
});

// Update Lead
app.put('/api/leads/:id',  async (req, res) => {
  const { id } = req.params;
  const { lead_name, business_name, lead_source, contact_number, email, whatsapp_number, preferred_contact_method, terms_conditions, products } = req.body;

  try {
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Update emailleads (without assigned_by and assigned_to)
      await connection.query(
        `UPDATE emailleads SET lead_name = ?, business_name = ?, lead_source = ?, contact_number = ?, email = ?, whatsapp_number = ?, preferred_contact_method = ?, terms_conditions = ?
         WHERE id = ?`,
        [lead_name, business_name, lead_source, contact_number, email, whatsapp_number, preferred_contact_method, terms_conditions, id]
      );

      // Delete existing products for this lead
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
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error('PUT /api/leads/:id error:', err);
    res.status(500).json({ code: err.code, message: err.message });
  }
});

// Get Lead (for editing)
app.get('/api/leads/:id',  async (req, res) => {
  const { id } = req.params;
  try {
    const [leadRows] = await pool.query('SELECT * FROM emailleads WHERE id = ?', [id]);
    if (leadRows.length === 0) {
      return res.status(404).json({ message: 'Lead not found' });
    }
    const [productRows] = await pool.query('SELECT * FROM matched_products WHERE lead_id = ?', [id]);
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


app.listen(4000, () => {
  console.log('Server running on port 4000');
});