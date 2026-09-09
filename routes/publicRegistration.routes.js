const express = require("express");

const router = express.Router();

const publicRegistrationController = require("../controllers/publicRegistration.controller");
const upload = require("../middlewares/upload.middleware");
const {
  registrationTokenParamValidation,
  registerUserValidation,
  validate,
} = require("../validators/publicRegistration.validation");

// Public registration routes for a single BookingTicket, opened from a
// WhatsApp link (frontend: /r/:token). Deliberately NOT behind `protect` —
// customers have no login — and deliberately its own router file so the
// existing protected `routes/bookingTicket.routes.js` (and its
// PUT /api/booking-ticket/register-user/:ticketId route) is never touched.
//
// Every route below identifies the ticket exclusively via the signed
// `:token` route param (see utils/verifyRegistrationToken.js) — never via
// a ticketId in the body/query — so a request can't be redirected onto a
// different ticket by editing the payload.

// ================= VALIDATE REGISTRATION TOKEN =================
router.get(
  "/:token",
  registrationTokenParamValidation,
  validate,
  publicRegistrationController.validateToken
);

// ================= PUBLIC REGISTER USER =================
// Public Registration attendee-photo upload: uses the registration-
// specific 100 MB limit (see middlewares/upload.middleware.js), not the
// default 5 MB `upload` used by unrelated routes. Allowed image
// formats/types are unchanged.
router.put(
  "/:token",
  registrationTokenParamValidation,
  upload.registrationPhotoUpload.single("profileImage"),
  registerUserValidation,
  validate,
  publicRegistrationController.registerUser
);

module.exports = router;