// utils/buildRegistrationBodyParams.js
//
// Builds the ordered BODY-parameter array for the approved Chatbox
// WhatsApp template "event_registration_link" (template id 3749514),
// sent via whatsappService.sendTemplateMessage (BODY ONLY -- no
// header/image, unlike the QR template). The re-approved template body
// is:
//
//   Hello {{1}},
//   Your booking has been confirmed successfully.
//   Event: {{2}}
//   Booking Number: {{3}}
//   Please click the button below to complete registration for your tickets.
//   Thank you!
//
// so the array below MUST stay in this exact order:
//   {{1}} = booking.name
//   {{2}} = event.title
//   {{3}} = booking.bookingNumber
//
// The registration URL is NO LONGER a body parameter (that used to be
// {{4}} and is what caused Chatbox error 132000 -- "number of
// localizable_params (4) does not match the expected number of params
// (3)"). The link is now delivered via the template's "Visit Website"
// button (Dynamic URL) instead -- see buildRegistrationButtonParam
// below, used together with this function from
// services/booking.service.js's sendRegistrationWhatsAppNotification.
//
// Changing this order/count requires the WhatsApp template itself to be
// re-approved with a matching structure -- do not change it here alone.
const buildRegistrationBodyParams = ({ booking, event }) => [
  booking.name,
  event.title,
  booking.bookingNumber,
];

// ================= BUTTON PARAMETER (DYNAMIC URL) =================
// Value for the template's single "Visit Website" button component
// (Cloud-API component shape: type "button", sub_type "url",
// index "0"). The button's base URL
// (https://event-mangement-qbpz.vercel.app/r/) is configured on the
// approved template itself; WhatsApp appends this parameter directly
// after that base URL to produce the final tappable link
// (https://event-mangement-qbpz.vercel.app/r/<token>), matching the
// frontend's `/r/:token` route. This must therefore be the RAW
// registration token only -- never a full URL, and never the ticket or
// booking id -- so it stays a single unique-per-ticket token exactly as
// minted by utils/generateRegistrationToken.js and persisted on
// BookingTicket.registrationToken.
const buildRegistrationButtonParam = (ticket) => ticket.registrationToken;

module.exports = buildRegistrationBodyParams;
module.exports.buildRegistrationButtonParam = buildRegistrationButtonParam;