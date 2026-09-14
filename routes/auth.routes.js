const express = require("express");
const router = express.Router();

const {
    login,
    getProfile,
    updateProfile,
    resetPassword,
    forgotPassword,
    verifyResetOtp,
    resetPasswordWithOtp,
    logout,
} = require("../controllers/auth.controller");
const { protect } = require("../middlewares/auth.middleware");
const validateRequest = require("../middlewares/validate.middleware");
const upload = require("../middlewares/upload.middleware");
const {
    loginValidation,
    updateProfileValidation,
    resetPasswordValidation,
    forgotPasswordValidation,
    verifyResetOtpValidation,
    resetPasswordWithOtpValidation,
} = require("../validators/auth.validator");

// @route   POST /api/auth/login
router.post("/login", loginValidation, validateRequest, login);

// @route   GET /api/auth/profile
router.get("/profile", protect, getProfile);

// @route   PUT /api/auth/profile
// `upload.single("profileImage")` runs BEFORE validation so an optional
// avatar file is parsed into req.file and the rest of the multipart
// fields (name, etc.) land in req.body exactly like a JSON body would —
// same multer-then-validate order already used by routes/user.routes.js.
// Reuses the existing 5 MB image upload middleware (same allowed
// types/size limit as every other profile-photo upload); no new upload
// configuration was introduced.
router.put(
    "/profile",
    protect,
    upload.single("profileImage"),
    updateProfileValidation,
    validateRequest,
    updateProfile
);

// @route   POST /api/auth/reset-password
router.post("/reset-password", protect, resetPasswordValidation, validateRequest, resetPassword);

// ================= FORGOT PASSWORD (OTP, via email) =================
// All three routes below are intentionally PUBLIC (no `protect`) — this
// is the flow for someone who is NOT logged in and doesn't remember
// their password, so there is no JWT to check yet. Works for both Admin
// and Checker/User accounts (see controllers/auth.controller.js) since
// they share the same Login page.

// @route   POST /api/auth/forgot-password
// Body: { email }. Always responds with the same generic message
// regardless of whether the email is registered (see controller).
router.post(
    "/forgot-password",
    forgotPasswordValidation,
    validateRequest,
    forgotPassword
);

// @route   POST /api/auth/verify-reset-otp
// Body: { email, otp }. Lets the frontend confirm the OTP before showing
// the new-password screen; does not itself change anything.
router.post(
    "/verify-reset-otp",
    verifyResetOtpValidation,
    validateRequest,
    verifyResetOtp
);

// @route   POST /api/auth/reset-password-confirm
// Body: { email, otp, newPassword, confirmPassword }. Re-verifies the
// OTP from scratch before actually changing the password.
router.post(
    "/reset-password-confirm",
    resetPasswordWithOtpValidation,
    validateRequest,
    resetPasswordWithOtp
);

// @route   POST /api/auth/logout
router.post("/logout", protect, logout);

module.exports = router;
