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


router.get('/leadsoppcomment/:leadid', async (req, res) => {
  const { leadid } = req.params;

  // Queries
  const queries = {
    addLeads: 'SELECT * FROM emailleads WHERE id = ?',
    comments: 'SELECT * FROM comments WHERE leadid = ?',
  };

  try {
    // Execute queries in parallel
    const [lead, comments] = await Promise.all([
      new Promise((resolve, reject) => {
        db.query(queries.addLeads, [leadid], (err, results) => {
          if (err) reject(err);
          else resolve(results.length > 0 ? results[0] : null);
        });
      }),
      new Promise((resolve, reject) => {
        db.query(queries.comments, [leadid], (err, results) => {
          if (err) reject(err);
          else resolve(results.length > 0 ? results : []);
        });
      }),
    ]);

    // Send API response
    res.json({
      lead: lead || null,
      comments: comments,
      totalComments: comments.length,
    });
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});




// router.get('/followups/:leadid', (req, res) => {
//   const { leadid } = req.params;
//   const sql = 'SELECT * FROM followups WHERE leadid = ? ORDER BY followup_date DESC';
//   db.query(sql, [leadid], (err, results) => {
//     if (err) {
//       console.error('Database error:', err);
//       return res.status(500).json({ error: 'Failed to fetch follow-ups' });
//     }
//     res.json(results);
//   });
// });


router.get('/followups/:leadid', async (req, res) => {
  const { leadid } = req.params;

  try {
    const [results] = await db.query(
      'SELECT * FROM followups WHERE leadid = ? ORDER BY followup_date DESC',
      [leadid]
    );

    res.status(200).json(results);
  } catch (err) {
    console.error('Error fetching followups:', err);
    res.status(500).json({ error: 'Failed to fetch followups' });
  }
});



// POST a new follow-up
router.post('/followups', (req, res) => {
  const { leadid, name, note, status, followup_date } = req.body;
console.log("followup",req.body);
  if (!leadid || !name || !note || !status || !followup_date) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const sql = 'INSERT INTO followups (leadid, name, note, status, followup_date) VALUES (?, ?, ?, ?, ?)';
  db.query(sql, [leadid, name, note, status, followup_date], (err, result) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Failed to add follow-up' });
    }

    // Return the newly inserted follow-up
    // db.query('SELECT * FROM followups WHERE id = ?', [result.insertId], (err, rows) => {
    //   if (err) {
    //     console.error('Database error fetching new row:', err);
    //     return res.status(500).json({ error: 'Failed to fetch new follow-up' });
    //   }
    //   res.json(rows[0]);
    // });
  });
});



router.get('/followupsnew/:leadid', async (req, res) => {
  const { leadid } = req.params;

  try {
    const [results] = await db.query(
      'SELECT * FROM followups WHERE leadid = ? ORDER BY followup_date DESC',
      [leadid]
    );

    res.status(200).json(results);
  } catch (err) {
    console.error('Error fetching followups:', err);
    res.status(500).json({ error: 'Failed to fetch followups' });
  }
});

// -------------------- ADD COMMENT + NOTIFICATIONS --------------------
router.post('/followupsnew', async (req, res) => {
  const { leadid, name, note, status, followup_date } = req.body;

  // if (!leadid || !timestamp || !text) {
  //   return res.status(400).json({ error: 'leadid, timestamp, and text are required' });
  // }

  try {
    // Insert comment
    const [result] = await db.query(
    'INSERT INTO followups (leadid, name, note, status, followup_date) VALUES (?, ?, ?, ?, ?)',
      [leadid, name, note, status, followup_date]
    );

    res.status(201).json({
      id: result.insertId,
     leadid, name, note, status, followup_date
    });

    

 
  } catch (err) {
    console.error('Error adding comment:', err);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});


// GET all companies
router.get("/company", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM company");
    if (rows.length === 0) return res.status(404).json({ message: "No companies found" });
    res.json(rows); // return array
  } catch (err) {
    console.error("💥 DB GET ERROR:", err);
    res.status(500).json({ message: "Error fetching companies", error: err.message });
  }
});

// GET company by ID
router.get("/company/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query("SELECT * FROM company WHERE id = ?", [id]);
    if (rows.length === 0) return res.status(404).json({ message: "Company not found" });
    res.json(rows[0]); // return single company
  } catch (err) {
    console.error("💥 DB GET ERROR:", err);
    res.status(500).json({ message: "Error fetching company", error: err.message });
  }
});

// PUT update company by ID
router.put("/company/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { legalName, bankName, accountNo, ifscCode, branch, gstin, pan, iec, isoCer } = req.body;

    const query = `
      UPDATE company 
      SET legalName = ?, bankName = ?, accountNo = ?, ifscCode = ?, branch = ?, gstin = ?, pan = ?, iec = ?, isoCer = ?
      WHERE id = ?
    `;

    const [result] = await db.query(query, [legalName, bankName, accountNo, ifscCode, branch, gstin, pan, iec, isoCer, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Company not found" });
    }

    // Fetch updated row
    const [updatedCompany] = await db.query(`SELECT * FROM company WHERE id = ?`, [id]);

    res.json(updatedCompany[0]); // ✅ send updated company directly
  } catch (err) {
    console.error("💥 DB UPDATE ERROR:", err);
    res.status(500).json({ message: "Error updating company", error: err.message });
  }
});


module.exports = router;
