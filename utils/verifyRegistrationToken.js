const jwt = require("jsonwebtoken");
const AppError = require("./AppError");
const {
  REGISTRATION_TOKEN_PURPOSE,
  getRegistrationTokenSecret,
} = require("./generateRegistrationToken");

/**
 * Verify a public registration token and return the single BookingTicket
 * id it grants access to.
 *
 * This is the ONLY place a ticketId is allowed to enter the public
 * registration flow — every caller must derive the ticket exclusively
 * from this function's return value, never from a request body/query
 * param, so a customer can never redirect their registration onto a
 * different ticket by editing the request.
 *
 * @param {String} token
 * @returns {String} ticketId encoded in the token
 * @throws {AppError} 400 if no token was provided
 * @throws {AppError} 401 if the token is expired
 * @throws {AppError} 401 if the token is malformed/invalid, or was not
 *   issued for this purpose (e.g. someone tried reusing a login/QR token)
 */
const verifyRegistrationToken = (token) => {
  if (!token) {
    throw new AppError("Registration token is required", 400);
  }

  let decoded;

  try {
    decoded = jwt.verify(token, getRegistrationTokenSecret());
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      throw new AppError(
        "This registration link has expired. Please request a new one.",
        401
      );
    }

    throw new AppError("Invalid registration link.", 401);
  }

  if (
    decoded.purpose !== REGISTRATION_TOKEN_PURPOSE ||
    !decoded.ticketId
  ) {
    throw new AppError("Invalid registration link.", 401);
  }

  return decoded.ticketId;
};

module.exports = verifyRegistrationToken;