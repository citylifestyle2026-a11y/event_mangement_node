const { param } = require("express-validator");

// Reuse the exact same Name/Mobile Number/Email rules (and their shared
// `validate` result-handler) already used by the protected
// PUT /api/booking-ticket/register-user/:ticketId route, instead of
// duplicating them here. Profile image validity is handled separately by
// middlewares/upload.middleware.js, also reused as-is.
const { registerUserValidation, validate } = require("./bookingTicket.validation");

// The public routes take the registration token as a route param (from
// the /r/:token frontend link), not a ticketId — this only checks that
// something was supplied; the real proof-of-identity check is the
// signature/expiry/purpose verification done in
// utils/verifyRegistrationToken.js.
const registrationTokenParamValidation = [
  param("token").trim().notEmpty().withMessage("Registration token is required"),
];

module.exports = {
  registrationTokenParamValidation,
  registerUserValidation,
  validate,
};