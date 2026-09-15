const express = require("express");
const router = express.Router();

const { protect } = require("../middlewares/auth.middleware");
const contactController = require("../controllers/contact.controller");

const {
  createContactValidation,
  updateContactValidation,
  validate,
} = require("../validators/contact.validator");

// `protect` runs before validation, same convention as
// event.routes.js/ticketType.routes.js — an unauthenticated caller
// should never even see field-level validation errors.

// Create Contact
router.post(
  "/create",
  protect,
  createContactValidation,
  validate,
  contactController.createContact
);

// Get All Contacts — supports ?search=&sortBy=&sortOrder=&page=&limit=
// &companyCategory=&reference= (see services/contact.service.js).
router.get(
  "/get-all-contacts",
  protect,
  contactController.getAllContacts
);

// Get Reference Summary — must be registered BEFORE the "/:id" route
// below, otherwise Express would match "reference-summary" as an :id
// param and route it to getContactById instead.
router.get(
  "/reference-summary",
  protect,
  contactController.getReferenceSummary
);

// Get Contact By Id
router.get(
  "/:id",
  protect,
  contactController.getContactById
);

// Update Contact
router.put(
  "/:id/update",
  protect,
  updateContactValidation,
  validate,
  contactController.updateContact
);

// Delete Contact (soft delete)
router.delete(
  "/:id/delete",
  protect,
  contactController.deleteContact
);

module.exports = router;