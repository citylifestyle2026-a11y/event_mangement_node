const { body, validationResult } = require("express-validator");

// ================= VERIFY QR =================
exports.verifyQrValidation = [
  body("qrToken")
    .trim()
    .notEmpty()
    .withMessage("QR Token is required")
    .isString()
    .withMessage("QR Token must be a string"),
];

// ================= CHECK-IN QR =================
exports.checkInQrValidation = [
  body("qrToken")
    .trim()
    .notEmpty()
    .withMessage("QR Token is required")
    .isString()
    .withMessage("QR Token must be a string"),
];

// ================= VALIDATION RESULT =================
exports.validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation Error",
      errors: errors.array(),
    });
  }

  next();
};