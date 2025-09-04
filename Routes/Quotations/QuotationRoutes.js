const express = require('express');
const router = express.Router();
const db = require('./../../Config/db'); // <-- using shared DB connection

// Health
router.get('/health', async (_req, res) => {
  try {
    const [rows] = await db.query('SELECT 1 AS ok');
    res.json({ ok: true, rows });
  } catch (err) {
    console.error('DB health error:', err);
    res.status(500).json({ code: err.code, message: err.message });
  }
});

// MAIN CATEGORIES
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
    console.error('GET /main-categories error:', err);
    res.status(500).json({ code: err.code, message: err.message });
  }
});

// SUB-CATEGORIES BY MAIN
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
    console.error('GET /sub-categories/:mainId error:', err);
    res.status(500).json({ code: err.code, message: err.message });
  }
});

// PRODUCTS BY SUB-CATEGORY
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
    console.error('GET /products/:subId error:', err);
    res.status(500).json({ code: err.code, message: err.message });
  }
});

module.exports = router;
