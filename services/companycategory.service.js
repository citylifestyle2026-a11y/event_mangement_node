const mongoose = require("mongoose");
const CompanyCategory = require("../models/companycategory.model");
const AppError = require("../utils/AppError");

// Same collation used by CompanyCategory.model.js's own unique index on
// `name`, so the duplicate-name pre-check below and that index agree on
// what "case-insensitive" means.
const CASE_INSENSITIVE_COLLATION = { locale: "en", strength: 2 };

// Fields the List API is allowed to sort by — kept to an explicit
// allow-list, same convention as contact.service.js's SORTABLE_FIELDS,
// so an unrecognized/typo'd `sortBy` query value can never silently
// turn into an unindexed or unexpected sort; it just falls back to the
// default instead.
const SORTABLE_FIELDS = ["name", "createdAt", "updatedAt"];

// ================= CREATE COMPANY CATEGORY =================
// `adminId` always comes from the authenticated admin (req.user.id in
// the controller), never from req.body — same convention already used
// by contactService.createContact/eventService.createEvent.
const createCompanyCategory = async (data, adminId) => {
  const { name, description } = data;

  await assertNameNotDuplicate(name);

  const category = await CompanyCategory.create({
    name,
    description: description || "",
    createdBy: adminId,
  });

  return category;
};

// ================= GET ALL COMPANY CATEGORIES =================
// Supports: search, sorting, pagination. Response shape mirrors
// contactService.getAllContacts (the service returns the full
// { success, message, data, pagination } payload, and the controller
// just forwards it as-is).
const getAllCompanyCategories = async (query) => {
  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 10;
  const search = (query.search || "").trim();

  const sortField = SORTABLE_FIELDS.includes(query.sortBy)
    ? query.sortBy
    : "createdAt";
  const sortOrder = query.sortOrder === "asc" ? 1 : -1;

  const filter = { isDeleted: { $ne: true } };

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }

  const total = await CompanyCategory.countDocuments(filter);

  const categories = await CompanyCategory.find(filter)
    .populate("createdBy", "name")
    .sort({ [sortField]: sortOrder })
    .skip((page - 1) * limit)
    .limit(limit);

  return {
    success: true,
    message: "Company Categories fetched successfully",
    data: categories,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

// ================= GET COMPANY CATEGORY BY ID =================
const getCompanyCategoryById = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid Company Category ID", 400);
  }

  const category = await CompanyCategory.findOne({
    _id: id,
    isDeleted: { $ne: true },
  }).populate("createdBy", "name");

  if (!category) {
    throw new AppError("Company Category not found", 404);
  }

  return category;
};

// ================= UPDATE COMPANY CATEGORY =================
// Only fields actually present in `data` are touched — an edit may send
// just a subset of fields (same convention as
// contactService.updateContact leaving untouched fields alone).
const updateCompanyCategory = async (id, data) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid Company Category ID", 400);
  }

  const category = await CompanyCategory.findOne({
    _id: id,
    isDeleted: { $ne: true },
  });

  if (!category) {
    throw new AppError("Company Category not found", 404);
  }

  // Only re-check for a duplicate if the name is actually changing —
  // re-saving a category with its own unchanged name must never be
  // rejected as "already exists".
  if (
    data.name !== undefined &&
    data.name.trim().toLowerCase() !== category.name.trim().toLowerCase()
  ) {
    await assertNameNotDuplicate(data.name, id);
  }

  const updateFields = {};

  if (data.name !== undefined) updateFields.name = data.name;
  if (data.description !== undefined) updateFields.description = data.description;

  const updatedCategory = await CompanyCategory.findOneAndUpdate(
    { _id: id, isDeleted: { $ne: true } },
    updateFields,
    { new: true, runValidators: true }
  ).populate("createdBy", "name");

  return updatedCategory;
};

// ================= DELETE COMPANY CATEGORY (SOFT DELETE) =================
// Same soft-delete pattern as contactService.deleteContact /
// bookingService.deleteBooking: sets isDeleted/deletedAt/deletedBy
// rather than removing the document. Contacts referencing this category
// (Contact.companyCategory) are intentionally left untouched here —
// cascading behavior for a deleted category is outside this task's
// scope and existing business rules aren't being changed.
const deleteCompanyCategory = async (id, adminId) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid Company Category ID", 400);
  }

  const category = await CompanyCategory.findOne({
    _id: id,
    isDeleted: { $ne: true },
  });

  if (!category) {
    throw new AppError("Company Category not found", 404);
  }

  category.isDeleted = true;
  category.deletedAt = new Date();
  category.deletedBy = adminId;

  await category.save();

  return category;
};

// Case-insensitive duplicate-name pre-check, used by both
// createCompanyCategory and updateCompanyCategory. This is a friendly
// early rejection with a clear message — the collation-based unique
// index already on CompanyCategory.model.js's `name` field remains the
// actual guarantee against a race between two concurrent creates with
// the same name (which would otherwise surface as a raw E11000, still
// handled gracefully by app.js's global error handler as a fallback).
async function assertNameNotDuplicate(name, excludeId = null) {
  const filter = {
    isDeleted: { $ne: true },
    name: String(name || "").trim(),
  };

  if (excludeId) {
    filter._id = { $ne: excludeId };
  }

  const existing = await CompanyCategory.findOne(filter).collation(
    CASE_INSENSITIVE_COLLATION
  );

  if (existing) {
    throw new AppError("Category name already exists", 400);
  }
}

module.exports = {
  createCompanyCategory,
  getAllCompanyCategories,
  getCompanyCategoryById,
  updateCompanyCategory,
  deleteCompanyCategory,
};