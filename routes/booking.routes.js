const express = require("express");
const router = express.Router();

const bookingController = require("../controllers/booking.controller");

const {
  createBookingValidation,
  validate,
} = require("../validators/booking.validator");

const { protect } = require("../middlewares/auth.middleware");
const authorize = require("../middlewares/authorize.middleware");

// Booking management (create/list/export/delete/view) is an Admin CRM
// feature — a Checker's only two capabilities anywhere in the app are
// QR Pass (routes/qr.routes.js) and Entry Report
// (routes/entryReport.routes.js), so none of these routes are ever
// meant to be reachable by a Checker.

// Create Booking
router.post(
  "/create",
  protect,
  authorize("admin"),
  createBookingValidation,
  validate,
  bookingController.createBooking
);

// Get All Bookings
router.get(
  "/get-all-bookings",
  protect,
  authorize("admin"),
  bookingController.getAllBookings
);

// Export Bookings
router.get(
  "/export",
  protect,
  authorize("admin"),
  bookingController.exportBookingsController
);

// Delete Booking
router.delete(
  "/delete/:id",
  protect,
  authorize("admin"),
  bookingController.deleteBooking
);

// Get Booking By ID
router.get(
  "/:id",
  protect,
  authorize("admin"),
  bookingController.getBookingById
);

module.exports = router;