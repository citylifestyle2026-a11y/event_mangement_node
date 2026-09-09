const cloudinary = require("../config/cloudinary");

// resourceType defaults to "image" — identical to the previous
// no-options call (Cloudinary's own default), so every existing caller
// (profile images, QR images, event images) behaves exactly as before.
// Non-image resources (e.g. the "raw" ticket PDFs uploaded by
// services/pdf.service.js) MUST pass resourceType: "raw" explicitly, or
// Cloudinary's destroy call silently targets the wrong resource type
// and never actually deletes the file.
const deleteFromCloudinary = async (publicId, resourceType = "image") => {
  if (!publicId) return;

  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
};

module.exports = deleteFromCloudinary;