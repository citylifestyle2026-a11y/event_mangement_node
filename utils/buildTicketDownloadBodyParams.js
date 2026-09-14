// utils/buildTicketDownloadBodyParams.js
//
// Builds the ordered BODY-parameter array + the Dynamic URL "Download
// Ticket" button parameter for the approved Chatbox WhatsApp template
// sent once a specific attendee's registration is complete (see
// services/ticketDelivery.service.js). Mirrors the existing
// buildRegistrationBodyParams.js / buildQrNotificationBodyParams.js
// pattern used elsewhere in this project: body params in a fixed
// {{1}}, {{2}}, ... order that must match the approved template
// exactly, plus a single Dynamic URL button parameter (Cloud-API
// component shape: type "button", sub_type "url", index "0"), sent via
// whatsappService.sendTemplateMessage.
//
// Template name/language are configurable via CHATBOX_TICKET_TEMPLATE_NAME
// / CHATBOX_TICKET_TEMPLATE_LANGUAGE (see services/ticketDelivery.service.js),
// same convention as CHATBOX_QR_TEMPLATE_NAME / CHATBOX_REGISTRATION_TEMPLATE_NAME.
//
// Suggested approved template body (default name "event_ticket_download"):
//
//   Hello {{1}},
//   Your ticket for {{2}} is ready.
//   Ticket Number: {{3}}
//   Tap the button below to download your ticket.
//
// so the array below MUST stay in this exact order:
//   {{1}} = attendee name actually entered on THIS ticket (falls back
//           to the booking's name if somehow not yet set)
//   {{2}} = event.title
//   {{3}} = ticket.ticketNumber (this exact ticket's registration number)
//
// Changing this order/count requires the WhatsApp template itself to be
// re-approved with a matching structure — do not change it here alone.
const buildTicketDownloadBodyParams = ({ booking, event, ticket }) => [
  ticket?.attendee?.name || booking?.name,
];

// ================= BUTTON PARAMETER (DYNAMIC URL) =================
// Ticket PDFs are now saved to this server's own local disk storage
// (see services/pdf.service.js / utils/localUpload.util.js), so every
// ticket's URL always shares the exact same fixed prefix:
//   https://api.citytoppers.in/uploads/ticket-pdfs/...
// (or whatever PUBLIC_API_URL is configured to, in non-production
// environments).
//
// WhatsApp's "Visit Website" Dynamic URL button only allows the SUFFIX
// after a FIXED, template-approved base URL to change per message — the
// domain/prefix itself is locked in at template approval time and can
// never vary per send. This is exactly the same constraint already
// solved in this project for the registration-link button (fixed
// frontend domain + per-ticket token suffix — see
// buildRegistrationBodyParams.js#buildRegistrationButtonParam).
//
// IMPORTANT — REQUIRED WHATSAPP TEMPLATE UPDATE: the approved "Download
// Ticket" template's button base URL was previously configured (on
// Meta/Chatbox's side) as "https://res.cloudinary.com/". It must be
// updated to match PUBLIC_API_URL + "/uploads/" (e.g.
// "https://api.citytoppers.in/uploads/") — this is a template
// configuration change made outside this codebase, not something this
// file alone can fix. Until that template is updated, the "Download
// Ticket" WhatsApp button will keep pointing at the old Cloudinary
// domain even though ticketPdfUrl itself is correct.
const PUBLIC_API_URL = (process.env.PUBLIC_API_URL || "https://api.citytoppers.in")
  .trim()
  .replace(/\/+$/, "");
const LOCAL_UPLOADS_BASE = `${PUBLIC_API_URL}/uploads/`;

const buildTicketDownloadButtonParam = (ticket) => {
  const pdfUrl = String(ticket?.ticketPdfUrl || "").trim();

  if (!pdfUrl) {
    return "";
  }

  return pdfUrl.startsWith(LOCAL_UPLOADS_BASE)
    ? pdfUrl.slice(LOCAL_UPLOADS_BASE.length)
    : pdfUrl;
};

module.exports = buildTicketDownloadBodyParams;
module.exports.buildTicketDownloadButtonParam = buildTicketDownloadButtonParam;