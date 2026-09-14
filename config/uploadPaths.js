// config/uploadPaths.js
//
// Central configuration for local (server-disk) file storage, replacing
// config/cloudinary.js. Every upload/delete utility reads its paths and
// public URL from here — nothing else in the codebase should hardcode
// them.
//
// UPLOAD_ROOT: absolute folder on disk where every uploaded file lives,
// at the project root (../uploads relative to this file). Created
// automatically (including known subfolders) if missing, so a fresh
// clone/deploy never fails on the very first upload.
//
// PUBLIC_BASE_URL: the publicly reachable base URL the uploads/ folder
// is served under (see app.js: express.static mounted at "/uploads").
// Read from PUBLIC_API_URL so this works the same way across
// local/staging/production without a code change — same convention as
// utils/buildRegistrationUrl.js's PUBLIC_FRONTEND_URL. Falls back to the
// live API domain if the env var isn't set.
const fs = require("fs");
const path = require("path");

const UPLOAD_ROOT = path.join(__dirname, "..", "uploads");

const PUBLIC_BASE_URL = (process.env.PUBLIC_API_URL || "https://api.citytoppers.in")
  .trim()
  .replace(/\/+$/, "");

// Maps the old Cloudinary-style folder strings (still passed around by
// the services that call the upload utility) to the local subfolder
// name actually used under uploads/. Keeping this map here (rather than
// in the upload utility) means both the upload AND the static-serving
// setup in app.js can rely on the exact same known subfolder list.
const FOLDER_MAP = {
  "event-management/events": "events",
  "event-management/users": "users",
  "event-management/admins": "admins",
  "event-management/register-user": "register-user",
  "event-management/qr-codes": "qr-codes",
  "event-management/ticket-pdfs": "ticket-pdfs",
};

const KNOWN_SUBFOLDERS = Object.values(FOLDER_MAP);

KNOWN_SUBFOLDERS.forEach((sub) => {
  fs.mkdirSync(path.join(UPLOAD_ROOT, sub), { recursive: true });
});

module.exports = {
  UPLOAD_ROOT,
  PUBLIC_BASE_URL,
  FOLDER_MAP,
};
