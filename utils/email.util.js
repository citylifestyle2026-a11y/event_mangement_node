const nodemailer = require("nodemailer");

// ================= FORGOT PASSWORD EMAIL (OTP) =================
// SMTP settings are read from environment variables — same convention
// already used by config/uploadPaths.js's PUBLIC_API_URL — so this works
// the same way across local/staging/production without a code change.
// These MUST be set in .env for outgoing email to actually work:
//   SMTP_HOST      the citytoppers.in domain's OWN mail server (NOT
//                  Gmail — sending via smtp.gmail.com as info@citytoppers.in
//                  fails SPF/DKIM alignment against this domain's DMARC
//                  policy, which is why OTP emails were landing in Spam).
//                  Exact hostname must come from the hosting provider —
//                  see the deliverability inspection notes for what to
//                  confirm before setting this.
//   SMTP_PORT      typically 587 (STARTTLS) or 465 (implicit TLS) — confirm
//                  with the hosting provider, do not assume.
//   SMTP_SECURE    "true" for port 465, "false" (default) for 587/STARTTLS
//   SMTP_USER      the info@citytoppers.in mailbox's own login (this is
//                  the mail server account, NOT a Gmail App Password)
//   SMTP_PASS      that mailbox's own password
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
    // Display name added ("City Toppers" <info@citytoppers.in>) instead
    // of a bare address — purely cosmetic/trust-related, not part of the
    // SPF/DKIM/DMARC fix itself.
    from: `"City Toppers" <${fromAddress}>`,
    to,
    // Reply-To set to the same mailbox so a reply from the recipient
    // reaches a real, monitored inbox rather than whatever SMTP_FROM
    // happens to be (currently the same address, but this keeps replies
    // correct even if SMTP_FROM is ever pointed at a no-reply address).
    replyTo: fromAddress,
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