const multer = require("multer");
const AppError = require("../utils/AppError");
const path = require("path");
// Memory Storage
const storage = multer.memoryStorage();

// Allowed MIME Types
const allowedMimeTypes = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

// File Filter
// Shared by every upload limit variant below — the existing allowed
// image formats/types are NOT changed by this file.
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "application/octet-stream", // fallback
  ];

  const allowedExtensions = [
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
  ];

  const ext = path.extname(file.originalname).toLowerCase();

  if (
    allowedMimeTypes.includes(file.mimetype) &&
    allowedExtensions.includes(ext)
  ) {
    return cb(null, true);
  }

  return cb(
    new AppError(
      "Only JPG, JPEG, PNG and WEBP images are allowed.",
      400
    ),
    false
  );
};

// ================= UPLOAD MIDDLEWARE FACTORY =================
// Builds a multer instance with the shared memory storage + fileFilter
// above, differing only in the max file size allowed. Kept as a factory
// (instead of duplicating storage/fileFilter per variant) so every
// upload route continues to share the exact same format/type validation.
const buildUploadMiddleware = (maxFileSizeBytes) =>
  multer({
    storage,
    limits: {
      fileSize: maxFileSizeBytes,
    },
    fileFilter,
  });

// ================= DEFAULT UPLOAD MIDDLEWARE =================
// Unchanged 5 MB limit — still used as-is by every existing upload route
// that isn't the Public/Private Registration photo upload (e.g. Event
// image, User/Admin profile photo), so those limits are not affected by
// the registration-specific increase below.
const upload = buildUploadMiddleware(5 * 1024 * 1024); // 5 MB

// ================= REGISTRATION PHOTO UPLOAD MIDDLEWARE =================
// Used ONLY by the two attendee-photo upload routes that make up the
// Registration flow:
//   - routes/bookingTicket.routes.js  PUT /register-user/:ticketId  (Private Registration, staff-authenticated)
//   - routes/publicRegistration.routes.js  PUT /:token  (Public Registration, no-login)
// Raised from the previous 20 MB cap to 100 MB per the updated
// requirement (<=100MB now allowed, >100MB still rejected with the same
// multer file-size error as before — only the threshold changed). Same
// storage + fileFilter as the default upload middleware above, so
// allowed image formats/types are unchanged; every other upload route
// (Event image, User profile, etc.) keeps using `upload` above and is
// unaffected by this higher limit.
const registrationPhotoUpload = buildUploadMiddleware(100 * 1024 * 1024); // 100 MB

module.exports = upload;
module.exports.registrationPhotoUpload = registrationPhotoUpload;