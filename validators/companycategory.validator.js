const { body, validationResult } = require("express-validator");

// Create Company Category Validation
// Case-insensitive duplicate-name rejection is enforced at the DB layer
// via the collation-based unique index on CompanyCategory.model.js's
// `name` field — translating that into a friendly error message is a
// service-layer concern for the next step, not part of this validator.
const createCompanyCategoryValidation = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required"),

  body("description")
    .optional({ values: "falsy" })
    .trim(),
];

// Update Company Category Validation
// Mirrors createCompanyCategoryValidation field-for-field, but every
// field is `.optional()` since an edit may only send a subset of fields.
const updateCompanyCategoryValidation = [
  body("name")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Name is required"),

  body("description")
    .optional({ values: "falsy" })
    .trim(),
];

// Validation Result
// Same shape already used by event.validator.js / ticketType.validator.js /
// user.validator.js / admin.validator.js — surfaces the first field
// error as `message` (what the frontend's error handling reads) while
// still returning the full `errors` array.
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
  createCompanyCategoryValidation,
  updateCompanyCategoryValidation,
  validate,
};