// server.js or routes/quotation.js
const express = require("express");
const multer = require("multer");
const nodemailer = require("nodemailer");
const path = require("path");
const db = require('./../../Config/db'); // <-- using shared DB connection
const router = express.Router();

// Multer config (store file in memory)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// POST /send-quotation
router.post("/send-quotation", upload.single("pdf"), async (req, res) => {
  try {
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
      message_id, // ✅ received from frontend
    } = req.body;

    const pdfBuffer = req.file.buffer;

    // 1️⃣ Save quotation in DB
    const query = `
      INSERT INTO quotations 
        (lead_id, quotation_number, quotation_date, subtotal, gst, total_amount, products, sent_status) 
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `;

    await db.query(query, [
      lead_id,
      quotationNumber,
      quotationDate,
      subtotal,
      gst,
      total_amount,
      products,
    ]);

    console.log("Quotation stored in DB successfully with sent_status = 1");

    // 2️⃣ Send email as REPLY
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: "iiiqbetsvarnaaz@gmail.com",
        pass: "rbdy vard mzit ybse", // Gmail App Password
      },
      tls: { rejectUnauthorized: false },
    });

    await transporter.sendMail({
      from: '"SBS Company" <iiiqbetsvarnaaz@gmail.com>',
      to: email,
      subject: "Re: Quotation from SBS Company", // ✅ "Re:" to show reply
      text: `Dear ${name},\n\nPlease find attached your quotation.\n\nRegards,\nSBS Company`,
      attachments: [
        {
          filename: req.file.originalname,
          content: pdfBuffer,
        },
      ],
      headers: {
        "In-Reply-To": message_id,   // ✅ reply to original message
        "References": message_id,    // ✅ keep thread intact
      },
    });

    res.json({ success: true, message: "Quotation saved, marked as sent & emailed as reply" });
  } catch (err) {
    console.error("Error in send-quotation:", err);
    res.status(500).json({ success: false, error: "Failed to save/send quotation" });
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

/// 📌 Update Quotation Status
router.put("/update-quotation-status/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { quotation_status } = req.body;

    if (!quotation_status) {
      return res.status(400).json({ error: "Quotation status is required" });
    }

    const [result] = await db.query(
      "UPDATE emailleads SET quotation_status = ? WHERE id = ?",
      [quotation_status, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Lead not found" });
    }

    // ✅ Send proper JSON
    res.status(200).json({
      message: "Quotation status updated successfully",
      quotation_status,
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
