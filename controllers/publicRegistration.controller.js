const publicRegistrationService = require("../services/publicRegistration.service");

// ================= VALIDATE PUBLIC REGISTRATION TOKEN =================
// GET /api/public/registration/:token
// No auth. Lets the public registration page confirm the link is valid
// and show basic ticket/event context before the customer fills the form.
const validateToken = async (req, res, next) => {
  try {
    const details = await publicRegistrationService.getRegistrationDetails(
      req.params.token
    );

    return res.status(200).json({
      success: true,
      message: "Registration token is valid",
      data: details,
    });
  } catch (error) {
    next(error);
  }
};

// ================= PUBLIC REGISTER USER =================
// PUT /api/public/registration/:token
// No auth. The ticket is identified solely by `req.params.token` — the
// request body/query can never redirect this onto a different ticket.
const registerUser = async (req, res, next) => {
  try {
    const ticket = await publicRegistrationService.registerPublicUser(
      req.params.token,
      req.body,
      req.file
    );

    return res.status(200).json({
      success: true,
      message: "You have been registered successfully.",
      data: ticket,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  validateToken,
  registerUser,
};