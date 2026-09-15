const contactService = require("../services/contact.service");

// ================= CREATE CONTACT =================
// Follows the same pattern as companyCategoryController.createCompanyCategory /
// ticketTypeService.createTicketType(req.body, req.user.id): the
// authenticated admin's id is passed as its own argument, never taken
// from (or spread into) req.body.
const createContact = async (req, res, next) => {
  try {
    const contact = await contactService.createContact(req.body, req.user.id);

    return res.status(201).json({
      success: true,
      message: "Contact created successfully",
      data: contact,
    });
  } catch (error) {
    next(error);
  }
};

// ================= GET ALL CONTACTS =================
// Supports: search, sorting, pagination, companyCategory filter,
// reference filter — all parsed inside contactService.getAllContacts
// from req.query, same convention as
// companyCategoryController.getAllCompanyCategories.
const getAllContacts = async (req, res, next) => {
  try {
    const result = await contactService.getAllContacts(req.query);

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

// ================= GET REFERENCE SUMMARY =================
// GET /api/contacts/reference-summary — no query params; returns every
// unique reference across all active contacts grouped with the list of
// contact names that hold it.
const getReferenceSummary = async (req, res, next) => {
  try {
    const result = await contactService.getReferenceSummary();

    return res.status(200).json({
      success: true,
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
};

// ================= GET CONTACT BY ID =================
const getContactById = async (req, res, next) => {
  try {
    const contact = await contactService.getContactById(req.params.id);

    return res.status(200).json({
      success: true,
      message: "Contact fetched successfully",
      data: contact,
    });
  } catch (error) {
    next(error);
  }
};

// ================= UPDATE CONTACT =================
const updateContact = async (req, res, next) => {
  try {
    const contact = await contactService.updateContact(
      req.params.id,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Contact updated successfully",
      data: contact,
    });
  } catch (error) {
    next(error);
  }
};

// ================= DELETE CONTACT (SOFT DELETE) =================
const deleteContact = async (req, res, next) => {
  try {
    const contact = await contactService.deleteContact(
      req.params.id,
      req.user.id
    );

    return res.status(200).json({
      success: true,
      message: "Contact deleted successfully",
      data: contact,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createContact,
  getAllContacts,
  getReferenceSummary,
  getContactById,
  updateContact,
  deleteContact,
};