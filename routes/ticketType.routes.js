const express = require("express");
const router = express.Router();

const ticketTypeController = require("../controllers/ticketType.controller");
const {
    createTicketTypeValidation,
    updateTicketTypeValidation,
    validate,
} = require("../validators/ticketType.validator");
const { protect } = require("../middlewares/auth.middleware");

// `protect` now runs first, matching the pattern used in event.routes.js —
// previously validation ran before auth, which meant an unauthenticated
// caller could trigger (and see) field-level validation errors.
router.post(
    "/create",
    protect,
    createTicketTypeValidation,
    validate,
    ticketTypeController.createTicketType
);
// get event 
router.get("/get-all-ticket-types/:eventId", protect, ticketTypeController.getAllTicketTypes);

// update api
router.put(
    "/update/:id",
    protect,
    updateTicketTypeValidation,
    validate,
    ticketTypeController.updateTicketType
);
// delete
router.delete(
    "/delete/:id",
    protect,
    ticketTypeController.deleteTicketType
);
module.exports = router;