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
      products, // ✅ received as JSON string
    } = req.body;

    const pdfBuffer = req.file.buffer;

    // 1️⃣ Save quotation in DB
    const query = `
      INSERT INTO quotations 
        (lead_id, quotation_number, quotation_date, subtotal, gst, total_amount, products) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    await db.query(query, [
      lead_id,
      quotationNumber,
      quotationDate,
      subtotal,
      gst,
      total_amount,
      products, // ✅ already stringified JSON
    ]);

    console.log("Quotation stored in DB successfully");

    // 2️⃣ Send email with PDF
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: "iiiqbetsvarnaaz@gmail.com",
        pass: "rbdy vard mzit ybse", // Gmail App Password
      },
    });

    await transporter.sendMail({
      from: '"SBS Company" <iiiqbetsvarnaaz@gmail.com>',
      to: email,
      subject: "Quotation from SBS Company",
      text: `Dear ${name},\n\nPlease find attached your quotation.\n\nRegards,\nSBS Company`,
      attachments: [
        {
          filename: req.file.originalname,
          content: pdfBuffer,
        },
      ],
    });

    res.json({ success: true, message: "Quotation saved & sent successfully" });
  } catch (err) {
    console.error("Error in send-quotation:", err);
    res.status(500).json({ success: false, error: "Failed to save/send quotation" });
  }
});




// POST: add lead product
// router.post("/add-lead-product", (req, res) => {
//   const {
//     lead_id,
//     unit,
//     pr_no,
//     pr_date,
//     legacy_code,
//     item_code,
//     item_description,
//     uom,
//     pr_quantity
//   } = req.body;

//   const sql = `
//     INSERT INTO emailproducts 
//     (lead_id, unit, pr_no, pr_date, legacy_code, item_code, item_description, uom, pr_quantity)
//     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
//   `;

//   db.query(
//     sql,
//     [
//       lead_id,
//       unit,
//       pr_no,
//       pr_date,
//       legacy_code,
//       item_code,
//       item_description,
//       uom,
//       pr_quantity
//     ],
//     (err, result) => {
//       if (err) {
//         console.error("Error inserting product:", err);
//         return res.status(500).json({ error: "Failed to add product" });
//       }
//       res.json({ message: "Product added successfully", id: result.insertId });
//     }
//   );
// });

router.post("/add-lead-product", (req, res) => {
  try {
    console.log("Received product data:", req.body);

    const { lead_id } = req.body;
    // Extract product details from the "0" key
    const product = req.body["0"];

    if (!product || !lead_id) {
      return res.status(400).json({ error: "Missing product or lead_id" });
    }

    const {
      product_id,       // maps to email_product_id
      product_name,
      batch,
      description,
      size,
      hsncode,
      gstrate,
      listprice,
      moq,
      maincategory_name,
      subcategory_name
    } = product;

    const sql = `
      INSERT INTO matched_products 
      (lead_id, email_product_id, maincategory_name, subcategory_name, product_name, batch, description, size, hsncode, gstrate, listprice, moq, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    db.query(
      sql,
      [
        lead_id,
        product_id || null,
        maincategory_name || null,
        subcategory_name || null,
        product_name || null,
        batch || null,
        description || null,
        size || null,
        hsncode || null,
        gstrate || null,
        listprice || null,
        moq || null
      ],
      (err, result) => {
        if (err) {
          console.error("Error inserting matched product:", err);
          return res.status(500).json({ error: "Failed to add matched product" });
        }
        res.json({
          message: "Matched product added successfully",
          id: result.insertId
        });
      }
    );
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ error: "Unexpected server error" });
  }
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


module.exports = router;
