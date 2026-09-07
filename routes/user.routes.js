const express = require("express");
const router = express.Router();

const userController = require("../controllers/user.controller");
const { protect } = require("../middlewares/auth.middleware");
const authorize = require("../middlewares/authorize.middleware");
const upload = require("../middlewares/upload.middleware");
const {
  createUserValidation,
  updateUserValidation,
  validate,
} = require("../validators/user.validator");

// Create User
router.post(
  "/",
  protect,
  upload.single("profileImage"),
  createUserValidation,
  validate,
  userController.createUser
);
// get users
router.get(
  "/",
  protect,
  userController.getUsers
);
//update user
// Admin-only — a Checker must never be able to update another User
// document (including their own, since Checkers have no self-service
// profile endpoint here).
router.put(
  "/:id",
  protect,
  authorize("admin"),
  upload.single("profileImage"),
  updateUserValidation,
  validate,
  userController.updateUser
);
// delete users
// Admin-only — same reasoning as update above.
router.delete(
  "/:id",
  protect,
  authorize("admin"),
  userController.deleteUser
);
module.exports = router;