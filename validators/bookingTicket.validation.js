const { body, validationResult } = require("express-validator");

exports.registerUserValidation = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required"),

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
    .withMessage("Invalid email"),
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