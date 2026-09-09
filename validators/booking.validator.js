const { body, validationResult } = require("express-validator");

exports.createBookingValidation = [
  body("eventId")
    .notEmpty()
    .withMessage("Event is required"),

  body("ticketTypeId")
    .notEmpty()
    .withMessage("Ticket Type is required"),

  body("quantity")
    .notEmpty()
    .withMessage("Quantity is required")
    .isInt({ min: 1 })
    .withMessage("Quantity must be at least 1"),

  body("amount")
    .notEmpty()
    .withMessage("Amount is required")
    .isFloat({ min: 0 })
    .withMessage("Amount must be valid"),

  body("name")
    .notEmpty()
    .withMessage("Name is required")
    .trim(),

  body("mobileNumber")
    .notEmpty()
    .withMessage("Mobile Number is required")
    .isLength({ min: 10, max: 10 })
    .withMessage("Mobile Number must be 10 digits")
    .isNumeric()
    .withMessage("Mobile Number must contain only numbers"),

  body("email")
    .optional({ checkFalsy: true })
    .isEmail()
    .withMessage("Invalid Email"),

  body("discount")
    .optional()
    .isNumeric()
    .withMessage("Discount must be numeric"),

  body("remark")
    .optional()
    .trim(),
];

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