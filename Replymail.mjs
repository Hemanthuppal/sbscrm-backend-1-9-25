import express from "express";
import Imap from "imap-simple";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import PDFDocument from "pdfkit";
import cors from "cors";

const app = express();
app.use(express.json());
app.use(cors({ origin: "http://localhost:3000" }));

// IMAP config (for fetching mails)
const imapConfig = {
  imap: {
    user: "",   // your mailbox
    password: "",  // use app password
    host: "imap.gmail.com",         // Gmail
    port: 993,
    tls: true,
    authTimeout: 3000,
    tlsOptions: { rejectUnauthorized: false }, // ✅ Fix self-signed cert issue
  },
};

// Function to generate sample PDF
function generatePDF() {
  return new Promise((resolve) => {
    console.log("📄 Generating quotation PDF...");
    const doc = new PDFDocument();
    let buffers = [];
    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", () => {
      console.log("✅ PDF generated successfully.");
      resolve(Buffer.concat(buffers));
    });

    doc.fontSize(20).text("Quotation", { align: "center" });
    doc.moveDown();
    doc.fontSize(12).text("Dear Customer,");
    doc.text("Thank you for your request. Here is your sample quotation:");
    doc.moveDown();
    doc.text("Product A - $100");
    doc.text("Product B - $200");
    doc.moveDown();
    doc.text("Best regards,");
    doc.text("Your Company");

    doc.end();
  });
}

// API 1: Fetch latest mail
app.get("/fetch-latest", async (req, res) => {
  try {
    console.log("📩 Connecting to mailbox...");
    const connection = await Imap.connect(imapConfig);
    await connection.openBox("INBOX");
    console.log("📂 Inbox opened.");

    const searchCriteria = ["ALL"];
    const fetchOptions = { bodies: [""], markSeen: false };

    console.log("🔎 Searching for latest mails...");
    const results = await connection.search(searchCriteria, fetchOptions);

    if (results.length === 0) {
      console.log("⚠️ No mails found.");
      await connection.end();
      return res.json({ message: "No mails found" });
    }

    console.log(`📬 Found ${results.length} mails. Picking latest...`);
    const latest = results[results.length - 1];
    const parsed = await simpleParser(latest.parts[0].body);

    console.log("✅ Latest mail parsed successfully.");
    console.log(`   From: ${parsed.from.text}`);
    console.log(`   Subject: ${parsed.subject}`);
    console.log(`   Message-ID: ${parsed.messageId}`);

    await connection.end();
    console.log("🔌 IMAP connection closed.");

    res.json({
      messageId: parsed.messageId,
      from: parsed.from.text,
      subject: parsed.subject,
      text: parsed.text,
    });
  } catch (err) {
    console.error("❌ Error fetching mail:", err);
    res.status(500).json({ error: "Failed to fetch mail" });
  }
});

// API 2: Send reply with PDF
app.post("/send-reply", async (req, res) => {
  try {
    const { messageId, recipient } = req.body;
    console.log(`📤 Preparing reply to: ${recipient}`);
    console.log(`   Replying to Message-ID: ${messageId}`);

    const pdfBuffer = await generatePDF();

    console.log("📡 Creating transporter...");
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "",  // same account
        pass: "",
      },
    });

    console.log("📧 Sending reply with PDF attachment...");
    await transporter.sendMail({
      from: "",
      to: recipient,
      subject: "Re: Quotation Request",
      text: "Here is your quotation attached.",
      attachments: [
        {
          filename: "quotation.pdf",
          content: pdfBuffer,
        },
      ],
      headers: {
        "In-Reply-To": messageId,
        "References": messageId,
      },
    });

    console.log("✅ Reply sent successfully.");
    res.json({ status: "Reply sent successfully" });
  } catch (err) {
    console.error("❌ Error sending reply:", err);
    res.status(500).json({ error: "Failed to send reply" });
  }
});

// Start server
app.listen(5000, () => {
  console.log("🚀 Server running on http://localhost:5000");
});
