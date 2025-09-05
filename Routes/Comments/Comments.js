const express = require('express');
const router = express.Router();
const db = require('./../../Config/db'); // shared db connection

// -------------------- FETCH COMMENTS BY LEAD --------------------
router.get('/comments/:leadid', async (req, res) => {
  const { leadid } = req.params;

  try {
    const [results] = await db.query(
      'SELECT * FROM comments WHERE leadid = ? ORDER BY timestamp DESC',
      [leadid]
    );

    res.status(200).json(results);
  } catch (err) {
    console.error('Error fetching comments:', err);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// -------------------- ADD COMMENT + NOTIFICATIONS --------------------
router.post('/comments/add', async (req, res) => {
  const { name, leadid, timestamp, text, userId, managerId, email, notificationmessage } = req.body;

  if (!leadid || !timestamp || !text) {
    return res.status(400).json({ error: 'leadid, timestamp, and text are required' });
  }

  try {
    // Insert comment
    const [result] = await db.query(
      'INSERT INTO comments (name, leadid, timestamp, text) VALUES (?, ?, ?, ?)',
      [name, leadid, timestamp, text]
    );

    res.status(201).json({
      id: result.insertId,
      name,
      leadid,
      timestamp,
      text,
    });

    const insertNotification = async (employeeId, managerId, email) => {
      try {
        await db.query(
          `INSERT INTO notifications (employeeId, managerid, leadid, email, message, createdAt, \`read\`)
           VALUES (?, ?, ?, ?, ?, NOW(), 0)`,
          [employeeId, managerId, leadid, email, notificationmessage]
        );
      } catch (err) {
        console.error('Error adding notification:', err);
      }
    };

    // Insert notifications (fire and forget)
    insertNotification(userId, null, null);
    insertNotification(null, managerId, null);
    insertNotification(null, null, email);

  } catch (err) {
    console.error('Error adding comment:', err);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

module.exports = router;
