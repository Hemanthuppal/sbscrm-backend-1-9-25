// server.js or routes/quotation.js
const express = require("express");
// const multer = require("multer");
const nodemailer = require("nodemailer");
// const path = require("path");
// const fs = require("fs"); 
const db = require('./../../Config/db'); // <-- using shared DB connection
const router = express.Router();

const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadsDir = path.join(__dirname, '../../Uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // Create unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const originalName = file.originalname.replace(/\s+/g, '_'); // Replace spaces with underscores
    cb(null, uniqueSuffix + '_' + originalName);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  // Allow specific file types
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
    'image/jpg'
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF, Word, Excel, JPG, PNG files are allowed.'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

router.post("/send-quotation", upload.single("pdf"), async (req, res) => {
  console.log("📩 Incoming /send-quotation request");

  try {
    // Log raw body & file
    console.log("📝 req.body:", req.body);
    console.log("📎 req.file:", req.file ? req.file.originalname : "No file received");

    const {
      email,
      name,
      lead_id,
      quotationNumber,
      quotationDate,
      subtotal,
      gst,
      total_amount,
      products, // JSON string
      discount,discountType,
      message_id,
    } = req.body;

    if (!req.file) {
      console.error("❌ PDF file missing in request");
      return res.status(400).json({ success: false, error: "PDF file is required" });
    }

    const pdfBuffer = req.file.buffer;

    // 1️⃣ Save quotation in DB
    const query = `
      INSERT INTO quotations 
        (lead_id, quotation_number, quotation_date, subtotal, gst, total_amount, products, sent_status,discount,discountType) 
      VALUES (?, ?, ?, ?, ?, ?, ?, 1,?,?)
    `;

    console.log("💾 Saving quotation to DB...");
    console.log("➡️ Values:", {
      lead_id,
      quotationNumber,
      quotationDate,
      subtotal,
      gst,
      total_amount,
      products,
      discount,discountType
    });

    await db.query(query, [
      lead_id,
      quotationNumber,
      quotationDate,
      subtotal,
      gst,
      total_amount,
      products,discount,discountType
    ]);

    console.log("✅ Quotation stored in DB successfully with sent_status = 1");

    // 2️⃣ Send email as REPLY
    console.log("📧 Preparing transporter...");
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      // auth: {
      //   user: "amansbs@gmail.com",
      //   pass: "svul hklq knvv huue", // Gmail App Password
      // },
        auth: {
        user: "landnestiiiqbets@gmail.com",
        pass: "ohzh apyb wvsm wkti", // Gmail App Password
      },
      tls: { rejectUnauthorized: false },
    });

    console.log("📧 Sending email to:", email);
    await transporter.sendMail({
      from: '"SBS Company" <landnestiiiqbets@gmail.com>',
      to: email,
      subject: "Re: Quotation from SBS Company",
      text: `Dear ${name},\n\nPlease find attached your quotation.\n\nRegards,\nSBS Company`,
      attachments: [
        {
          filename: req.file.originalname,
          content: pdfBuffer,
        },
      ],
      headers: {
        "In-Reply-To": message_id,
        "References": message_id,
      },
    });

    console.log("✅ Email sent successfully");

    res.json({
      success: true,
      message: "Quotation saved, marked as sent & emailed as reply",
      quotationNumber,
    });
  } catch (err) {
    console.error("❌ Error in send-quotation:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to save/send quotation",
    });
  }
});

// POST /api/send-budget-quotation - Fixed route
router.post('/send-budget-quotation', upload.single('quotation'), async (req, res) => {
  console.log('📩 Request received at /api/send-budget-quotation');

  try {
    // Log raw body & file with full path details
    console.log('📝 req.body:', req.body);
    console.log('📎 req.file:', req.file ? {
      originalname: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      path: req.file.path,
      filename: req.file.filename,
      destination: req.file.destination
    } : 'No file received');

    const { email, leadId, leadName } = req.body;
    const file = req.file;

    // Validation
    if (!email || !leadId || !file) {
      console.error('❌ Missing required fields:', { email, leadId, file: !!file });
      return res.status(400).json({ success: false, error: 'Missing required fields: email, leadId, and file are required' });
    }

    // ✅ FIXED: Use the actual file path from Multer
    const filePath = file.path; // This is the actual path where file is stored
    const relativePath = `uploads/${file.filename}`; // For database storage
    
    console.log('🔍 File path details:', {
      actualPath: filePath,
      relativePath: relativePath,
      fileExists: fs.existsSync(filePath)
    });

    // Check if file actually exists
    if (!fs.existsSync(filePath)) {
      console.error('❌ File not found at path:', filePath);
      return res.status(400).json({ 
        success: false, 
        error: 'Uploaded file not found on server' 
      });
    }

    console.log('💾 Saving quotation to DB...');
    console.log('➡️ Values:', { 
      leadId, 
      email, 
      filePath: relativePath,
      fileSize: file.size 
    });

    // 1️⃣ Save quotation in DB
    const query = `
      INSERT INTO budget_quotations (lead_id, email, file_path, created_at) 
      VALUES (?, ?, ?, NOW())
    `;

    await db.query(query, [leadId, email, relativePath]);
    console.log('✅ Quotation stored in DB successfully');

    // 2️⃣ Send email with attachment
    console.log('📧 Preparing transporter...');
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: 'landnestiiiqbets@gmail.com',
        pass: 'ohzh apyb wvsm wkti',
      },
      tls: { rejectUnauthorized: false },
    });

    console.log('📧 Sending email to:', email);
    
    // ✅ FIXED: Use the actual file path
    const fileBuffer = fs.readFileSync(filePath);
    
    const mailOptions = {
      from: '"SBS Company" <landnestiiiqbets@gmail.com>',
      to: email,
      subject: `Budget Quotation for ${leadName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">SBS Company - Budget Quotation</h2>
          <p>Dear ${leadName},</p>
          <p>Please find attached the budget quotation you requested.</p>
          <p><strong>Lead ID:</strong> Lead00${leadId}</p>
          <p><strong>Business:</strong> ${req.body.businessName || 'N/A'}</p>
          <br/>
          <p>If you have any questions, please don't hesitate to contact us.</p>
          <br/>
          <p>Best regards,<br/>Your Team at SBS Company</p>
        </div>
      `,
      attachments: [
        {
          filename: file.originalname,
          content: fileBuffer,
          contentType: file.mimetype,
        },
      ],
    };

    const emailResult = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent successfully:', emailResult.messageId);

    // 3️⃣ Update lead status if needed
    try {
      const updateQuery = `UPDATE emailleads SET quotation_status = 'Sent' WHERE id = ?`;
      await db.query(updateQuery, [leadId]);
      console.log('✅ Lead quotation status updated to "Sent"');
    } catch (updateError) {
      console.warn('⚠️ Could not update lead status:', updateError.message);
    }

    res.json({
      success: true,
      message: 'Quotation sent successfully and stored in database',
      emailId: emailResult.messageId,
      fileName: file.originalname
    });

  } catch (err) {
    console.error('❌ Error in send-budget-quotation:', err);
    
    let errorMessage = 'Failed to send quotation';
    if (err.code === 'EAUTH') {
      errorMessage = 'Email authentication failed. Check SMTP credentials.';
    } else if (err.code === 'ENOTFOUND') {
      errorMessage = 'Cannot connect to email server. Check internet connection.';
    } else if (err.code === 'EENVELOPE') {
      errorMessage = 'Invalid email address.';
    }

    res.status(500).json({
      success: false,
      error: errorMessage,
      details: err.message
    });
  }
});


router.post("/add-lead-product", async (req, res) => {
  try {
    console.log("📩 Received product data:", req.body);

    const { lead_id } = req.body;
    if (!lead_id) {
      return res.status(400).json({ error: "Missing lead_id" });
    }

    // Convert numeric keys into an array of products
    const products = Object.keys(req.body)
      .filter((key) => !isNaN(key)) // only numeric keys
      .map((key) => req.body[key]);

    if (products.length === 0) {
      return res.status(400).json({ error: "No products provided" });
    }

    for (const product of products) {
      const {
        detail_id,
        product_id,
        maincategory_id,
        subcategory_id,
        maincategory_name,
        subcategory_name,
        product_name,
        batch,
        description,
        size,
        hsncode,
        gstrate,
        listprice,
        moq,
        quantity = 1,
      } = product;

      // 🔍 Check if product already exists
      const [rows] = await db.query(
        `SELECT id, quantity FROM matched_products WHERE lead_id = ? AND detail_id = ?`,
        [lead_id, detail_id]
      );

      if (rows.length > 0) {
        // ✅ Exists → update quantity
        const existing = rows[0];
        const newQuantity = existing.quantity + quantity;

        await db.query(
          `UPDATE matched_products SET quantity = ? WHERE id = ?`,
          [newQuantity, existing.id]
        );

        console.log(
          `🔄 Updated product [lead_id=${lead_id}, detail_id=${detail_id}] → new qty=${newQuantity}`
        );
      } else {
        // ➕ Insert new row
        await db.query(
          `INSERT INTO matched_products (
            lead_id, detail_id, email_product_id,
            maincategory_id, subcategory_id, maincategory_name, subcategory_name,
            product_id, product_name, batch, description, size,
            hsncode, gstrate, listprice, moq, quantity, created_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            lead_id,
            detail_id || null,
            product_id || null,
            maincategory_id || null,
            subcategory_id || null,
            maincategory_name || null,
            subcategory_name || null,
            product_id || null,
            product_name || null,
            batch || null,
            description || null,
            size || null,
            hsncode || null,
            gstrate || null,
            listprice || null,
            moq || null,
            quantity,
            new Date(),
          ]
        );

        console.log(
          `✅ Inserted new product [lead_id=${lead_id}, detail_id=${detail_id}, qty=${quantity}]`
        );
      }
    }

    res.json({ message: "Products processed successfully" });
  } catch (error) {
    console.error("❌ Server error:", error);
    res.status(500).json({ error: "Unexpected server error" });
  }
});

// DELETE product by ID
router.delete("/delete-lead-product/:id", (req, res) => {
  const { id } = req.params;

  const sql = "DELETE FROM matched_products WHERE id = ?";
  db.query(sql, [id], (err, result) => {
    if (err) {
      console.error("Error deleting product:", err);
      return res.status(500).json({ error: "Failed to delete product" });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json({ message: "Product deleted successfully" });
  });
});


// GET /quotations - fetch all quotations
router.get("/quotations", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT * FROM quotations ORDER BY created_at DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Error fetching quotations:", err);
    res.status(500).json({ success: false, error: "Failed to fetch quotations" });
  }
});

// GET /quotations/:id - fetch quotations by lead_id
router.get("/quotations/:lead_id", async (req, res) => {
  try {
    const { lead_id } = req.params;
    const [rows] = await db.query(
      `SELECT * FROM quotations WHERE lead_id = ? ORDER BY created_at DESC`,
      [lead_id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Error fetching quotations by lead_id:", err);
    res.status(500).json({ success: false, error: "Failed to fetch quotations" });
  }
});


// API to generate unique quotation number
router.get("/get-next-quotation-number", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT quotation_number FROM quotations ORDER BY id DESC LIMIT 1"
    );

    let nextNumber = 1;
    if (rows.length > 0) {
      // Extract numeric part from e.g. "QUO0005"
      const lastQuotation = rows[0].quotation_number;
      const numericPart = parseInt(lastQuotation.replace("QUO", ""), 10);
      nextNumber = numericPart + 1;
    }

    // 👇 Pad to 4 digits instead of 3
    const quotationNumber = `QUO${nextNumber.toString().padStart(4, "0")}`;

    res.json({ quotationNumber });
  } catch (err) {
    console.error("Error fetching quotation number:", err);
    res.status(500).json({ error: "Failed to generate quotation number" });
  }
});

router.get("/quotation-status/:leadId", async (req, res) => {
  try {
    const { leadId } = req.params;

    const [rows] = await db.query(
      "SELECT quotation_number, sent_status FROM quotations WHERE lead_id = ? ORDER BY id DESC LIMIT 1",
      [leadId]
    );

    if (rows.length > 0) {
      res.json({ 
        sent: rows[0].sent_status === 1, 
        quotationNumber: rows[0].quotation_number 
      });
    } else {
      res.json({ sent: false, quotationNumber: null });
    }
  } catch (err) {
    console.error("Error checking quotation status:", err);
    res.status(500).json({ error: "Failed to fetch quotation status" });
  }
});

/// 📌 Update Quotation Status + Opportunity Status
router.put("/update-quotation-status/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { quotation_status } = req.body;

    if (!quotation_status) {
      return res.status(400).json({ error: "Quotation status is required" });
    }

    // Build query dynamically
    let sql = "UPDATE emailleads SET quotation_status = ?";
    const params = [quotation_status];

    if (quotation_status === "Sent") {
      sql += ", opp_status = ?";
      params.push("Proposal Sent");
    }

    sql += " WHERE id = ?";
    params.push(id);

    const [result] = await db.query(sql, params);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Lead not found" });
    }

    res.status(200).json({
      message: "Quotation status updated successfully",
      quotation_status,
      ...(quotation_status === "Sent" && { opp_status: "Proposal Sent" }),
    });

  } catch (err) {
    console.error("DB Error:", err);
    res.status(500).json({ error: err.message });
  }
});


// 📌 Get Quotation Status
router.get("/lead-quotation-status/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await db.query(
      "SELECT quotation_status FROM emailleads WHERE id = ?",
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Lead not found" });
    }

    res.status(200).json(rows[0]);
  } catch (err) {
    console.error("DB Error:", err);
    res.status(500).json({ error: err.message });
  }
});


// GET /api/raw-email/:id
router.get("/raw-email/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const query = "SELECT raw_email_content FROM emailleads WHERE id = ?";
    const [rows] = await db.query(query, [id]);

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: "Email not found" });
    }

    res.json({ raw_email_content: rows[0].raw_email_content });
  } catch (err) {
    console.error("Error fetching raw email:", err);
    res.status(500).json({ error: "Failed to fetch raw email" });
  }
});




module.exports = router;
