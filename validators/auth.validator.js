const { body } = require("express-validator");

const loginValidation = [
  body("login")
    .trim()
    .notEmpty()
    .withMessage("Email or Mobile Number is required")
    .custom((value) => {
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      const isMobile = /^[0-9]{10}$/.test(value);

      if (!isEmail && !isMobile) {
        throw new Error(
          "Please enter a valid email address or 10-digit mobile number"
        );
      }

      return true;
    }),

  body("password")
    .trim()
    .notEmpty()
    .withMessage("Password is required"),
];

const updateProfileValidation = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required"),
];

const resetPasswordValidation = [
  body("currentPassword")
    .trim()
    .notEmpty()
    .withMessage("Current password is required"),

  body("newPassword")
    .trim()
    .notEmpty()
    .withMessage("New password is required")
    .isLength({ min:8 })
    .withMessage("New password must be at least 8 characters long")
    .matches(/[!@#$%^&*(),.?":{}|<>_\-+=~`[\]\\/;']/)
    .withMessage("New password must contain at least one symbol"),

  body("confirmPassword")
    .trim()
    .notEmpty()
    .withMessage("Confirm password is required")
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error("New password and confirm password do not match");
      }

      return true;
    }),
];

// ================= FORGOT PASSWORD (OTP, via email) =================
const forgotPasswordValidation = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Enter a valid email address"),
];

const verifyResetOtpValidation = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Enter a valid email address"),

  body("otp")
    .trim()
    .notEmpty()
    .withMessage("OTP is required")
    .isLength({ min:6, max:6 })
    .withMessage("OTP must be 6 digits")
    .isNumeric()
    .withMessage("OTP must be numeric"),
];

// Same newPassword/confirmPassword rules as resetPasswordValidation above,
// plus email + otp to identify which account/OTP this applies to.
const resetPasswordWithOtpValidation = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Enter a valid email address"),

  body("otp")
    .trim()
    .notEmpty()
    .withMessage("OTP is required")
    .isLength({ min:6, max:6 })
    .withMessage("OTP must be 6 digits")
    .isNumeric()
    .withMessage("OTP must be numeric"),

  body("newPassword")
    .trim()
    .notEmpty()
    .withMessage("New password is required")
    .isLength({ min:8 })
    .withMessage("New password must be at least 8 characters long")
    .matches(/[!@#$%^&*(),.?":{}|<>_\-+=~`[\]\\/;']/)
    .withMessage("New password must contain at least one symbol"),

  body("confirmPassword")
    .trim()
    .notEmpty()
    .withMessage("Confirm password is required")
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error("New password and confirm password do not match");
      }

      return true;
    }),
];

module.exports = {
  loginValidation,
  updateProfileValidation,
  resetPasswordValidation,
  forgotPasswordValidation,
  verifyResetOtpValidation,
  resetPasswordWithOtpValidation,
};
