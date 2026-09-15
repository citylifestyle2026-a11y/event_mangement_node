const bookingTicketService = require("../services/bookingTicket.service");

// ================= GET REGISTER USER (FOR EDIT PRE-FILL) =================

const getRegisterUser = async (req, res, next) => {
  try {
    const ticket = await bookingTicketService.getRegisterUser(
      req.params.ticketId
    );

    return res.status(200).json({
      success: true,
      message: "Register user fetched successfully",
      data: ticket,
    });
  } catch (error) {
    next(error);
  }
};


// ================= REGISTER / UPDATE USER =================

const registerUser = async (req, res, next) => {
  try {
    const ticket = await bookingTicketService.registerUser(
      req.params.ticketId,
      req.body,
      req.file,
      req.user._id
    );

    return res.status(200).json({
      success: true,
      message: "Register user updated successfully",
      data: ticket,
    });
  } catch (error) {
    next(error);
  }
};


// ================= RESEND TICKET (WHATSAPP) =================

const resendTicket = async (req, res, next) => {
  try {
    const ticket = await bookingTicketService.resendTicket(
      req.params.ticketId
    );

    return res.status(200).json({
      success: true,
      message: "Ticket resent successfully.",
      data: ticket,
    });
  } catch (error) {
    next(error);
  }
};


module.exports = {
  getRegisterUser,
  registerUser,
  resendTicket,
};