require("dotenv").config();
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER, // Load from .env file
    pass: process.env.EMAIL_PASS, // Use app password for security
  },
  tls: { rejectUnauthorized: false },
});

module.exports = transporter;