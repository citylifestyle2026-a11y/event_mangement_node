const express = require("express");

const router = express.Router();

const { protect } = require("../middlewares/auth.middleware");
const authorize = require("../middlewares/authorize.middleware");
const qrController = require("../controllers/qr.controller");
const {
  verifyQrValidation,
  checkInQrValidation,
  validate,
} = require("../validators/qr.validation");

// verfiy
// Admin always has access; a Checker additionally needs the
// "QR Pass" permission on their User document.
router.post(
  "/verify",
  protect,
  authorize("admin", "checker", { permission: "QR Pass" }),
  verifyQrValidation,
  validate,
  qrController.verifyQr
);
//  check-in
router.post(
  "/check-in",
  protect,
  authorize("admin", "checker", { permission: "QR Pass" }),
  checkInQrValidation,
  validate,
  qrController.checkInQr
);
module.exports = router;