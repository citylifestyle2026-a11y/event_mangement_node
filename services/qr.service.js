const jwt = require("jsonwebtoken");

const BookingTicket = require("../models/bookingTicket.model");
const AppError = require("../utils/AppError");
 // verfiy qr
const verifyQr = async ({ qrToken }) => {
  // ==========================
  // 1. Verify QR Token
  // ==========================
  let payload;

  try {
    payload = jwt.verify(qrToken, process.env.JWT_SECRET);
  } catch (error) {
    throw new AppError("Invalid or expired QR code.", 401);
  }

  // ==========================
  // 2. Find Ticket
  // ==========================
  const ticket = await BookingTicket.findOne({
    ticketNumber: payload.ticketNumber,
  })
    .populate({
      path: "bookingId",
      select:
        "bookingNumber name mobileNumber email quantity amount discount isDeleted",
    })
    .populate({
      path: "eventId",
      select:
        "title venueName address startDateTime endDateTime isActive",
    })
    .populate({
      path: "ticketTypeId",
      select: "ticketName amount",
    });

  if (!ticket) {
    throw new AppError("QR ticket not found.", 404);
  }

  // ==========================
  // 3. Booking Validation
  // ==========================
  if (!ticket.bookingId) {
    throw new AppError("Booking not found.", 404);
  }

  if (ticket.bookingId.isDeleted) {
    throw new AppError("This booking has been cancelled.", 400);
  }

  // ==========================
  // 4. Ticket Validation
  // ==========================
  if (ticket.status === "Cancelled") {
    throw new AppError("This ticket has been cancelled.", 400);
  }

  if (ticket.status === "Used") {
    throw new AppError("This ticket has already been used.", 400);
  }

  // ==========================
  // 5. Event Validation
  // ==========================
  if (!ticket.eventId) {
    throw new AppError("Event not found.", 404);
  }

  if (!ticket.eventId.isActive) {
    throw new AppError("This event is inactive.", 400);
  }

  if (new Date() > new Date(ticket.eventId.endDateTime)) {
    throw new AppError("This event has already ended.", 400);
  }

  // ==========================
  // 6. Return Response DTO
  // ==========================
  return {
    bookingId: ticket.bookingId._id,
    bookingNumber: ticket.bookingNumber,
    ticketId: ticket._id,
    ticketNumber: ticket.ticketNumber,
    status: ticket.status,
    isRegistered: ticket.isRegistered,
     qrToken: ticket.qrToken, 
    attendee: ticket.attendee,

    booking: {
      quantity: ticket.bookingId.quantity,
      amount: ticket.bookingId.amount,
      discount: ticket.bookingId.discount,
    },

    event: {
      id: ticket.eventId._id,
      title: ticket.eventId.title,
      venueName: ticket.eventId.venueName,
      address: ticket.eventId.address,
      startDateTime: ticket.eventId.startDateTime,
      endDateTime: ticket.eventId.endDateTime,
    },

    ticketType: {
      id: ticket.ticketTypeId._id,
      ticketName: ticket.ticketTypeId.ticketName,
      amount: ticket.ticketTypeId.amount,
    },
  };
};
// ================= CHECK-IN QR =================
const checkInQr = async ({ qrToken, scannedBy }) => {
  // 1. Verify JWT
  let payload;

  try {
    payload = jwt.verify(qrToken, process.env.JWT_SECRET);
  } catch (error) {
    throw new AppError("Invalid or expired QR code.", 401);
  }

  // 2. Find Ticket
  const ticket = await BookingTicket.findOne({
    ticketNumber: payload.ticketNumber,
  });

  if (!ticket) {
    throw new AppError("Ticket not found.", 404);
  }

  // 3. Status Validation
  if (ticket.status === "Used") {
    throw new AppError("This ticket has already been checked in.", 400);
  }

  if (ticket.status === "Cancelled") {
    throw new AppError("This ticket has been cancelled.", 400);
  }

  // 4. Update Ticket
  ticket.status = "Used";
  ticket.scannedAt = new Date();
  ticket.scannedBy = scannedBy;

  await ticket.save();

  return {
    ticketId: ticket._id,
    ticketNumber: ticket.ticketNumber,
    status: ticket.status,
    scannedAt: ticket.scannedAt,
  };
};
module.exports = {
  verifyQr,
  checkInQr,
};