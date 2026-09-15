const express = require("express");
const router = express.Router();

const { protect } = require("../middlewares/auth.middleware");
const companyCategoryController = require("../controllers/companycategory.controller");

const {
  createCompanyCategoryValidation,
  updateCompanyCategoryValidation,
  validate,
} = require("../validators/companycategory.validator");

// `protect` runs before validation, same convention as
// contact.routes.js/event.routes.js/ticketType.routes.js — an
// unauthenticated caller should never even see field-level validation
// errors.

// Create Company Category
router.post(
  "/create",
  protect,
  createCompanyCategoryValidation,
  validate,
  companyCategoryController.createCompanyCategory
);

// Get All Company Categories — supports ?search=&sortBy=&sortOrder=&page=&limit=
router.get(
  "/get-all-categories",
  protect,
  companyCategoryController.getAllCompanyCategories
);

// Get Company Category By Id
router.get(
  "/:id",
  protect,
  companyCategoryController.getCompanyCategoryById
);

// Update Company Category
router.put(
  "/:id/update",
  protect,
  updateCompanyCategoryValidation,
  validate,
  companyCategoryController.updateCompanyCategory
);

// Delete Company Category (soft delete)
router.delete(
  "/:id/delete",
  protect,
  companyCategoryController.deleteCompanyCategory
);

module.exports = router;