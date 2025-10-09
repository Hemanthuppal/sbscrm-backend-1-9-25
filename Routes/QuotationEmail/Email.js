const express = require("express");
const multer = require("multer");
const nodemailer = require("nodemailer");
const router = express.Router();
const db = require('../../Config/db');
const path = require("path");
const fs = require("fs");

// ✅ Create Uploads/quotation-uploads directory (outside current folder)
const uploadDir = path.join(__dirname, "../../Uploads/quotation-uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log("📂 Created directory:", uploadDir);
} else {
  console.log("📂 Upload directory exists:", uploadDir);
}

// ✅ Multer Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${file.fieldname}-${Date.now()}${ext}`;
    cb(null, filename);
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// ✅ Nodemailer Configuration
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: "landnestiiiqbets@gmail.com",
    pass: "ohzh apyb wvsm wkti",
  },
  tls: { rejectUnauthorized: false },
});

// 📩 SEND QUOTATION EMAIL ROUTE
router.post("/send-quotation-email", upload.array("files", 5), async (req, res) => {
  try {
    console.log("\n======================= 📧 NEW QUOTATION EMAIL REQUEST =======================");
    console.log("Raw Body:", req.body);
    console.log("Uploaded Files:", req.files?.map(f => f.originalname));

    const {
      leadid,
      sender_email,
      text,
      subject,
      type,
      is_plain_text,
      receiver_emails,
      cc_emails,
      bcc_emails,
      quotationData,
      receiver_details,
      company_details,
      regard_details,
    } = req.body;

    const files = req.files || [];

    if (!leadid || !sender_email || !receiver_emails) {
      console.error("❌ Missing required fields:", { leadid, sender_email, receiver_emails });
      return res.status(400).json({ success: false, error: "Missing required fields." });
    }

    const receivers = JSON.parse(receiver_emails);
    const cc = cc_emails ? JSON.parse(cc_emails) : [];
    const bcc = bcc_emails ? JSON.parse(bcc_emails) : [];
    const quotation = quotationData ? JSON.parse(quotationData) : null;

    const receiverDetails = receiver_details ? JSON.parse(receiver_details) : {};
    const companyDetails = company_details ? JSON.parse(company_details) : {};
    const regardDetails = regard_details ? JSON.parse(regard_details) : {};

    console.log("✅ Parsed Receivers:", receivers);
    console.log("✅ Parsed CC:", cc);
    console.log("✅ Parsed BCC:", bcc);
    console.log("✅ Quotation Data:", quotation);

    if (!Array.isArray(receivers) || receivers.length === 0) {
      console.error("❌ Invalid receiver emails.");
      return res.status(400).json({ success: false, error: "Invalid receiver emails." });
    }

    console.log("📧 Starting quotation email send process...");

    // ✅ Generate quotation_id
    let newQuotationId = null;
    if (quotation) {
      try {
        const [quotationResult] = await db.query(
          `SELECT quotation_id FROM emails WHERE quotation_id IS NOT NULL ORDER BY id DESC LIMIT 1`
        );

        if (quotationResult.length > 0 && quotationResult[0].quotation_id) {
          const lastQuotationId = quotationResult[0].quotation_id;
          const match = lastQuotationId.match(/Qu00(\d+)/);
          newQuotationId = match ? `Qu00${parseInt(match[1], 10) + 1}` : "Qu001";
        } else {
          newQuotationId = "Qu001";
        }
        console.log("🆕 Generated Quotation ID:", newQuotationId);
      } catch (error) {
        console.error("❌ Error generating quotation ID:", error);
        newQuotationId = "Qu001";
      }
    }

    // ✅ FIXED: Use Uploads/quotation-uploads path for stored file URLs
    const filePaths = files.map(f => `/Uploads/quotation-uploads/${f.filename}`).join(',');
    console.log("📁 File paths to store:", filePaths);

    // Send emails to all recipients
    const emailPromises = receivers.map(async (receiver_email) => {
      try {
        const mailOptions = {
          from: '"SBS Company" <landnestiiiqbets@gmail.com>',
          to: receiver_email,
          cc: cc.length > 0 ? cc : undefined,
          bcc: bcc.length > 0 ? bcc : undefined,
          subject: subject || "Quotation from SBS Company",
          html: text,
          attachments: files.map(file => ({
            filename: file.originalname,
            path: file.path,
          })),
        };

        if (quotation && quotation.message_id) {
          mailOptions.headers = {
            "In-Reply-To": quotation.message_id,
            "References": quotation.message_id,
          };
        }

        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ Email sent to ${receiver_email}, MessageID: ${info.messageId}`);

        // Insert into emails table
        const emailSql = `
          INSERT INTO emails (
            leadid, sender_email, receiver_email, subject, text, 
            file_path, type, email_sent, message_id, quotation_id, 
            cc_emails, bcc_emails, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `;
        const emailValues = [
          leadid,
          sender_email,
          receiver_email,
          subject || "Quotation from SBS Company",
          text || "",
          filePaths || null,
          type || "sent",
          1,
          info.messageId,
          newQuotationId,
          cc.length > 0 ? JSON.stringify(cc) : null,
          bcc.length > 0 ? JSON.stringify(bcc) : null,
        ];
        await db.query(emailSql, emailValues);

        // ✅ Insert into quotations table
        if (quotation) {
          const quotationQuery = `
            INSERT INTO quotations 
              (lead_id, quotation_number, quotation_date, subtotal, gst, total_amount, products, 
               sent_status, discount, discountType, terms_conditions, quotation_body,
               receiver_details, company_details, regard_details,
               quotation_pdf, attachments, created_at)
            VALUES (?, ?, CURDATE(), ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
          `;

          const quotationPdfFile = files.find(file =>
            file.originalname.toLowerCase().includes('quotation') ||
            file.mimetype === 'application/pdf'
          );

          const quotationPdfPath = quotationPdfFile ? `/Uploads/quotation-uploads/${quotationPdfFile.filename}` : null;
          const otherAttachments = files
            .filter(file => file !== quotationPdfFile)
            .map(file => `/Uploads/quotation-uploads/${file.filename}`)
            .join(',');

          const quotationValues = [
            quotation.leadId,
            quotation.quotationNumber,
            quotation.subtotal,
            quotation.totalGST,
            quotation.grandTotal,
            JSON.stringify(quotation.products || []),
            quotation.discount || 0,
            quotation.discountType || "percentage",
            quotation.terms_conditions || "",
            quotation.quotation_body || "",
            JSON.stringify(receiverDetails || {}),
            JSON.stringify(companyDetails || {}),
            JSON.stringify(regardDetails || {}),
            quotationPdfPath,
            otherAttachments || null,
          ];

          await db.query(quotationQuery, quotationValues);
        }

        return { success: true, receiver: receiver_email, messageId: info.messageId };
      } catch (error) {
        console.error(`❌ Error sending email to ${receiver_email}:`, error);
        return { success: false, receiver: receiver_email, error: error.message };
      }
    });

    const results = await Promise.all(emailPromises);
    const successfulSends = results.filter(r => r.success);
    const failedSends = results.filter(r => !r.success);

    if (failedSends.length === 0) {
      res.json({
        success: true,
        message: "Quotation email sent successfully!",
        quotation_id: newQuotationId,
        sent_count: successfulSends.length,
      });
    } else {
      res.json({
        success: true,
        message: `${successfulSends.length} emails sent, ${failedSends.length} failed.`,
        quotation_id: newQuotationId,
        sent_count: successfulSends.length,
        failed_count: failedSends.length,
      });
    }

  } catch (error) {
    console.error("❌ Error in send-quotation-email:", error);
    res.status(500).json({ success: false, error: "Quotation email sending failed: " + error.message });
  }
});

// ✅ GET quotations by lead ID
router.get("/quotations/:leadId", async (req, res) => {
  try {
    const { leadId } = req.params;
    const [quotations] = await db.query(
      `SELECT * FROM quotations WHERE lead_id = ? ORDER BY created_at DESC`,
      [leadId]
    );

    const updatedQuotations = quotations.map(quotation => {
      if (quotation.quotation_pdf && !quotation.quotation_pdf.startsWith('/Uploads/')) {
        quotation.quotation_pdf = quotation.quotation_pdf.replace('/uploads/', '/Uploads/');
      }
      if (quotation.attachments && quotation.attachments.includes('/uploads/')) {
        quotation.attachments = quotation.attachments.replace(/\/uploads\//g, '/Uploads/');
      }
      return quotation;
    });

    res.json({ success: true, data: updatedQuotations, message: "Quotations fetched successfully" });
  } catch (error) {
    console.error("Error fetching quotations:", error);
    res.status(500).json({ success: false, error: "Failed to fetch quotations" });
  }
});

// ✅ Export router
module.exports = router;
