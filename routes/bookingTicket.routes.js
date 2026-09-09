const express = require("express");

const router = express.Router();

const bookingTicketController = require("../controllers/bookingTicket.controller");
const { protect } = require("../middlewares/auth.middleware");
const {
  registerUserValidation,
  validate,
} = require("../validators/bookingTicket.validation");

const auth = require("../middlewares/auth.middleware");
const upload = require("../middlewares/upload.middleware");

// ================= REGISTER / UPDATE USER =================
// Private Registration attendee-photo upload: uses the registration-
// specific 100 MB limit (see middlewares/upload.middleware.js), not the
// default 5 MB `upload` used by unrelated routes (Event image, User
// profile, etc.). Allowed image formats/types are unchanged.
router.put(
  "/register-user/:ticketId",
  protect,
  upload.registrationPhotoUpload.single("profileImage"),
  registerUserValidation,
  validate,
  bookingTicketController.registerUser
);

// ================= RESEND TICKET (WHATSAPP) =================

router.post(
  "/resend/:ticketId",
  protect,
  bookingTicketController.resendTicket
);


module.exports = router;