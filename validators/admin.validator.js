const { body, validationResult } = require("express-validator");

// Create Admin Validation
// Super-Admin-only endpoint (enforced in the route via
// authorize.requireSuperAdmin, not here). name/email/mobile/password are
// all required, matching the Admin schema's own required fields.
// Deliberately no `role` / `adminType` fields here at all — the route
// only ever accepts name/email/mobile/password, so there is nothing in
// req.body for a caller to set role/adminType with even if they tried;
// the service also never reads those keys off req.body (see
// admin.service.js createAdmin), so both are always fixed server-side.
const createAdminValidation = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required"),

  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .normalizeEmail()
    .isEmail()
    .withMessage("Invalid email address"),

  body("mobile")
    .trim()
    .notEmpty()
    .withMessage("Mobile number is required")
    .isMobilePhone("en-IN")
    .withMessage("Invalid mobile number"),

  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters"),
];

// Update Own Admin Validation
// Only name/email/mobile are accepted here — password, status, and role
// are intentionally NOT part of this validator (password reset/email
// verification are a later phase; status/role are not editable by the
// Admin themself). email/mobile are `required` on the Admin schema
// (unlike the optional User.email), so unlike updateUserValidation these
// are NOT allowed to be falsy/blank when provided — an Admin can leave a
// field out of the request to keep it unchanged, but cannot send an
// empty string to clear it.
const updateAdminValidation = [
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
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .normalizeEmail()
    .isEmail()
    .withMessage("Invalid email address"),
];

// Validation Result
// Same shape as the `validate` already exported by user.validator.js /
// event.validator.js / ticketType.validator.js — surfaces the first
// field error as `message` (what the frontend's error handling reads)
// while still returning the full `errors` array.
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
  createAdminValidation,
  updateAdminValidation,
  validate,
};
