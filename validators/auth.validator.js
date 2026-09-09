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

module.exports = {
  loginValidation,
  updateProfileValidation,
  resetPasswordValidation,
};
