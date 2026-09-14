const nodemailer = require("nodemailer");

// ================= FORGOT PASSWORD EMAIL (OTP) =================
// SMTP settings are read from environment variables — same convention
// already used by config/uploadPaths.js's PUBLIC_API_URL — so this works
// the same way across local/staging/production without a code change.
// These MUST be set in .env for outgoing email to actually work:
//   SMTP_HOST      e.g. smtp.gmail.com / smtp.sendgrid.net
//   SMTP_PORT      e.g. 587 (STARTTLS) or 465 (implicit TLS)
//   SMTP_SECURE    "true" for port 465, "false" (default) for 587/STARTTLS
//   SMTP_USER      SMTP account username
//   SMTP_PASS      SMTP account password / app password / API key
//   SMTP_FROM      optional — the From address shown to recipients;
//                  falls back to SMTP_USER if not set
//
// The transporter is created lazily (on first send) rather than at
// module-load time, so a missing/incomplete SMTP config only surfaces as
// an error on the actual forgot-password request, not as a crash on
// server boot.
let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });

  return transporter;
};

// Sends the 6-digit password-reset OTP to `to`. Throws on failure — the
// caller (controllers/auth.controller.js forgotPassword) is responsible
// for rolling back the OTP it just saved if this rejects, so a failed
// send can never be silently treated as "the user now has a valid OTP".
const sendPasswordResetOtpEmail = async (to, name, otp) => {
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;
  const greetingName = name ? name : "there";

  await getTransporter().sendMail({
    from: fromAddress,
    to,
    subject: "Your password reset code",
    text:
      `Hi ${greetingName},\n\n` +
      `Your password reset OTP is ${otp}. It expires in 10 minutes.\n\n` +
      `If you did not request this, you can safely ignore this email.`,
    html:
      `<p>Hi ${greetingName},</p>` +
      `<p>Your password reset OTP is <strong style="font-size:18px;letter-spacing:2px;">${otp}</strong>. ` +
      `It expires in 10 minutes.</p>` +
      `<p>If you did not request this, you can safely ignore this email.</p>`,
  });
};

module.exports = {
  sendPasswordResetOtpEmail,
};