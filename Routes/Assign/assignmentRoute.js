const express = require('express');
const router = express.Router();
const db = require('../../Config/db'); // mysql2 or mysql connection

// Assign user (manager or associate) to organization
router.put('/leadcrm/:id/assign-user', async (req, res) => {
  try {
    const { id } = req.params;
    const { assigned_by, assigned_to } = req.body;

    console.log(`Assigning user. Lead ID: ${id}, Assigned By: ${assigned_by}, Assigned To: ${assigned_to}`);

    if (!assigned_by || !assigned_to) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // ✅ Promise wrapper for queries
    const query = (sql, params) =>
      new Promise((resolve, reject) => {
        db.query(sql, params, (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      });

    // Check if lead exists
    const lead = await query('SELECT * FROM emailleads WHERE id = ?', [id]);
    if (lead.length === 0) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    // Update emailleads with assigned_by and assigned_to (stored as VARCHAR)
    const updateResult = await query(
      'UPDATE emailleads SET assigned_by = ?, assigned_to = ? WHERE id = ?',
      [assigned_by.toString(), assigned_to.toString(), id]
    );

    if (updateResult.affectedRows === 0) {
      return res.status(400).json({ message: 'Update failed (no rows affected)' });
    }

    // Insert into assignment_history (stored as INT)
    const createdAt = new Date();
    const historyResult = await query(
      'INSERT INTO assignment_history (lead_id, assigned_by, assigned_to, created_at) VALUES (?, ?, ?, ?)',
      [id, parseInt(assigned_by), parseInt(assigned_to), createdAt]
    );

    res.json({
      success: true,
      message: 'Assignment saved and history logged successfully',
      updatedRows: updateResult.affectedRows,
      historyId: historyResult.insertId
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
