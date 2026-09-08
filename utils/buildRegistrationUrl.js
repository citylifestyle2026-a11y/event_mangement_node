// utils/buildRegistrationUrl.js
//
// Builds the public, no-login registration URL for a single BookingTicket
// from its signed registration token (see
// utils/generateRegistrationToken.js). Frontend route is `/r/:token` (see
// App.jsx). The base domain is ALWAYS read from the
// PUBLIC_FRONTEND_URL environment variable -- never hardcoded here or by
// any caller -- so the same code works across local/staging/production
// without a code change.
const AppError = require("./AppError");

const buildRegistrationUrl = (token) => {
  const baseUrl = process.env.PUBLIC_FRONTEND_URL;

  if (!baseUrl || !String(baseUrl).trim()) {
    // Surfaced as a normal thrown error -- callers that treat WhatsApp
    // sending as best-effort (see services/booking.service.js) already
    // catch and log this rather than letting it fail the booking.
    throw new AppError(
      "PUBLIC_FRONTEND_URL is not configured. Cannot build a public registration URL.",
      500
    );
  }

  // Strip any trailing slash so we never end up with a double slash
  // before "/r/<token>".
  const normalizedBase = String(baseUrl).trim().replace(/\/+$/, "");

  return `${normalizedBase}/r/${token}`;
};

module.exports = buildRegistrationUrl;