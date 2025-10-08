const express = require("express");
const multer = require("multer");
const nodemailer = require("nodemailer");
const dotenv = require("dotenv");
const router = express.Router();
const db = require("../../Config/db"); // Adjust path as needed
const path = require("path");
const fs = require("fs");

// Load environment variables
dotenv.config();

// Create uploads directory
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Configuration
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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

// Nodemailer Configuration
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_APP_PASS,
  },
  tls: { rejectUnauthorized: false },
});




export default transporter;


// Add this route to get email history without CC and BCC
router.get("/email-history/:leadid", async (req, res) => {
  try {
    const { leadid } = req.params;
    
    const sql = `
      SELECT 
        id,
        sender_email,
        receiver_email,
        subject,
        text,
        file_path,
        type,
        created_at
      FROM emails 
      WHERE leadid = ? 
      ORDER BY created_at DESC
    `;
    
    const [results] = await db.query(sql, [leadid]);
    
    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error("Error fetching email history:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch email history" 
    });
  }
});

// Add this route for sending regret emails with message_id support
router.post("/send-regret-email", upload.array("files", 5), async (req, res) => {
  try {
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
      is_regret_email,
      message_id,
      is_reply,
      leadInfo,
      original_email_info
    } = req.body;

    const files = req.files || [];

    if (!leadid || !sender_email || !receiver_emails) {
      return res.status(400).json({ success: false, error: "Missing required fields." });
    }

    const receivers = JSON.parse(receiver_emails);
    const cc = cc_emails ? JSON.parse(cc_emails) : [];
    const bcc = bcc_emails ? JSON.parse(bcc_emails) : [];
    const leadData = leadInfo ? JSON.parse(leadInfo) : null;
    const originalEmailInfo = original_email_info ? JSON.parse(original_email_info) : null;

    if (!Array.isArray(receivers) || receivers.length === 0) {
      return res.status(400).json({ success: false, error: "Invalid receiver emails." });
    }

    console.log("📧 Starting regret email send process...");
    console.log("Is Reply:", is_reply);
    console.log("Original Message ID:", message_id);

    // Send emails to all recipients
    const emailPromises = receivers.map(async (receiver_email) => {
      try {
        const mailOptions = {
          from: '"SBS Company" <landnestiiiqbets@gmail.com>',
          to: receiver_email,
          cc: cc.length > 0 ? cc : undefined,
          bcc: bcc.length > 0 ? bcc : undefined,
          subject: subject || "Regret Email from SBS Company",
          html: text,
          attachments: files.map(file => ({
            filename: file.originalname,
            path: file.path
          })),
        };

        // Add email threading headers for replies
        if (is_reply && message_id) {
          mailOptions.headers = {
            "In-Reply-To": message_id,
            "References": message_id,
          };
          mailOptions.subject = mailOptions.subject; // Keep the "Re: " prefix
        }

        const info = await transporter.sendMail(mailOptions);

        // Store in regret_emails table with reply information
        const regretEmailSql = `
          INSERT INTO regret_emails (
            leadid, sender_email, receiver_email, subject, text, 
            file_path, type, email_sent, message_id, 
            cc_emails, bcc_emails, lead_name, business_name, 
            lead_email, contact_number, status, opp_status, 
            is_reply, in_reply_to, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `;
        
        const filePaths = files.map(f => `/uploads/${f.filename}`).join(',');
        
        const values = [
          leadid,
          sender_email,
          receiver_email,
          subject || "Regret Email from SBS Company",
          text || "",
          filePaths || null,
          type || "sent",
          1,
          info.messageId,
          cc.length > 0 ? JSON.stringify(cc) : null,
          bcc.length > 0 ? JSON.stringify(bcc) : null,
          leadData?.lead_name || null,
          leadData?.business_name || null,
          leadData?.email || null,
          leadData?.contact_number || null,
          leadData?.status || null,
          leadData?.opp_status || null,
          is_reply ? 1 : 0,
          is_reply ? message_id : null
        ];

        console.log("Executing SQL with values:", values);
        const [result] = await db.query(regretEmailSql, values);
        console.log("Regret email stored successfully with ID:", result.insertId);

        return { success: true, receiver: receiver_email };

      } catch (error) {
        console.error(`Error sending regret email to ${receiver_email}:`, error);
        return { success: false, receiver: receiver_email, error: error.message };
      }
    });

    const results = await Promise.all(emailPromises);
    const successfulSends = results.filter(result => result.success);
    const failedSends = results.filter(result => !result.success);

    if (failedSends.length === 0) {
      res.json({
        success: true,
        message: is_reply ? "Regret reply email sent successfully!" : "Regret email sent successfully!",
        sent_count: successfulSends.length,
        is_reply: is_reply
      });
    } else {
      res.json({
        success: true,
        message: `${successfulSends.length} regret emails sent successfully, ${failedSends.length} failed`,
        sent_count: successfulSends.length,
        failed_count: failedSends.length,
        is_reply: is_reply
      });
    }

  } catch (error) {
    console.error("Error in send-regret-email:", error);
    res.status(500).json({ 
      success: false,
      error: "Regret email sending failed: " + error.message 
    });
  }
});

// ✅ Export the router at the end
module.exports = router;