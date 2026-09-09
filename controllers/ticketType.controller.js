const ticketTypeService = require("../services/ticketType.service");

// Create Ticket Type
// Follows the same pattern as eventService.createEvent(req.body, req.file, req.user.id):
// the authenticated admin's id is passed as its own argument, never taken
// from (or spread into) req.body.
const createTicketType = async (req, res) => {
  try {
    const ticketType = await ticketTypeService.createTicketType(
      req.body,
      req.user.id
    );

    return res.status(201).json({
      success: true,
      message: "Ticket Type created successfully",
      data: ticketType,
    });
  } catch (error) {
    console.error("Create Ticket Type Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
// Get All Ticket Types
const getAllTicketTypes = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;
    const { eventId } = req.params;

    const result = await ticketTypeService.getAllTicketTypes({
      eventId,
      page,
      limit,
      search,
    });

    return res.status(200).json({
      success: true,
      message: "Ticket Types fetched successfully",
      ...result,
    });
  } catch (error) {
    console.error("Get Ticket Types Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};
// upadate
const updateTicketType = async (req, res) => {
  try {
    const ticketType = await ticketTypeService.updateTicketType(
      req.params.id,
      req.body
    );

    if (!ticketType) {
      return res.status(404).json({
        success: false,
        message: "Ticket Type not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Ticket Type updated successfully",
      data: ticketType,
    });
  } catch (error) {
    console.error("Update Ticket Type Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};
// delete
const deleteTicketType = async (req, res) => {
  try {
    const ticketType = await ticketTypeService.deleteTicketType(req.params.id);

    if (!ticketType) {
      return res.status(404).json({
        success: false,
        message: "Ticket Type not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Ticket Type deleted successfully",
    });
  } catch (error) {
    console.error("Delete Ticket Type Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};
module.exports = {
  createTicketType,
  getAllTicketTypes,
  updateTicketType,
  deleteTicketType
};