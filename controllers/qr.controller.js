const qrService = require("../services/qr.service");

// ================= VERIFY QR =================
const verifyQr = async (req, res, next) => {

  try {
    const result = await qrService.verifyQr({
      qrToken: req.body.qrToken,
      scannedBy: req.user._id,
    });

    return res.status(200).json({
      success: true,
      message: "QR verified successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
// ================= CHECK-IN QR =================
const checkInQr = async (req, res, next) => {
    console.log("========== CHECK-IN API HIT ==========");
  console.log("Body:", req.body);
  try {
    const result = await qrService.checkInQr({
      qrToken: req.body.qrToken,
      scannedBy: req.user._id,
    });

    return res.status(200).json({
      success: true,
      message: "Ticket checked in successfully.",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
module.exports = {
  verifyQr,
   checkInQr,
};