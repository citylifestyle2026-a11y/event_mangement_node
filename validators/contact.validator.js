const { body, validationResult } = require("express-validator");

// Create Contact Validation
// This only checks shape/type/presence — trimming and case-insensitive
// de-duplication of `references` happens in the model itself
// (models/contact.model.js's pre-save/pre-findOneAndUpdate hooks), same
// separation of concerns already used elsewhere in this project (e.g.
// User.model.js hashes `password` in a hook rather than the validator).
const createContactValidation = [
  body("fullName")
    .trim()
    .notEmpty()
    .withMessage("Full Name is required"),

  body("whatsappNumber")
    .trim()
    .notEmpty()
    .withMessage("WhatsApp Number is required")
    .isMobilePhone("en-IN")
    .withMessage("Invalid WhatsApp Number"),

  body("companyName")
    .optional({ values: "falsy" })
    .trim(),

  body("address")
    .optional({ values: "falsy" })
    .trim(),

  // A contact can be created with zero references, but if the field is
  // present it must be a real array of non-empty strings. Duplicate
  // removal (case-insensitive, within this same contact) is the model's
  // job, not this validator's.
  body("references")
    .optional()
    .isArray()
    .withMessage("References must be an array"),

  body("references.*")
    .isString()
    .withMessage("Each reference must be text")
    .trim()
    .notEmpty()
    .withMessage("Reference cannot be empty"),

  body("companyCategory")
    .optional({ values: "falsy" })
    .isMongoId()
    .withMessage("Invalid Company Category"),
];

// Update Contact Validation
// Mirrors createContactValidation field-for-field, but every field is
// `.optional()` since an edit may only send a subset of fields.
const updateContactValidation = [
  body("fullName")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Full Name is required"),

  body("whatsappNumber")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("WhatsApp Number is required")
    .isMobilePhone("en-IN")
    .withMessage("Invalid WhatsApp Number"),

  body("companyName")
    .optional({ values: "falsy" })
    .trim(),

  body("address")
    .optional({ values: "falsy" })
    .trim(),

  body("references")
    .optional()
    .isArray()
    .withMessage("References must be an array"),

  body("references.*")
    .isString()
    .withMessage("Each reference must be text")
    .trim()
    .notEmpty()
    .withMessage("Reference cannot be empty"),

  body("companyCategory")
    .optional({ values: "falsy" })
    .isMongoId()
    .withMessage("Invalid Company Category"),
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
  createContactValidation,
  updateContactValidation,
  validate,
};