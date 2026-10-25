const nodemailer = require("nodemailer");

let transporter;

const getTransporter = () => {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      // Gmail shows app passwords with spaces; they work without them
      pass: String(process.env.EMAIL_PASS || "").replace(/\s+/g, ""),
    },
  });

  return transporter;
};

const sendEmail = async ({ to, subject, html, text }) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error("EMAIL_USER / EMAIL_PASS are not set in .env");
  }

  return getTransporter().sendMail({
    from: `"${process.env.EMAIL_FROM_NAME || "ORION Foods"}" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
    text,
  });
};

module.exports = sendEmail;