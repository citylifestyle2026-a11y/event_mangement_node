const express = require("express");
const router = express.Router();

const userController = require("../controllers/user.controller");
const { protect } = require("../middlewares/auth.middleware");
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
router.put(
  "/:id",
  protect,
  upload.single("profileImage"),
  updateUserValidation,
  validate,
  userController.updateUser
);
// delete users
router.delete(
  "/:id",
  protect,
  userController.deleteUser
);
module.exports = router;