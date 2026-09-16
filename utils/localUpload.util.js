const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");
const { UPLOAD_ROOT, PUBLIC_BASE_URL, FOLDER_MAP } = require("../config/uploadPaths");

const MIME_TO_EXT = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

// Every mimetype the upload middleware's fileFilter already allows
// through (middlewares/upload.middleware.js) — kept in sync with that
// list. Used only to decide whether the global "convert to WEBP" rule
// below applies; it does not change what's accepted for upload.
const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const sanitizeSegment = (value) =>
  String(value).replace(/[^a-zA-Z0-9_-]/g, "-");

/**
 * Save a file to local disk, under uploads/<subfolder>, and return a
 * publicly reachable URL. Drop-in replacement for the old
 * uploadToCloudinary(buffer, folder, resourceType, extraOptions) —
 * every existing caller keeps working unchanged, since only
 * `result.url` and `result.public_id` are ever read from the return
 * value.
 *
 * @param {Buffer|Object} input - Either a raw Buffer, or a multer file
 *   object ({ buffer, mimetype, ... }) — passing the multer file lets
 *   the correct image extension be derived from its mimetype.
 * @param {String} folder - Legacy Cloudinary-style folder string (e.g.
 *   "event-management/events"), mapped to a local subfolder via
 *   FOLDER_MAP. Falls back to the last "/"-segment for any folder not
 *   in the map, so a new caller can't accidentally write outside
 *   uploads/.
 * @param {String} resourceType - Unused for local storage; kept only so
 *   every existing call site (which still passes it, e.g. "image") does
 *   not need to change its argument list.
 * @param {Object} extraOptions - Optional { public_id, format } to force
 *   a specific file name/extension (used by services/pdf.service.js for
 *   ticket PDFs). Defaults to {} so every image-upload caller is
 *   unaffected.
 * @returns {Promise<{ public_id: string, url: string, bytes: number, format: string }>}
 */
const uploadToLocal = async (input, folder, resourceType = "image", extraOptions = {}) => {
  const isMulterFile = input && Buffer.isBuffer(input.buffer);
  let buffer = isMulterFile ? input.buffer : input;

  if (!Buffer.isBuffer(buffer)) {
    throw new Error("uploadToLocal: no valid file buffer provided.");
  }

  const subfolder = FOLDER_MAP[folder] || sanitizeSegment(String(folder).split("/").pop() || "misc");
  const dir = path.join(UPLOAD_ROOT, subfolder);
  fs.mkdirSync(dir, { recursive: true });

  // ================= GLOBAL IMAGE → WEBP RULE =================
  // Applies to every user-uploaded image that comes in as a multer file
  // with a recognized image mimetype (Event image, User/Admin profile
  // photo, attendee registration photo, etc. — every caller that passes
  // `input` = the raw multer `file` object). JPG/JPEG/PNG are converted
  // to WEBP; a file that is already WEBP is stored as-is (no
  // unnecessary reconversion). The final file on disk — and therefore
  // the `.url`/`.public_id` saved to the database by every caller —
  // always ends in `.webp` for these uploads.
  //
  // Deliberately gated on `!extraOptions.format`: callers that
  // explicitly force an output format are NOT user-uploaded images —
  // they're internally generated artifacts (QR code PNGs in
  // booking.service.js / bookingTicket.service.js, ticket PDFs in
  // pdf.service.js) and must keep their existing format untouched, since
  // changing those would break QR scanning / ticket delivery, which is
  // outside the scope of this rule.
  const isUploadedImage =
    !extraOptions.format &&
    isMulterFile &&
    input.mimetype &&
    IMAGE_MIME_TYPES.has(input.mimetype);

  let ext;

  if (isUploadedImage) {
    if (input.mimetype === "image/webp") {
      // Already WEBP — keep as WEBP, no reconversion needed.
      ext = ".webp";
    } else {
      // JPG/JPEG/PNG -> WEBP
      buffer = await sharp(buffer).webp().toBuffer();
      ext = ".webp";
    }
  } else if (extraOptions.format) {
    ext = `.${String(extraOptions.format).replace(/^\./, "")}`;
  } else if (isMulterFile && input.mimetype && MIME_TO_EXT[input.mimetype]) {
    ext = MIME_TO_EXT[input.mimetype];
  } else {
    ext = ".png";
  }

  // extraOptions.public_id forces a specific, stable file name (e.g.
  // ticket PDFs, which build their own unique name upstream). Otherwise
  // a random, collision-safe name is generated, matching Cloudinary's
  // previous auto-generated public_id behavior.
  const baseName = extraOptions.public_id
    ? sanitizeSegment(extraOptions.public_id)
    : `${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;

  const fileName = `${baseName}${ext}`;
  const absolutePath = path.join(dir, fileName);

  await fs.promises.writeFile(absolutePath, buffer);

  // Verify the write actually landed on disk before handing back a
  // public URL for it. Without this, a write that silently fails to
  // persist (full disk, permissions, filesystem/mount issue) still
  // returns a success URL that then 404s later — masking the real
  // failure at generation time instead of surfacing it immediately.
  if (!fs.existsSync(absolutePath)) {
    throw new Error(
      `uploadToLocal: file was not found on disk after write (${absolutePath}).`
    );
  }

  // Stored as the "public_id" equivalent (relative path under
  // uploads/), so utils/deleteLocalFile.js can resolve and remove the
  // exact same file later.
  const relativePath = path.posix.join(subfolder, fileName);
  const url = `${PUBLIC_BASE_URL}/uploads/${relativePath}`;

  return {
    public_id: relativePath,
    url,
    bytes: buffer.length,
    format: ext.replace(".", ""),
  };
};

module.exports = uploadToLocal;