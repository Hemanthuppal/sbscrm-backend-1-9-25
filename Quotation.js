// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();
app.use(cors());
app.use(express.json());

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'sbs_crm_new', // <- ensure this matches your DB
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Health
app.get('/api/health', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 AS ok');
    res.json({ ok: true, rows });
  } catch (err) {
    console.error('DB health error:', err);
    res.status(500).json({ code: err.code, message: err.message });
  }
});

// MAIN CATEGORIES  (alias PK -> id)
app.get('/api/main-categories', async (_req, res) => {
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

// SUB-CATEGORIES BY MAIN  (alias PK -> id)
app.get('/api/sub-categories/:mainId', async (req, res) => {
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
// product_name.product_id  <->  product_details.product_id
// /api/products/:subId  — safer query
app.get('/api/products/:subId', async (req, res) => {
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


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`API running on :${PORT}`));
