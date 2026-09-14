const adminService = require("../services/admin.service");

// ================= CREATE ADMIN =================
// Super-Admin-only route (protect -> authorize("admin") ->
// authorize.requireSuperAdmin already enforced in the route before this
// controller ever runs). Only name/email/mobile/password are forwarded
// to the service — nothing else from req.body is passed through, so
// role/adminType can never be set by the caller.
const createAdmin = async (req, res, next) => {
  try {
    const { name, email, mobile, password } = req.body;

    const newAdmin = await adminService.createAdmin({
      name,
      email,
      mobile,
      password,
    });

    return res.status(201).json({
      success: true,
      message: "Admin created successfully",
      data: newAdmin,
    });
  } catch (error) {
    next(error);
  }
};

// ================= GET ALL ADMINS =================
const getAllAdmins = async (req, res, next) => {
  try {
    const admins = await adminService.getAllAdmins();

    return res.status(200).json({
      success: true,
      message: "Admins fetched successfully",
      data: admins,
    });
  } catch (error) {
    next(error);
  }
};

// ================= UPDATE OWN ADMIN =================
// Always targets req.user.id (the authenticated Admin resolved by the
// `protect` middleware) — there is no :id in this route at all, so there
// is no id parameter a caller could tamper with to reach another Admin's
// record. This is the server-side enforcement that an Admin can only
// ever update their own account.
const updateOwnAdmin = async (req, res, next) => {
  try {
    const updatedAdmin = await adminService.updateOwnAdmin(
      req.user.id,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Admin updated successfully",
      data: updatedAdmin,
    });
  } catch (error) {
    next(error);
  }
};

// ================= UPDATE ANY ADMIN BY ID (SUPER ADMIN ONLY) =================
// Route-level authorize.requireSuperAdmin already guarantees only the
// Super Admin ever reaches this controller. req.params.id is the target
// Admin to update — this is the only place in the Admin routes where the
// target id comes from the URL rather than always being req.user.id.
const updateAdminById = async (req, res, next) => {
  try {
    const updatedAdmin = await adminService.updateAdminById(
      req.params.id,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Admin updated successfully",
      data: updatedAdmin,
    });
  } catch (error) {
    next(error);
  }
};

// ================= DELETE ADMIN (SUPER ADMIN ONLY) =================
// Route-level authorize.requireSuperAdmin already guarantees only the
// Super Admin ever reaches this controller — same gate as
// updateAdminById above. req.params.id is the target Admin to delete;
// req.user.id (the Super Admin themself) is only ever passed through for
// the self-delete guard in the service, never as the delete target.
const deleteAdmin = async (req, res, next) => {
  try {
    await adminService.deleteAdmin(req.params.id, req.user.id);

    return res.status(200).json({
      success: true,
      message: "Admin deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createAdmin,
  getAllAdmins,
  updateOwnAdmin,
  updateAdminById,
  deleteAdmin,
};