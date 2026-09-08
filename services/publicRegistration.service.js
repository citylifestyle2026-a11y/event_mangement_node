// services/publicRegistration.service.js
//
// Public, no-login counterpart to bookingTicket.service.js's registerUser.
// Everything here is reached only through a signed registration token (see
// utils/generateRegistrationToken.js / utils/verifyRegistrationToken.js) —
// there is no admin/staff auth on this flow, so the token IS the identity
// check. bookingTicket.service.js and its protected route/controller are
// untouched; this file does not import from or alter them.

const BookingTicket = require("../models/bookingTicket.model");
const uploadToCloudinary = require("../utils/cloudinary.util");
const deleteFromCloudinary = require("../utils/deleteCloudinaryFile");
const AppError = require("../utils/AppError");
const verifyRegistrationToken = require("../utils/verifyRegistrationToken");

// Shapes a ticket document down to the minimum fields safe to hand to an
// unauthenticated caller — no bookingId, no other tickets on the booking,
// no internal Cloudinary public IDs, no qrToken, etc.
const toPublicSafeTicket = (ticket) => ({
  ticketNumber: ticket.ticketNumber,
  isRegistered: ticket.isRegistered,
  eventTitle: ticket.eventId?.title || "",
  ticketTypeName: ticket.ticketTypeId?.ticketName || "",
  attendee: ticket.isRegistered
    ? {
        name: ticket.attendee?.name || "",
        mobileNumber: ticket.attendee?.mobileNumber || "",
        profileImage: ticket.attendee?.profileImage || "",
      }
    : null,
});

// ================= VALIDATE PUBLIC REGISTRATION TOKEN =================
// Decodes the token, confirms the ticket it points to still exists, and
// returns only what the public registration page needs to render (event
// name, ticket type, and whether it's already registered) — never the
// full BookingTicket document.
const getRegistrationDetails = async (token) => {
  const ticketId = verifyRegistrationToken(token);

  const ticket = await BookingTicket.findById(ticketId)
    .select("ticketNumber isRegistered attendee eventId ticketTypeId")
    .populate("eventId", "title")
    .populate("ticketTypeId", "ticketName");

  if (!ticket) {
    throw new AppError("Ticket not found", 404);
  }

  return toPublicSafeTicket(ticket);
};

// ================= PUBLIC REGISTER USER =================
// Registers the attendee on the single ticket the token was issued for.
// The ticketId comes exclusively from the verified token — `data`/`file`
// are never trusted to carry or override which ticket gets updated.
const registerPublicUser = async (token, data, file) => {
  const ticketId = verifyRegistrationToken(token);

  const ticket = await BookingTicket.findById(ticketId);

  if (!ticket) {
    throw new AppError("Ticket not found", 404);
  }

  if (ticket.isRegistered) {
    throw new AppError("This ticket has already been registered.", 409);
  }

  const { name, mobileNumber, email } = data;

  if (file) {
    if (ticket.attendee.profileImagePublicId) {
      await deleteFromCloudinary(ticket.attendee.profileImagePublicId);
    }

    const upload = await uploadToCloudinary(
      file.buffer,
      "event-management/register-user"
    );

    ticket.attendee.profileImage = upload.url;
    ticket.attendee.profileImagePublicId = upload.public_id;
  }

  ticket.attendee.name = name;
  ticket.attendee.mobileNumber = mobileNumber;
  ticket.attendee.email = email;
  ticket.attendee.registeredAt = new Date();

  ticket.isRegistered = true;

  await ticket.save();

  await ticket.populate("eventId", "title");
  await ticket.populate("ticketTypeId", "ticketName");

  return toPublicSafeTicket(ticket);
};

module.exports = {
  getRegistrationDetails,
  registerPublicUser,
};