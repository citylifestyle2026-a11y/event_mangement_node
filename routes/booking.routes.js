const express = require("express");
const router = express.Router();

const bookingController = require("../controllers/booking.controller");

const {
  createBookingValidation,
  validate,
} = require("../validators/booking.validator");

const { protect } = require("../middlewares/auth.middleware");

// Create Booking
router.post(
  "/create",
  protect,
  createBookingValidation,
  validate,
  bookingController.createBooking
);

// Get All Bookings
router.get(
  "/get-all-bookings",
  protect,
  bookingController.getAllBookings
);

// Export Bookings
router.get(
  "/export",
  protect,
  bookingController.exportBookingsController
);

// Delete Booking
router.delete(
  "/delete/:id",
  protect,
  bookingController.deleteBooking
);

// Get Booking By ID
router.get(
  "/:id",
  protect,
  bookingController.getBookingById
);

module.exports = router;