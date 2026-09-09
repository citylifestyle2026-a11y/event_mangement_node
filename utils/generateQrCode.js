const QRCode = require("qrcode");

/**
 * Generate QR Code Buffer
 * @param {String} qrToken
 * @returns {Promise<Buffer>}
 */
const generateQrCode = async (qrToken) => {
  try {
    return await QRCode.toBuffer(qrToken, {
      type: "png",
      errorCorrectionLevel: "M",
      margin: 2,
      width: 500,
    });
  } catch (error) {
    throw new Error(`QR Code generation failed: ${error.message}`);
  }
};

module.exports = generateQrCode;