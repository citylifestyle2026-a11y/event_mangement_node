const Admin = require("../models/admin.model");
const AppError = require("../utils/AppError");
const deleteImage = require("../utils/deleteLocalFile");

// ================= CREATE ADMIN =================
// Super-Admin-only (enforced in the route via authorize.requireSuperAdmin,
// not here). Only name/email/mobile/password are ever read off `data` —
// role/adminType are never taken from the caller, so a new Admin is
// always created with the schema defaults: role: "admin" (existing auth
// system, unchanged) and adminType: "admin" (new accounts are never
// created as Super Admin through this endpoint). Password hashing is not
// done here — Admin's own pre("save") hook (admin.model.js) hashes it,
// same as every other Admin/User creation path in this app.
const createAdmin = async (data) => {
  const { name, email, mobile, password } = data;

  const normalizedEmail = email.toLowerCase();

  // Uniqueness checks scoped to the Admin collection, same pattern as
  // updateOwnAdmin below.
  const emailExists = await Admin.findOne({ email: normalizedEmail });

  if (emailExists) {
    throw new AppError("Email already exists", 409);
  }

  const mobileExists = await Admin.findOne({ mobile });

  if (mobileExists) {
    throw new AppError("Mobile already exists", 409);
  }

  const admin = await Admin.create({
    name,
    email: normalizedEmail,
    mobile,
    password,
    // role and adminType intentionally NOT passed through — both take
    // their schema defaults ("admin" / "admin").
  });

  const newAdmin = admin.toObject();
  delete newAdmin.password;

  return newAdmin;
};

// ================= GET ALL ADMINS =================
// No admin-wise filtering: every Admin sees every Admin account, matching
// requirement that all Admins continue to see all existing data. Password
// is never returned (schema already has select:false on it; `.select`
// kept explicit here too as a second, visible safeguard).
const getAllAdmins = async () => {
  const admins = await Admin.find()
    .select("-password")
    .sort({ createdAt: -1 })
    .lean();

  return admins;
};

// ================= UPDATE OWN ADMIN =================
// `adminId` is always the caller's own id (req.user.id from the `protect`
// middleware, passed in by the controller) — never an id supplied by the
// client — so this can only ever update the currently logged-in Admin's
// own record, never another Admin's. Only name/email/mobile are writable;
// password/status/role are out of scope here (password reset/email
// verification are a later phase, per requirements).
const updateOwnAdmin = async (adminId, data) => {
  return updateAdminRecord(adminId, data);
};

// ================= UPDATE ANY ADMIN BY ID (SUPER ADMIN ONLY) =================
// Authorization (Super-Admin-only) is enforced at the route layer
// (authorize.requireSuperAdmin) — this function itself just performs the
// update against whatever `adminId` the (already-authorized) caller
// supplies, sharing the exact same field whitelist/uniqueness rules as
// updateOwnAdmin via updateAdminRecord below, so a Super Admin editing
// someone else's row follows identical validation to editing their own.
const updateAdminById = async (adminId, data) => {
  return updateAdminRecord(adminId, data);
};

// ================= SHARED UPDATE LOGIC =================
// Common to updateOwnAdmin (target is always the caller's own id) and
// updateAdminById (target is a Super-Admin-supplied id). Only
// name/email/mobile are ever read off `data` in either case — password/
// status/role/adminType stay out of scope here (password reset/email
// verification are a later phase, per requirements), so neither entry
// point can be used to escalate privileges or change another Admin's
// credentials.
const updateAdminRecord = async (adminId, data) => {
  const { name, email, mobile } = data;

  const admin = await Admin.findById(adminId);

  if (!admin) {
    throw new AppError("Admin not found", 404);
  }

  // Uniqueness checks scoped to the Admin collection only, excluding this
  // same admin's own document — mirrors the existing duplicate-check
  // pattern in userService.updateUser.
  if (email && email.toLowerCase() !== admin.email) {
    const emailExists = await Admin.findOne({
      email: email.toLowerCase(),
      _id: { $ne: adminId },
    });

    if (emailExists) {
      throw new AppError("Email already exists", 409);
    }
  }

  if (mobile && mobile !== admin.mobile) {
    const mobileExists = await Admin.findOne({
      mobile,
      _id: { $ne: adminId },
    });

    if (mobileExists) {
      throw new AppError("Mobile already exists", 409);
    }
  }

  if (name !== undefined) {
    admin.name = name;
  }

  if (email !== undefined) {
    admin.email = email;
  }

  if (mobile !== undefined) {
    admin.mobile = mobile;
  }

  await admin.save();

  const updatedAdmin = admin.toObject();
  delete updatedAdmin.password;

  return updatedAdmin;
};

// ================= DELETE ADMIN (SUPER ADMIN ONLY) =================
// Authorization (Super-Admin-only) is enforced at the route layer
// (authorize.requireSuperAdmin), same as updateAdminById above — this
// function itself just performs the delete.
// `requestingAdminId` is always req.user.id (the currently authenticated
// Super Admin, from the `protect` middleware) — never something the
// client can point elsewhere — and is only ever used for the self-delete
// guard below, never as the delete target itself.
const deleteAdmin = async (adminId, requestingAdminId) => {
  if (String(adminId) === String(requestingAdminId)) {
    throw new AppError("You cannot delete your own account", 400);
  }

  const admin = await Admin.findById(adminId);

  if (!admin) {
    throw new AppError("Admin not found", 404);
  }

  // Same local-storage cleanup pattern as userService.deleteUser — remove
  // the profile photo file from disk before the document itself is
  // deleted, so no orphaned image is left behind in uploads/admins.
  if (admin.profileImagePublicId) {
    await deleteImage(admin.profileImagePublicId);
  }

  await Admin.findByIdAndDelete(adminId);

  return admin;
};

module.exports = {
  createAdmin,
  getAllAdmins,
  updateOwnAdmin,
  updateAdminById,
  deleteAdmin,
};