const companyCategoryService = require("../services/companycategory.service");

// ================= CREATE COMPANY CATEGORY =================
// Follows the same pattern as contactController.createContact /
// ticketTypeService.createTicketType(req.body, req.user.id): the
// authenticated admin's id is passed as its own argument, never taken
// from (or spread into) req.body.
const createCompanyCategory = async (req, res, next) => {
  try {
    const category = await companyCategoryService.createCompanyCategory(
      req.body,
      req.user.id
    );

    return res.status(201).json({
      success: true,
      message: "Company Category created successfully",
      data: category,
    });
  } catch (error) {
    next(error);
  }
};

// ================= GET ALL COMPANY CATEGORIES =================
// Supports: search, sorting, pagination — all parsed inside
// companyCategoryService.getAllCompanyCategories from req.query, same
// convention as contactController.getAllContacts.
const getAllCompanyCategories = async (req, res, next) => {
  try {
    const result = await companyCategoryService.getAllCompanyCategories(
      req.query
    );

    return res.status(200).json({
      success: true,
      message: result.message,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

// ================= GET COMPANY CATEGORY BY ID =================
const getCompanyCategoryById = async (req, res, next) => {
  try {
    const category = await companyCategoryService.getCompanyCategoryById(
      req.params.id
    );

    return res.status(200).json({
      success: true,
      message: "Company Category fetched successfully",
      data: category,
    });
  } catch (error) {
    next(error);
  }
};

// ================= UPDATE COMPANY CATEGORY =================
const updateCompanyCategory = async (req, res, next) => {
  try {
    const category = await companyCategoryService.updateCompanyCategory(
      req.params.id,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Company Category updated successfully",
      data: category,
    });
  } catch (error) {
    next(error);
  }
};

// ================= DELETE COMPANY CATEGORY (SOFT DELETE) =================
const deleteCompanyCategory = async (req, res, next) => {
  try {
    const category = await companyCategoryService.deleteCompanyCategory(
      req.params.id,
      req.user.id
    );

    return res.status(200).json({
      success: true,
      message: "Company Category deleted successfully",
      data: category,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createCompanyCategory,
  getAllCompanyCategories,
  getCompanyCategoryById,
  updateCompanyCategory,
  deleteCompanyCategory,
};