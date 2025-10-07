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


// Get latest quotation per lead_id with count, only sent quotations
router.get('/quotations', async (req, res) => {
  try {
    const [results] = await db.query(
      `SELECT q.*, counts.total_count
       FROM quotations q
       INNER JOIN (
         SELECT lead_id, MAX(created_at) AS latest_date, COUNT(*) AS total_count
         FROM quotations
         GROUP BY lead_id
       ) counts
       ON q.lead_id = counts.lead_id AND q.created_at = counts.latest_date
       WHERE q.sent_status = 1
       ORDER BY q.created_at DESC`
    );

    if (results.length === 0) {
      return res.status(404).json({ message: 'No sent quotations found' });
    }

    res.status(200).json(results);
  } catch (err) {
    console.error('Error fetching quotations:', err);
    res.status(500).json({ error: 'Failed to fetch quotations' });
  }
});


// Optional: single quotation by leadid (latest one)
router.get('/quotations/:leadid', async (req, res) => {
  const { leadid } = req.params;

  try {
    const [results] = await db.query(
      `SELECT *
       FROM quotations
       WHERE lead_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [leadid]
    );

    if (results.length === 0) {
      return res.status(404).json({ message: 'No quotations found for this lead_id' });
    }

    res.status(200).json(results[0]);
  } catch (err) {
    console.error('Error fetching quotation:', err);
    res.status(500).json({ error: 'Failed to fetch quotation' });
  }
});

// GET all email leads
router.get('/emaileads', async (req, res) => {
  const sql = `
    SELECT 
      id, 
      lead_name, 
      contact_number, 
      email, 
      lead_source, 
      terms_conditions 
    FROM emailleads
  `;

  try {
    const [results] = await db.query(sql); // promise style
    res.status(200).json({ success: true, data: results });
  } catch (err) {
    console.error('Database query error:', err);
    res.status(500).json({ success: false, error: 'Database query failed' });
  }
});

// GET single email lead by ID
router.get('/emaileads/:id', async (req, res) => {
  const leadId = req.params.id;
  const sql = `
    SELECT 
      id, 
      lead_name, 
      contact_number, 
      email, 
      lead_source, 
      terms_conditions 
    FROM emailleads 
    WHERE id = ?
  `;

  try {
    const [results] = await db.query(sql, [leadId]); // promise style
    if (results.length === 0) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }
    res.status(200).json({ success: true, data: results[0] });
  } catch (err) {
    console.error('Database query error:', err);
    res.status(500).json({ success: false, error: 'Database query failed' });
  }
});







// GET /api/user-quotations/:userId
router.get("/user-quotations/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const query = `
      SELECT q.*, el.assigned_to
      FROM quotations q
      JOIN emailleads el ON q.lead_id = el.id
      WHERE q.sent_status = 1
        AND el.assigned_to = ?
        AND q.created_at = (
          SELECT MAX(created_at)
          FROM quotations q2
          WHERE q2.lead_id = q.lead_id
        )
      ORDER BY q.created_at DESC
    `;


    const [rows] = await db.query(query, [userId]); 

    res.json({
      success: true,
      data: rows,
    });
  } catch (err) {
    console.error("Error fetching user quotations:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});




module.exports = router;
