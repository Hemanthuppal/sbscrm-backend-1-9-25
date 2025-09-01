// routes/leadRoutes.js
const express = require('express');
const router = express.Router();
const db = require('./../../Config/db');

// Get leads for a specific manager for today
router.get('/employees', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM employees');
    res.json(rows);
  } catch (err) {
    console.error('Error fetching employees:', err.message);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});



module.exports = router;