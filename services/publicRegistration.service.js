// services/publicRegistration.service.js
//
// Public, no-login counterpart to bookingTicket.service.js's registerUser.
// Everything here is reached only through a signed registration token (see
// utils/generateRegistrationToken.js / utils/verifyRegistrationToken.js) —
// there is no admin/staff auth on this flow, so the token IS the identity
// check. bookingTicket.service.js and its protected route/controller are
// untouched; this file does not import from or alter them.
//
// ================= MULTI-QUANTITY REGISTRATION =================
// A booking with quantity > 1 has multiple BookingTicket documents under
// the same bookingId, but only ONE registration token/link is ever issued
// (see routes/comment: "Do NOT change token/JWT or Public Registration
// URL"). So the token no longer identifies "the one ticket" — it
// identifies the BOOKING, via whichever ticket it was originally signed
// for (the "anchor" ticket). Every read/write below resolves the token to
// that anchor ticket's bookingId, then operates on the full set of
// sibling tickets under that booking. The token payload/verification
// itself is unchanged.
//
// Registration is always applied to the earliest still-unregistered
// sibling ticket (stable creation order via `_id`), never to a ticket
// chosen by the client. `data`/`file` still never carry or override which
// ticket gets updated — this preserves the original "token is the sole
// identity" guarantee while extending it to a set of tickets instead of
// one, and makes it impossible to double-register the same slot on a
// refresh/replay: once a ticket's isRegistered flips to true it drops out
// of the "earliest unregistered" query for good.

const BookingTicket = require("../models/bookingTicket.model");
const uploadToCloudinary = require("../utils/cloudinary.util");
const deleteFromCloudinary = require("../utils/deleteCloudinaryFile");
const AppError = require("../utils/AppError");
const verifyRegistrationToken = require("../utils/verifyRegistrationToken");
const ticketDeliveryService = require("./ticketDelivery.service");

// Shapes a ticket document down to the minimum fields safe to hand to an
// unauthenticated caller — no bookingId, no internal Cloudinary public
// IDs, no qrToken, no _id, etc. Deliberately has no ticket identifier at
// all, so the client can never pass one back in (see module comment).
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

// Resolves a token down to the bookingId it belongs to. Throws the same
// "Ticket not found" error as before if the anchor ticket is gone, so
// existing error handling/UI copy for a dead/invalid link is unaffected.
const resolveBookingIdFromToken = async (token) => {
  const ticketId = verifyRegistrationToken(token);

  const anchorTicket = await BookingTicket.findById(ticketId).select(
    "bookingId"
  );

  if (!anchorTicket) {
    throw new AppError("Ticket not found", 404);
  }

  return anchorTicket.bookingId;
};

// ================= VALIDATE PUBLIC REGISTRATION TOKEN =================
// Decodes the token, resolves the booking it belongs to, and returns
// every ticket under that booking so the public registration page can
// render one card per quantity slot — each with its own persisted
// isRegistered/attendee status straight from the DB. This is what makes
// a page refresh correct: slot 1 shows "already registered" after reload
// because the DB record, not any client state, is what's read here.
const getRegistrationDetails = async (token) => {
  const bookingId = await resolveBookingIdFromToken(token);

  const tickets = await BookingTicket.find({ bookingId })
    .select("ticketNumber isRegistered attendee eventId ticketTypeId bookingId")
    .sort({ _id: 1 })
    .populate("eventId", "title")
    .populate("ticketTypeId", "ticketName")
    .populate("bookingId", "quantity");

  if (!tickets.length) {
    throw new AppError("Ticket not found", 404);
  }

  const quantity = tickets[0].bookingId?.quantity ?? tickets.length;

  return {
    quantity,
    tickets: tickets.map(toPublicSafeTicket),
  };
};

// ================= PUBLIC REGISTER USER =================
// Registers the attendee on the earliest still-unregistered ticket under
// the booking the token resolves to. If every ticket for this booking is
// already registered (all quantity slots filled, or a slot 4+ attempt),
// this rejects with 409 instead of allowing any further registration.
const registerPublicUser = async (token, data, file) => {
  const bookingId = await resolveBookingIdFromToken(token);

  const ticket = await BookingTicket.findOne({
    bookingId,
    isRegistered: false,
  }).sort({ _id: 1 });

  if (!ticket) {
    throw new AppError(
      "All tickets for this booking have already been registered.",
      409
    );
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

  // ================= REGISTRATION COMPLETE -> PDF + WHATSAPP =================
  // Public Registration counterpart of bookingTicket.service.js's
  // identical call. Generates THIS exact ticket's own individual PDF,
  // uploads it (existing Cloudinary setup), persists the URL on this
  // ticket, and sends the "Download Ticket" WhatsApp template to the
  // booking's mobile number — see services/ticketDelivery.service.js.
  // Best-effort: never throws, so a PDF/WhatsApp failure can never fail
  // this otherwise-successful public registration submit. Quantity > 1
  // is handled correctly for free: each slot's own registerPublicUser
  // call operates on its own `ticket` here, so each attendee still gets
  // their own PDF/WhatsApp message.
  await ticketDeliveryService.deliverTicketPdf(ticket);

  // Return every sibling ticket's up-to-date status in one response, so
  // the frontend can repaint all slots immediately after a successful
  // submit without firing a second request.
  const tickets = await BookingTicket.find({ bookingId })
    .select("ticketNumber isRegistered attendee eventId ticketTypeId")
    .sort({ _id: 1 })
    .populate("eventId", "title")
    .populate("ticketTypeId", "ticketName");

  return { tickets: tickets.map(toPublicSafeTicket) };
};

module.exports = {
  getRegistrationDetails,
  registerPublicUser,
};