// services/ticketDelivery.service.js
//
// Shared "registration complete" delivery pipeline, reused by BOTH
// registration flows exactly as required:
//   - services/bookingTicket.service.js#registerUser        (Private Registration, staff-authenticated)
//   - services/publicRegistration.service.js#registerPublicUser (Public Registration, no-login)
//
// For the ONE exact BookingTicket that was just registered, this:
//   1. Generates that specific person's individual ticket PDF (see
//      services/pdf.service.js) — event image/name, that attendee's own
//      photo/name/phone/email, ticket name, and THIS ticket's own
//      already-existing QR image + ticketNumber (never regenerated,
//      never shared with any other ticket).
//   2. Uploads it via the project's existing Cloudinary utility
//      (utils/cloudinary.util.js — no second storage system) so it gets
//      a public, non-localhost/non-blob URL.
//   3. Persists that URL on this exact ticket (ticketPdfUrl /
//      ticketPdfPublicId).
//   4. Sends the approved Chatbox "Download Ticket" WhatsApp template
//      (existing services/whatsapp.service.js#sendTemplateMessage,
//      already supports a Dynamic URL button param) to the SAME mobile
//      number already stored on the booking.
//
// ================= BEST-EFFORT, NEVER BLOCKS REGISTRATION =================
// Mirrors the existing "best-effort" WhatsApp philosophy already used at
// booking-creation time (see booking.service.js's
// sendRegistrationWhatsAppNotification): any failure here (PDF
// generation, Cloudinary, or the Chatbox API) is caught and only
// logged — never re-thrown — so a PDF/Cloudinary/WhatsApp outage can
// never turn an already-successful registration into a failed API
// request for the attendee. registerUser / registerPublicUser continue
// to return exactly as before either way.
const BookingTicket = require("../models/bookingTicket.model");
const Booking = require("../models/booking.model");
const Event = require("../models/event.model");
const TicketType = require("../models/ticketType.model");
const pdfService = require("./pdf.service");
const whatsappService = require("./whatsapp.service");
const buildTicketDownloadBodyParams = require("../utils/buildTicketDownloadBodyParams");

// ================= DELIVER ONE TICKET'S PDF (POST-REGISTRATION) =================
// `ticket` must be the exact, just-saved BookingTicket mongoose document
// (isRegistered: true, attendee already filled in by the caller).
// booking/event/ticketType are looked up fresh here rather than relying
// on whatever the caller may already have populated, so this function
// never depends on — or changes the shape of — whatever the calling
// service returns back through its own API response.
const deliverTicketPdf = async (ticket) => {
  try {
    if (!ticket) {
      return null;
    }

    const [booking, event, ticketType] = await Promise.all([
      Booking.findById(ticket.bookingId),
      Event.findById(ticket.eventId),
      TicketType.findById(ticket.ticketTypeId),
    ]);

    if (!booking || !event || !ticketType) {
      console.error(
        `Ticket PDF delivery skipped for ticket ${ticket.ticketNumber}: missing booking/event/ticketType.`
      );
      return null;
    }

    // ===== 1 & 2. Generate THIS attendee's own PDF, upload it =====
    const upload = await pdfService.generateAndUploadTicketPdf({
      event,
      ticketType,
      booking,
      ticket,
    });

    // ===== 3. Persist the PDF URL on THIS ticket only =====
    await BookingTicket.updateOne(
      { _id: ticket._id },
      {
        $set: {
          ticketPdfUrl: upload.url,
          ticketPdfPublicId: upload.public_id,
        },
      }
    );

    // Reflect on the in-memory document too, so a caller that still
    // holds this same `ticket` reference (and returns it in its API
    // response) sees the freshly generated PDF URL without a re-fetch.
    ticket.ticketPdfUrl = upload.url;
    ticket.ticketPdfPublicId = upload.public_id;

    // ===== 4. WhatsApp "Download Ticket" template =====
    // Sent to booking.mobileNumber — the SAME mobile number already
    // stored on the booking (per requirement), regardless of which
    // ticket/slot in a multi-quantity booking this attendee registered.
    const templateName =
      process.env.CHATBOX_TICKET_TEMPLATE_NAME || "event_ticket_download";
    const templateLanguage =
      process.env.CHATBOX_TICKET_TEMPLATE_LANGUAGE || "en";

    await whatsappService.sendTemplateMessage({
      phone: booking.mobileNumber,
      templateName,
      languageCode: templateLanguage,
      bodyParams: buildTicketDownloadBodyParams({ booking, event, ticket }),
      buttonParam: buildTicketDownloadBodyParams.buildTicketDownloadButtonParam(ticket),
    });

    return upload;
  } catch (error) {
    console.error(
      `Ticket PDF/WhatsApp delivery failed for ticket ${ticket?.ticketNumber}:`,
      error
    );
    return null;
  }
};

module.exports = {
  deliverTicketPdf,
};