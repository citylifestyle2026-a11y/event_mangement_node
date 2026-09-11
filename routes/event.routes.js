const express = require("express");
const router = express.Router();

const upload = require("../middlewares/upload.middleware");
const { protect } = require("../middlewares/auth.middleware");

const eventController = require("../controllers/event.controller");

const {
  createEventValidation,
  updateEventValidation,
  deleteEventValidation,
  validate,
} = require("../validators/event.validator");

// Create Event
router.post(
  "/create",
  protect,
  upload.single("image"),
  createEventValidation,
  validate,
  eventController.createEvent
);

// Get All Events
router.get(
  "/get-all-events",
  protect,
  eventController.getAllEvents
);

// Get Event By Id
router.get(
  "/:id",
  protect,
  eventController.getEventById
);

// Update Event
router.put(
  "/:id/update",
  protect,
  upload.single("image"),
  updateEventValidation,
  validate,
  eventController.updateEvent
);

// Delete Event
// Body must include { email, password } for the currently authenticated
// Admin — verified in eventController.deleteEvent before the existing
// delete transaction runs.
router.delete(
  "/:id/delete",
  protect,
  deleteEventValidation,
  validate,
  eventController.deleteEvent
);

// Change Event Status
router.patch(
  "/:id/status",
  protect,
  eventController.changeEventStatus
);
module.exports = router;