const { body, validationResult } = require("express-validator");
const Event = require("../models/event.model");

// Create Ticket Type Validation
const createTicketTypeValidation = [
  body("eventId")
    .notEmpty()
    .withMessage("Event Id is required")
    .custom(async (eventId) => {
      const event = await Event.findById(eventId);

      if (!event) {
        throw new Error("Event not found");
      }

      if (new Date(event.endDateTime) < new Date()) {
        throw new Error(
          "Cannot add a ticket type to an event that has already ended."
        );
      }

      return true;
    }),

  body("ticketName")
    .trim()
    .notEmpty()
    .withMessage("Ticket Name is required"),

  body("allowDayCount")
    .notEmpty()
    .withMessage("Allow Day Count is required")
    .isInt({ min: 1 })
    .withMessage("Allow Day Count must be a number"),

  body("allowDates")
    .isArray({ min: 1 })
    .withMessage("At least one Allow Date is required"),

  body("allowDates.*")
    .isISO8601()
    .withMessage("Invalid Allow Date"),

  body("amount")
    .notEmpty()
    .withMessage("Amount is required")
    .isFloat({ min: 0 })
    .withMessage("Amount must be a valid number"),

  body("availableCount")
    .notEmpty()
    .withMessage("Available Count is required")
    .isInt({ min: 0 })
    .withMessage("Available Count must be a number"),

  body("description")
    .trim()
    .notEmpty()
    .withMessage("Description is required"),

  // Custom Validation
  body("allowDates").custom((allowDates, { req }) => {
    const allowDayCount = Number(req.body.allowDayCount);

    if (allowDates.length !== allowDayCount) {
      throw new Error(
        `Allow Day Count (${allowDayCount}) must match the selected dates (${allowDates.length}).`
      );
    }

    const uniqueDates = new Set(
      allowDates.map((date) => new Date(date).toISOString().split("T")[0])
    );

    if (uniqueDates.size !== allowDates.length) {
      throw new Error("Duplicate Allow Dates are not allowed.");
    }

    // A date that has already passed must never be allowed to be added
    // as a bookable date, at the point of creation.
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const hasPastDate = allowDates.some((date) => {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      return d < today;
    });

    if (hasPastDate) {
      throw new Error(
        "Allow Dates cannot include a date that has already passed."
      );
    }

    return true;
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

// update
const updateTicketTypeValidation = [
  body("ticketName")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Ticket Name is required"),

  body("allowDayCount")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Allow Day Count must be a number"),

  body("amount")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Amount must be a valid number"),

  // NOTE: previously this checked a non-existent field named "allowDate"
  // (singular). The actual field on the model/payload is "allowDates"
  // (an array). That typo meant edited dates were never validated at all —
  // this was the direct cause of expired dates being editable/re-savable.
  body("allowDates")
    .optional()
    .isArray({ min: 1 })
    .withMessage("At least one Allow Date is required"),

  body("allowDates.*")
    .optional()
    .isISO8601()
    .withMessage("Invalid Allow Date"),

  body("allowDates")
    .optional()
    .custom((allowDates, { req }) => {
      const uniqueDates = new Set(
        allowDates.map((date) => new Date(date).toISOString().split("T")[0])
      );

      if (uniqueDates.size !== allowDates.length) {
        throw new Error("Duplicate Allow Dates are not allowed.");
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const hasPastDate = allowDates.some((date) => {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        return d < today;
      });

      if (hasPastDate) {
        throw new Error(
          "Allow Dates cannot include a date that has already passed."
        );
      }

      // Only enforce the count match when allowDayCount is present in the
      // same update payload — allowDayCount may legitimately be omitted
      // on an update that isn't touching the dates.
      if (req.body.allowDayCount !== undefined) {
        const allowDayCount = Number(req.body.allowDayCount);

        if (allowDates.length !== allowDayCount) {
          throw new Error(
            `Allow Day Count (${allowDayCount}) must match the selected dates (${allowDates.length}).`
          );
        }
      }

      return true;
    }),

  body("availableCount")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Available Count must be a number"),

  body("description")
    .optional()
    .trim(),
];
module.exports = {
  createTicketTypeValidation,
  updateTicketTypeValidation,
    validate,
};