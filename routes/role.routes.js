const express = require("express");
const router = express.Router();

const roleController = require("../controllers/role.controller");
const { protect } = require("../middlewares/auth.middleware");

router.get("/", protect, roleController.getRole);

module.exports = router;