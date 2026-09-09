// utils/buildQrNotificationBodyParams.js
//
// Builds the ordered body-parameter array for the approved WhatsApp
// template "event_booking_qr_pass" (used via
// whatsappService.sendMediaTemplateMessage — see
// services/whatsapp.service.js). The approved template body is:
//
//   Hello {{1}},
//   Your booking has been confirmed successfully.
//   Event: {{2}}
//   Booking Number: {{3}}
//   Ticket Number: {{4}}
//   Ticket Type: {{5}}
//   Please show the QR code attached to this message at the event entry.
//   Thank you!
//
// so the array below MUST stay in this exact order:
//   {{1}} = booking.name
//   {{2}} = event.title
//   {{3}} = booking.bookingNumber
//   {{4}} = ticket.ticketNumber
//   {{5}} = ticketType.ticketName
//
// Changing this order/count requires the WhatsApp template itself to be
// re-approved with a matching structure — do not change it here alone.
//
// Shared by:
//   - services/booking.service.js -> sendBookingWhatsAppNotifications
//     (sent right after a new booking's tickets are created)
//   - services/bookingTicket.service.js -> resendTicket
//     (re-sends the same message for an existing ticket)
// so both flows always build an identical, correctly mapped message.
const buildQrNotificationBodyParams = ({ booking, event, ticketType, ticket }) => [
  booking.name,
  event.title,
  booking.bookingNumber,
  ticket.ticketNumber,
  ticketType.ticketName,
];

module.exports = buildQrNotificationBodyParams;
