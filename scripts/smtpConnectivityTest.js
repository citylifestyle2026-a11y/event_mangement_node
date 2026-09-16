/**
 * TEMPORARY SMTP connectivity/send test — safe to delete after use.
 *
 * Does NOT modify .env, does NOT touch any existing controller/route/
 * service/frontend file. It only READS the existing SMTP_* env vars and
 * re-creates the exact same nodemailer transporter shape already used in
 * utils/email.util.js (host/port/secure/auth + tls.rejectUnauthorized:
 * false), so this test is a faithful reproduction of what the real app
 * does — nothing more.
 *
 * Usage:
 *   node scripts/smtpConnectivityTest.js recipient@example.com
 *
 * The SMTP password is read from process.env.SMTP_PASS and is never
 * logged, printed, or included in any output below.
 */

require("dotenv").config();
const nodemailer = require("nodemailer");

const toAddress = process.argv[2];

if (!toAddress) {
  console.error("Usage: node scripts/smtpConnectivityTest.js <recipient-email>");
  process.exit(1);
}

// Same required-vars check pattern as the real mail util would implicitly
// hit (a missing var would just make auth fail) — done explicitly here up
// front so a config gap is reported clearly instead of as a generic SMTP
// error.
const required = ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS"];
const missing = required.filter((k) => !process.env[k]);

if (missing.length) {
  console.log("SMTP connection: FAILED");
  console.log(`Missing required .env vars: ${missing.join(", ")}`);
  process.exit(1);
}

// Log the non-secret config being used, so it's obvious exactly what was
// tested — SMTP_PASS itself is deliberately never referenced here.
console.log("Using SMTP config:");
console.log(`  SMTP_HOST   = ${process.env.SMTP_HOST}`);
console.log(`  SMTP_PORT   = ${process.env.SMTP_PORT}`);
console.log(`  SMTP_SECURE = ${process.env.SMTP_SECURE}`);
console.log(`  SMTP_USER   = ${process.env.SMTP_USER}`);
console.log(`  SMTP_FROM   = ${process.env.SMTP_FROM || process.env.SMTP_USER}`);
console.log(`  Recipient   = ${toAddress}`);
console.log("");

// Identical shape to getTransporter() in utils/email.util.js.
const transporter = nodemailer.createTransport({
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

const run = async () => {
  // Step 1: verify the connection + auth, without sending anything yet.
  try {
    await transporter.verify();
    console.log("SMTP connection: SUCCESS (verified host/port/auth)");
  } catch (err) {
    console.log("SMTP connection: FAILED");
    console.log(`Error code:    ${err.code || "N/A"}`);
    console.log(`Error message: ${err.message}`);
    if (err.response) console.log(`Server response: ${err.response}`);
    process.exit(1);
  }

  // Step 2: only if verify() succeeded, send one simple test email.
  try {
    const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;

    const info = await transporter.sendMail({
      from: `"City Toppers SMTP Test" <${fromAddress}>`,
      to: toAddress,
      subject: "SMTP connectivity test",
      text:
        "This is a one-off SMTP connectivity test email sent from a temporary " +
        "test script (scripts/smtpConnectivityTest.js). It can be safely ignored.",
      html:
        "<p>This is a one-off SMTP connectivity test email sent from a temporary " +
        "test script (<code>scripts/smtpConnectivityTest.js</code>). It can be " +
        "safely ignored.</p>",
    });

    console.log("Email sent: SUCCESS");
    console.log(`  messageId: ${info.messageId}`);
    console.log(`  accepted:  ${JSON.stringify(info.accepted)}`);
    console.log(`  rejected:  ${JSON.stringify(info.rejected)}`);
    if (info.response) console.log(`  server response: ${info.response}`);
  } catch (err) {
    console.log("Email sent: FAILED");
    console.log(`Error code:    ${err.code || "N/A"}`);
    console.log(`Error message: ${err.message}`);
    if (err.response) console.log(`Server response: ${err.response}`);
    process.exit(1);
  }
};

run();