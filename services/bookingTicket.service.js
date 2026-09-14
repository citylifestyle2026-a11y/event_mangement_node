// services/bookingTicket.service.js

const BookingTicket = require("../models/bookingTicket.model");
const uploadImage = require("../utils/localUpload.util");
const deleteImage = require("../utils/deleteLocalFile");
const AppError = require("../utils/AppError");
const whatsappService = require("./whatsapp.service");
const pdfService = require("./pdf.service");
const buildTicketDownloadBodyParams = require("../utils/buildTicketDownloadBodyParams");
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
      await deleteImage(
        ticket.attendee.profileImagePublicId
      );
    }

    const upload = await uploadImage(
      file,
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
// Re-sends the SAME "Download Ticket" PDF message that is sent right
// after registration completes (see services/ticketDelivery.service.js),
// instead of the old QR-image message — e.g. for when a customer says
// they never received the original message, or lost it. Does not
// regenerate the QR code/token; the ticket's existing PDF (or a freshly
// generated one, if this ticket somehow doesn't have one yet) is simply
// re-delivered.
//
// Unlike the booking-creation/registration flow (where a WhatsApp
// failure is only logged so it can never fail an otherwise-successful
// request), this endpoint's entire purpose IS the WhatsApp send — so a
// failure here is intentionally NOT swallowed; it propagates to the
// controller so the caller gets a real error response instead of a
// false "success".
const resendTicket = async (ticketId) => {
  // "title" only used to be selected here, which is fine for the
  // WhatsApp resend text but silently dropped event.image/venueName/
  // address whenever this function's fallback below had to regenerate a
  // ticket PDF (services/pdf.service.js needs all four fields to render
  // that event's own image/venue box). Expanded to select every field
  // pdf.service.js actually reads, so a regenerated PDF always uses
  // this event's current data — same fallback behavior, just no longer
  // missing fields.
  const ticket = await BookingTicket.findById(ticketId)
    .populate("bookingId")
    .populate("eventId", "title image venueName address")
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

  if (!ticket.isRegistered) {
    throw new AppError(
      "This ticket has not been registered yet, so there is no ticket PDF to resend.",
      400
    );
  }

  // Reuse the existing PDF if this ticket already has one (the normal
  // case — every ticket gets one at registration time via
  // ticketDelivery.service.js). Only regenerate it here as a fallback,
  // e.g. for a ticket registered before PDF delivery existed.
  if (!ticket.ticketPdfUrl) {
    const upload = await pdfService.generateAndUploadTicketPdf({
      event,
      ticketType,
      booking,
      ticket,
    });

    await BookingTicket.updateOne(
      { _id: ticket._id },
      {
        $set: {
          ticketPdfUrl: upload.url,
          ticketPdfPublicId: upload.public_id,
        },
      }
    );

    ticket.ticketPdfUrl = upload.url;
    ticket.ticketPdfPublicId = upload.public_id;
  }

  // Same recipient convention as ticketDelivery.service.js's
  // deliverTicketPdf: this exact attendee's own entered mobile number,
  // falling back to the booking's mobileNumber only if that's somehow
  // empty.
  const recipientMobileNumber =
    ticket?.attendee?.mobileNumber || booking.mobileNumber;

  const templateName =
    process.env.CHATBOX_TICKET_TEMPLATE_NAME || "event_ticket_download";
  const templateLanguage =
    process.env.CHATBOX_TICKET_TEMPLATE_LANGUAGE || "en";

  await whatsappService.sendTemplateMessage({
    phone: recipientMobileNumber,
    templateName,
    languageCode: templateLanguage,
    bodyParams: buildTicketDownloadBodyParams({ booking, event, ticket }),
    buttonParam: buildTicketDownloadBodyParams.buildTicketDownloadButtonParam(ticket),
  });

  return ticket;
};

module.exports = {
  registerUser,
  resendTicket,
};