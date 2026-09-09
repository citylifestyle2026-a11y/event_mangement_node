const bookingService = require("../services/booking.service");

// Create Booking
// Follows the same pattern as eventService.createEvent(req.body, req.file, req.user.id)
// and ticketTypeService.createTicketType(req.body, req.user.id): the
// authenticated user's id is passed as its own argument, never taken from
// (or spread into) req.body.
const createBooking = async (req, res, next) => {
  try {
    const result = await bookingService.createBooking(req.body, req.user.id);

    return res.status(201).json({
      success: true,
      message: "Booking created successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// ================= GET ALL BOOKINGS =================
const getAllBookings = async (req, res, next) => {
  try {
    const result = await bookingService.getAllBookings(req.query);

    return res.status(200).json({
      success: true,
      message: "Bookings fetched successfully",
      data: result.rows,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

// ================= DELETE BOOKING =================
const deleteBooking = async (req, res, next) => {
  try {
    const { remark } = req.body;

    // Was req.user._id — functionally identical (Mongoose's `.id` is a
    // virtual getter for `_id.toString()`), just normalized to `.id` to
    // match the convention used everywhere else (Event, TicketType,
    // createBooking above). This was already a separate argument, unlike
    // createBooking's previous merged-object call.
    const booking = await bookingService.deleteBooking(
      req.params.id,
      remark,
      req.user.id
    );

    return res.status(200).json({
      success: true,
      message: "Booking deleted successfully",
      data: booking,
    });
  } catch (error) {
    next(error);
  }
};
// getbooking by id
const getBookingById = async (req, res, next) => {
  try {
    const booking = await bookingService.getBookingById(
      req.params.id
    );

    return res.status(200).json({
      success: true,
      message: "Booking fetched successfully",
      data: booking,
    });
  } catch (error) {
    next(error);
  }
}; const exportBookingsController = async (req, res, next) => {
  try {
    await bookingService.exportBookings(req.query, res);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createBooking,
  getAllBookings,
  deleteBooking,
  getBookingById,
  exportBookingsController,
};