// services/bookingTicket.service.js

const BookingTicket = require("../models/bookingTicket.model");
const uploadToCloudinary = require("../utils/cloudinary.util");
const deleteFromCloudinary = require("../utils/deleteCloudinaryFile");
const AppError = require("../utils/AppError");
const whatsappService = require("./whatsapp.service");
const buildQrNotificationBodyParams = require("../utils/buildQrNotificationBodyParams");
const ticketDeliveryService = require("./ticketDelivery.service");

// ================= REGISTER / UPDATE USER =================

const registerUser = async (ticketId, data, file, userId) => {
  const ticket = await BookingTicket.findById(ticketId);

  if (!ticket) {
    throw new AppError("Ticket not found", 404);
  }

  const {
    name,
    mobileNumber,
    email,
  } = data;

  // Upload profile image if available
  if (file) {

    // Delete old image
    if (ticket.attendee.profileImagePublicId) {
      await deleteFromCloudinary(
        ticket.attendee.profileImagePublicId
      );
    }

    const upload = await uploadToCloudinary(
      file.buffer,
      "event-management/register-user"
    );

    ticket.attendee.profileImage = upload.url;
    ticket.attendee.profileImagePublicId =
      upload.public_id;
  }

  ticket.attendee.name = name;
  ticket.attendee.mobileNumber = mobileNumber;
  ticket.attendee.email = email;

  ticket.attendee.registeredAt = new Date();

  ticket.isRegistered = true;

  await ticket.save();

  // ================= REGISTRATION COMPLETE -> PDF + WHATSAPP =================
  // Private Registration counterpart of publicRegistration.service.js's
  // identical call. Generates THIS ticket's own individual PDF, uploads
  // it (existing Cloudinary setup), persists the URL on this ticket, and
  // sends the "Download Ticket" WhatsApp template to the booking's
  // mobile number — see services/ticketDelivery.service.js. Best-effort:
  // never throws, so a PDF/WhatsApp failure can never fail this
  // otherwise-successful register-user request. `ticket` is mutated
  // in-place with ticketPdfUrl/ticketPdfPublicId when it succeeds, so
  // the object returned below reflects it.
  await ticketDeliveryService.deliverTicketPdf(ticket);

  return ticket;
};


// ================= RESEND TICKET (WHATSAPP) =================
// Re-sends the ticket's existing QR image using the SAME approved
// WhatsApp template + body-param mapping used at booking-creation time
// (see booking.service.js's sendBookingWhatsAppNotifications and
// utils/buildQrNotificationBodyParams.js) — e.g. for when a customer
// says they never received the original message, or lost it. Does not
// regenerate the QR code/token and does not touch Cloudinary; it only
// re-delivers the ticket's existing qrImage.
//
// Unlike the booking-creation flow (where a WhatsApp failure is only
// logged so it can never fail an otherwise-successful booking), this
// endpoint's entire purpose IS the WhatsApp send — so a failure here is
// intentionally NOT swallowed; it propagates to the controller so the
// caller gets a real error response instead of a false "success".
const resendTicket = async (ticketId) => {
  const ticket = await BookingTicket.findById(ticketId)
    .populate("bookingId")
    .populate("eventId", "title")
    .populate("ticketTypeId", "ticketName");

  if (!ticket) {
    throw new AppError("Ticket not found", 404);
  }

  const booking = ticket.bookingId;
  const event = ticket.eventId;
  const ticketType = ticket.ticketTypeId;

  if (!booking || !event || !ticketType) {
    throw new AppError(
      "This ticket is missing its booking/event/ticket type details and cannot be resent.",
      500
    );
  }

  if (!ticket.qrImage) {
    throw new AppError("This ticket has no QR image to resend.", 400);
  }

  const templateName = process.env.CHATBOX_QR_TEMPLATE_NAME;
  const templateLanguage = process.env.CHATBOX_QR_TEMPLATE_LANGUAGE || "en";

  await whatsappService.sendMediaTemplateMessage({
    phone: booking.mobileNumber,
    templateName,
    languageCode: templateLanguage,
    imageUrl: ticket.qrImage,
    bodyParams: buildQrNotificationBodyParams({ booking, event, ticketType, ticket }),
  });

  return ticket;
};

module.exports = {
  registerUser,
  resendTicket,
};