const { body, validationResult } = require("express-validator");

// Create User Validation
const createUserValidation = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required"),

  body("mobile")
    .trim()
    .notEmpty()
    .withMessage("Mobile number is required")
    .isMobilePhone("en-IN")
    .withMessage("Invalid mobile number"),

  body("email")
    .optional({ values: "falsy" })
    .trim()
    .normalizeEmail()
    .isEmail()
    .withMessage("Invalid email address"),

  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters"),

  body("confirmPassword")
    .notEmpty()
    .withMessage("Confirm Password is required")
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error("Password and Confirm Password do not match");
      }
      return true;
    }),

  // Optional on create — a Checker can be created with no permissions
  // yet and have them assigned later via update. Accepts either a real
  // array (JSON) or repeated form fields (multipart), matching how the
  // rest of createUserValidation already tolerates both.
  body("permissions")
    .optional()
    .custom((value) => {
      const values = Array.isArray(value) ? value : [value];
      const allowed = ["Entry Report", "QR Pass"];

      // Empty-string entries are how the frontend explicitly signals
      // "clear all permissions" over multipart/form-data (an actually
      // empty field would otherwise not be sent at all) — they're a
      // valid "no permission" placeholder, not an invalid value.
      const invalid = values.filter((v) => v !== "" && !allowed.includes(v));

      if (invalid.length > 0) {
        throw new Error(
          `Invalid permission(s): ${invalid.join(", ")}. Allowed values are "Entry Report" and "QR Pass"`
        );
      }

      return true;
    }),
];

// Update User Validation
// The update route previously had no validation middleware at all — every
// field went straight from req.body into the service with only Mongoose's
// own schema validators as a backstop. In particular, if a password was
// being changed, confirmPassword was silently ignored server-side (the
// frontend checks it, but a direct API call could set a new password with
// no matching confirmation at all). All fields are optional here since an
// update may only touch a subset of fields — password/confirmPassword are
// only cross-checked when a password is actually being set.
const updateUserValidation = [
  body("name")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Name is required"),

  body("mobile")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Mobile number is required")
    .isMobilePhone("en-IN")
    .withMessage("Invalid mobile number"),

  body("email")
    .optional({ values: "falsy" })
    .trim()
    .normalizeEmail()
    .isEmail()
    .withMessage("Invalid email address"),

  body("password")
    .optional({ values: "falsy" })
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters")
    .custom((value, { req }) => {
      if (req.body.confirmPassword === undefined || req.body.confirmPassword !== value) {
        throw new Error("Password and Confirm Password do not match");
      }
      return true;
    }),

  body("status")
    .optional()
    .isIn(["active", "inactive"])
    .withMessage('Status must be either "active" or "inactive"'),

  body("permissions")
    .optional()
    .custom((value) => {
      const values = Array.isArray(value) ? value : [value];
      const allowed = ["Entry Report", "QR Pass"];

      // Empty-string entries are how the frontend explicitly signals
      // "clear all permissions" over multipart/form-data (an actually
      // empty field would otherwise not be sent at all) — they're a
      // valid "no permission" placeholder, not an invalid value.
      const invalid = values.filter((v) => v !== "" && !allowed.includes(v));

      if (invalid.length > 0) {
        throw new Error(
          `Invalid permission(s): ${invalid.join(", ")}. Allowed values are "Entry Report" and "QR Pass"`
        );
      }

      return true;
    }),
];

// Validation Result
// Previously this always returned a fixed "Validation Failed" message,
// leaving the frontend unable to show the user anything specific. Aligned
// with the same fix already applied to event.validator.js and
// ticketType.validator.js: the `errors` array (unchanged, still the full
// list) already carried the real per-field messages — this just surfaces
// the first one as `message`, which is what the frontend's error handling
// actually reads.
const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const errorList = errors.array();

    return res.status(400).json({
      success: false,
      message: errorList[0].msg,
      errors: errorList,
    });
  }

  next();
};

module.exports = {
  createUserValidation,
  updateUserValidation,
  validate,
};