const express = require('express');
const multer = require('multer');
const nodemailer = require('nodemailer');
const mysql = require('mysql2');
const path = require('path');
const app = express();

// Middleware to parse form data
const upload = multer({ dest: 'uploads/' });

// MySQL connection
const db = mysql.createConnection({
  host: 'localhost',
  user: 'your_username',
  password: 'your_password',
  database: 'your_database'
});

db.connect(err => {
  if (err) {
    console.error('MySQL connection error:', err);
    throw err;
  }
  console.log('MySQL connected successfully');
});

// Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'manitejavadnala079@gmail.com',
    pass: 'your_app_password' // Use App Password from Gmail
  }
});

// API to send quotation and store in database
app.post('/api/send-budget-quotation', upload.single('quotation'), (req, res) => {
  const { email, leadId, leadName } = req.body;
  const file = req.file;

  console.log('Received request to send quotation:', { email, leadId, leadName, file: file?.originalname });

  if (!email || !leadId || !file) {
    console.error('Missing required fields:', { email, leadId, file });
    return res.status(400).json({ message: 'Missing required fields' });
  }

  // Store in database
  const query = 'INSERT INTO budget_quotations (lead_id, email, file_path) VALUES (?, ?, ?)';
  db.query(query, [leadId, email, file.path], (err) => {
    if (err) {
      console.error('Database error while saving quotation:', err);
      return res.status(500).json({ message: 'Failed to save quotation' });
    }
    console.log('Quotation saved to database:', { leadId, email, file_path: file.path });

    // Send email
    const mailOptions = {
      from: 'manitejavadnala079@gmail.com',
      to: email,
      subject: `Quotation for ${leadName}`,
      text: `Dear ${leadName},\n\nPlease find the attached quotation.\n\nBest regards,\nYour Team`,
      attachments: [
        {
          filename: file.originalname,
          path: file.path
        }
      ]
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Email sending error:', error);
        return res.status(500).json({ message: 'Failed to send email' });
      }
      console.log('Email sent successfully:', info.response);
      res.status(200).json({ message: 'Quotation sent successfully' });
    });
  });
});

// Start server
app.listen(3000, () => {
  console.log('Server running on port 3000');
});