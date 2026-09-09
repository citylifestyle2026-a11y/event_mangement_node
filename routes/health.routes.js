const express = require("express");

const router = express.Router();

// @route   GET /api/health
// @desc    Basic server health check
// @access  Public
router.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server Running Successfully",
  });
});

module.exports = router;
