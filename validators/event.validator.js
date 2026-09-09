const { body, validationResult } = require("express-validator");

// Create Event Validation
const createEventValidation = [
  body("title")
    .trim()
    .notEmpty()
    .withMessage("Title is required"),

  body("description")
    .trim()
    .notEmpty()
    .withMessage("Description is required"),

  body("startDateTime")
    .notEmpty()
    .withMessage("Start Date & Time is required")
    .isISO8601()
    .withMessage("Start Date & Time must be a valid date")
    .custom((value) => {
      if (new Date(value) < new Date()) {
        throw new Error("Start Date & Time cannot be in the past");
      }
      return true;
    }),

  body("endDateTime")
    .notEmpty()
    .withMessage("End Date & Time is required")
    .isISO8601()
    .withMessage("End Date & Time must be a valid date")
    .custom((value, { req }) => {
      if (
        req.body.startDateTime &&
        new Date(value) <= new Date(req.body.startDateTime)
      ) {
        throw new Error("End Date & Time must be after Start Date & Time");
      }
      return true;
    }),

  body("venueName")
    .trim()
    .notEmpty()
    .withMessage("Venue Name is required"),

  // Latitude/Longitude are required on the Event create form (see
  // CreateEvent.jsx's REQUIRED_FIELDS) — the backend previously treated
  // them as optional, which disagreed with the actual business
  // requirement. Enforced consistently here to match the frontend.
  body("latitude")
    .notEmpty()
    .withMessage("Latitude is required")
    .isFloat()
    .withMessage("Latitude must be a valid number"),

  body("longitude")
    .notEmpty()
    .withMessage("Longitude is required")
    .isFloat()
    .withMessage("Longitude must be a valid number"),

  body("address")
    .trim()
    .notEmpty()
    .withMessage("Address is required"),

  body("termsConditions")
    .trim()
    .notEmpty()
    .withMessage("Terms & Conditions are required"),


  body("videoLinks")
    .optional({ checkFalsy: true })
    .custom((value) => {
      try {
        const links = JSON.parse(value);

        if (!Array.isArray(links)) {
          throw new Error();
        }

        return true;
      } catch {
        throw new Error("Video Links must be a valid JSON array");
      }
    }),
];

// Update Event Validation
// Mirrors createEventValidation's rules field-for-field, but every field
// is `.optional()` since an edit may only send a subset of fields.
// NOTE: the "endDateTime must be after startDateTime" check below only
// fires when BOTH fields are present in this same request. If only one
// of the two is sent, event.service.js's updateEvent merges it against
// the event's existing stored value and re-checks the ordering there,
// since only the service has access to the current DB record.
const updateEventValidation = [
  body("title")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Title cannot be empty"),

  body("description")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Description cannot be empty"),

  body("startDateTime")
    .optional()
    .isISO8601()
    .withMessage("Start Date & Time must be a valid date")
    .custom((value) => {
      if (new Date(value) < new Date()) {
        throw new Error("Start Date & Time cannot be in the past");
      }
      return true;
    }),

  body("endDateTime")
    .optional()
    .isISO8601()
    .withMessage("End Date & Time must be a valid date")
    .custom((value, { req }) => {
      if (
        req.body.startDateTime &&
        new Date(value) <= new Date(req.body.startDateTime)
      ) {
        throw new Error("End Date & Time must be after Start Date & Time");
      }
      return true;
    }),

  body("venueName")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Venue Name cannot be empty"),

  body("latitude")
    .optional()
    .isFloat()
    .withMessage("Latitude must be a valid number"),

  body("longitude")
    .optional()
    .isFloat()
    .withMessage("Longitude must be a valid number"),

  body("address")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Address cannot be empty"),

  body("termsConditions")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Terms & Conditions cannot be empty"),

  body("videoLinks")
    .optional({ checkFalsy: true })
    .custom((value) => {
      try {
        const links = JSON.parse(value);

        if (!Array.isArray(links)) {
          throw new Error();
        }

        return true;
      } catch {
        throw new Error("Video Links must be a valid JSON array");
      }
    }),
];

// Validation Result
// Previously this always returned a fixed "Validation Failed" message,
// leaving the frontend unable to show the user anything specific. The
// `errors` array (unchanged, still the full list) already carried the
// real per-field messages — we just weren't surfacing the first one as
// `message`, which is the field the existing frontend thunks/toasts
// actually read (`error.response?.data?.message`).
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
  createEventValidation,
  updateEventValidation,
  validate,
};