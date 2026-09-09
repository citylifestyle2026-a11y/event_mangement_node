const express = require("express");
const router = express.Router();

const {
    login,
    getProfile,
    updateProfile,
    resetPassword,
    logout,
} = require("../controllers/auth.controller");
const { protect } = require("../middlewares/auth.middleware");
const validateRequest = require("../middlewares/validate.middleware");
const {
    loginValidation,
    updateProfileValidation,
    resetPasswordValidation,
} = require("../validators/auth.validator");

// @route   POST /api/auth/login
router.post("/login", loginValidation, validateRequest, login);

// @route   GET /api/auth/profile
router.get("/profile", protect, getProfile);

// @route   PUT /api/auth/profile
router.put("/profile", protect, updateProfileValidation, validateRequest, updateProfile);

// @route   POST /api/auth/reset-password
router.post("/reset-password", protect, resetPasswordValidation, validateRequest, resetPassword);

// @route   POST /api/auth/logout
router.post("/logout", protect, logout);

module.exports = router;
