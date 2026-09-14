const fs = require("fs");
const path = require("path");
const { UPLOAD_ROOT } = require("../config/uploadPaths");

// Drop-in replacement for the old deleteFromCloudinary(publicId,
// resourceType). `resourceType` is accepted but ignored — it only ever
// mattered for Cloudinary's own API, and every existing caller still
// passes it, so no call site needs to change its argument list.
//
// `publicId` here is the relative path returned as `public_id` by
// utils/localUpload.util.js (e.g. "events/1733999999-abc123.jpg").
// Resolves it against UPLOAD_ROOT and refuses to delete anything that
// would resolve outside of it, so a malformed/legacy value can never
// delete an unrelated file on disk.
const deleteLocalFile = async (publicId, resourceType = "image") => {
  if (!publicId) return;

  const absolutePath = path.join(UPLOAD_ROOT, publicId);

  if (!absolutePath.startsWith(UPLOAD_ROOT)) {
    console.error(`Refusing to delete path outside uploads/: ${publicId}`);
    return;
  }

  try {
    await fs.promises.unlink(absolutePath);
  } catch (error) {
    // Missing file (e.g. already deleted, or a legacy Cloudinary
    // public_id from before this migration) is not an error worth
    // surfacing — every existing caller treats delete as best-effort.
    if (error.code !== "ENOENT") {
      console.error(`Failed to delete local file (${publicId}):`, error.message);
    }
  }
};

module.exports = deleteLocalFile;
