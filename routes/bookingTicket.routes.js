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

router.put(
  "/register-user/:ticketId",
  protect,
  upload.single("profileImage"),
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