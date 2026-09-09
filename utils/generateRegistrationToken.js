const jwt = require("jsonwebtoken");

// Distinct purpose claim so this token can never be confused with (or
// substituted by) any other JWT the app issues — the admin/user login
// token from generateToken.js, or the long-lived QR token from
// generateQrToken.js. All three currently sign with the same JWT_SECRET
// (unless REGISTRATION_TOKEN_SECRET is set below), so the purpose check
// on verification is what actually stops token-confusion, not the secret
// alone.
const REGISTRATION_TOKEN_PURPOSE = "public_ticket_registration";

// Falls back to JWT_SECRET if a dedicated secret isn't configured, so this
// works out of the box on the existing project without requiring a new
// env var — but setting REGISTRATION_TOKEN_SECRET is recommended so a
// leaked registration link can never be used to forge/verify any other
// token type (or vice versa).
const getRegistrationTokenSecret = () =>
  process.env.REGISTRATION_TOKEN_SECRET || process.env.JWT_SECRET;

// How long a public registration link stays valid. Registration links are
// shared with customers over WhatsApp well before an event, so this
// defaults to a longer window than the admin login token. Configurable via
// REGISTRATION_TOKEN_EXPIRES_IN (e.g. "30d", "60d").
const getRegistrationTokenExpiry = () =>
  process.env.REGISTRATION_TOKEN_EXPIRES_IN || "60d";

/**
 * Generate a signed, single-purpose token that identifies exactly one
 * BookingTicket for the public (no-login) registration flow.
 *
 * The token is the ONLY source of truth for which ticket a public request
 * is allowed to touch — callers must never accept a ticketId from a public
 * request body/query and use it instead of (or alongside) this token.
 *
 * Not wired into the booking/WhatsApp flow yet (that's a later step); this
 * is exposed here so it can be reused from there without duplicating the
 * signing logic.
 *
 * @param {String|import("mongoose").Types.ObjectId} ticketId - The
 *   BookingTicket _id this link grants registration access to.
 * @returns {String} signed JWT
 */
const generateRegistrationToken = (ticketId) => {
  if (!ticketId) {
    throw new Error("generateRegistrationToken: ticketId is required");
  }

  return jwt.sign(
    {
      ticketId: ticketId.toString(),
      purpose: REGISTRATION_TOKEN_PURPOSE,
    },
    getRegistrationTokenSecret(),
    { expiresIn: getRegistrationTokenExpiry() }
  );
};

module.exports = generateRegistrationToken;
module.exports.REGISTRATION_TOKEN_PURPOSE = REGISTRATION_TOKEN_PURPOSE;
module.exports.getRegistrationTokenSecret = getRegistrationTokenSecret;