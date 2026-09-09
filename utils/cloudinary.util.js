const cloudinary = require("../config/cloudinary");
const streamifier = require("streamifier");

/**
 * Upload Buffer to Cloudinary
 * @param {Buffer} buffer
 * @param {String} folder
 * @param {String} resourceType
 * @param {Object} extraOptions - Optional additional Cloudinary upload
 *   options (e.g. { public_id, format }), merged on top of the defaults
 *   below. Defaults to {} so every existing caller (image uploads) is
 *   completely unaffected. Used by services/pdf.service.js to force a
 *   stable public_id and a ".pdf" delivered extension for ticket PDFs
 *   (resource_type "raw" does not reliably infer an extension on its
 *   own).
 * @returns {Promise}
 */
const uploadToCloudinary = (
  buffer,
  folder,
  resourceType = "image",
  extraOptions = {}
) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
        overwrite: false,
        ...extraOptions,
      },
      (error, result) => {
        if (error) return reject(error);

        resolve({
          public_id: result.public_id,
          url: result.secure_url,
          width: result.width,
          height: result.height,
          format: result.format,
          bytes: result.bytes,
        });
      }
    );

    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

module.exports = uploadToCloudinary;