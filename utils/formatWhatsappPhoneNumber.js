// utils/formatWhatsappPhoneNumber.js
//
// ================= ROOT CAUSE FIX: MISSING COUNTRY CODE =================
// Every mobile number in this project (Booking.mobileNumber AND
// BookingTicket.attendee.mobileNumber — see their validators in
// validators/booking.validator.js / validators/bookingTicket.validation.js)
// is stored as a bare 10-digit local number ("9876543210"), with no
// country code, because the registration/booking forms only ever collect
// a 10-digit Indian mobile number.
//
// The Chatbox WhatsApp Cloud API's `to` field, however, requires the
// recipient's FULL international WhatsApp ID — country code + number,
// digits only, no leading "+", no spaces/dashes (e.g. "919876543210").
// A bare 10-digit value like "9876543210" is not a valid WhatsApp ID, so
// Chatbox/Meta rejects the send (or it never matches any real WhatsApp
// account) — which is exactly why the "Download Ticket" template never
// reaches the attendee even though PDF generation and the Cloudinary
// upload both succeed and the correct attendee.mobileNumber is used.
//
// This is a single, shared normalization point used by every WhatsApp
// sender in services/whatsapp.service.js (image, media-template,
// template, text) so the fix applies uniformly everywhere a phone number
// is sent to Chatbox, instead of being patched ad-hoc per call site.
//
// Behavior:
//   - Strips everything except digits (handles "+91 98765 43210",
//     "+91-9876543210", etc. defensively, even though current input is
//     always a clean 10-digit string today).
//   - If the result is exactly 10 digits (a bare local number), prepends
//     the default country code (CHATBOX_DEFAULT_COUNTRY_CODE env var,
//     defaults to "91" for India).
//   - If the result already includes a country code (more than 10
//     digits), it's left as-is so already-correct numbers are never
//     double-prefixed.
//   - Empty/invalid input is returned as an empty string; callers already
//     validate for a non-empty phone before this runs.
const DEFAULT_COUNTRY_CODE = process.env.CHATBOX_DEFAULT_COUNTRY_CODE || "91";

const formatWhatsappPhoneNumber = (phone) => {
  const digitsOnly = String(phone ?? "").replace(/\D/g, "");

  if (!digitsOnly) {
    return "";
  }

  if (digitsOnly.length === 10) {
    return `${DEFAULT_COUNTRY_CODE}${digitsOnly}`;
  }

  return digitsOnly;
};

module.exports = formatWhatsappPhoneNumber;
