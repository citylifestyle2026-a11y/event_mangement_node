const express = require("express");
const router = express.Router();

const { protect } = require("../middlewares/auth.middleware");
const authorize = require("../middlewares/authorize.middleware");

const adminController = require("../controllers/admin.controller");

const {
  createAdminValidation,
  updateAdminValidation,
  validate,
} = require("../validators/admin.validator");

// Create Admin
// Super-Admin-only: protect -> authorize("admin") (must be an Admin
// account at all, unchanged existing gate) -> authorize.requireSuperAdmin
// (new, finer-grained gate: must specifically be adminType: "superadmin").
// A normal Admin is rejected with a 403 before the controller ever runs.
router.post(
  "/",
  protect,
  authorize("admin"),
  authorize.requireSuperAdmin,
  createAdminValidation,
  validate,
  adminController.createAdmin
);

// Get All Admins
// admin-only (a Checker/User has no reason to see the Admin list).
// No admin-wise data filtering — every Admin sees every Admin here.
router.get(
  "/",
  protect,
  authorize("admin"),
  adminController.getAllAdmins
);

// Update Own Admin Profile
// Deliberately no ":id" segment — the target record is always
// req.user.id (the currently authenticated Admin), so there is no id in
// the URL or body for a caller to change to reach another Admin's
// account. name/email/mobile only; no password/status/role here.
router.put(
  "/me",
  protect,
  authorize("admin"),
  updateAdminValidation,
  validate,
  adminController.updateOwnAdmin
);

// Update Any Admin By Id (Super Admin only)
// Placed AFTER "/me" so a request to the literal path "/me" is still
// matched by the route above first (Express matches in registration
// order) — this "/:id" route never intercepts "/me".
// Super-Admin-only: protect -> authorize("admin") -> authorize.requireSuperAdmin,
// same two-gate pattern as POST "/" (createAdmin) above. A normal Admin
// is rejected with a 403 before the controller ever runs, so the
// permission is enforced server-side regardless of what the frontend
// shows/hides.
router.put(
  "/:id",
  protect,
  authorize("admin"),
  authorize.requireSuperAdmin,
  updateAdminValidation,
  validate,
  adminController.updateAdminById
);

// Delete Admin (Super Admin only)
// Same two-gate pattern as every other Super-Admin-only route above.
// The service layer additionally blocks the Super Admin from deleting
// their own account (self-delete guard), so this can only ever be used
// to remove a DIFFERENT Admin's account.
router.delete(
  "/:id",
  protect,
  authorize("admin"),
  authorize.requireSuperAdmin,
  adminController.deleteAdmin
);

module.exports = router;