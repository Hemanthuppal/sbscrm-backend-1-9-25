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

// POST API → Insert into addleads
router.post("/addleads", async (req, res) => {
  const { name, email, phone_number } = req.body;

  if (!name || !email || !phone_number) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    const [result] = await db.query(
      "INSERT INTO addleads (name, email, phone_number) VALUES (?, ?, ?)",
      [name, email, phone_number]
    );
    res.status(201).json({ message: "Lead added successfully", id: result.insertId });
  } catch (err) {
    console.error("Error inserting lead:", err.message);
    res.status(500).json({ message: "Database error" });
  }
});

// GET API → Fetch all leads
router.get("/addleads", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM addleads");
    res.json(rows);
  } catch (err) {
    console.error("Error fetching leads:", err.message);
    res.status(500).json({ message: "Database error" });
  }
});



module.exports = router;