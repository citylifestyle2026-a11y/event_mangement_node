const AppError = require("../utils/AppError");

// Backward compatible with the original call style: authorize("admin", "checker").
// Optionally accepts a trailing options object to also require a specific
// Checker permission: authorize("admin", "checker", { permission: "Entry Report" }).
// Admin accounts are never subject to the permission check — they keep
// full access, matching existing behavior everywhere else in the app.
const authorize = (...args) => {
  let permission = null;
  let roles = args;

  const last = args[args.length - 1];

  if (last && typeof last === "object" && !Array.isArray(last)) {
    permission = last.permission || null;
    roles = args.slice(0, -1);
  }

  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError("You are not authorized to access this resource.", 403)
      );
    }

    if (permission && req.user.role !== "admin") {
      const userPermissions = Array.isArray(req.user.permissions)
        ? req.user.permissions
        : [];

      if (!userPermissions.includes(permission)) {
        return next(
          new AppError(
            "You do not have permission to access this resource.",
            403
          )
        );
      }
    }

    next();
  };
};

// ================= SUPER ADMIN CHECK =================
// Reusable, standalone middleware for gating a route to the Super Admin
// only. Separate from authorize(...roles) above rather than folded into
// it, since this is a finer-grained check within the "admin" role, not a
// different role. Must run AFTER `protect` (same as authorize()) — it
// reads req.user.adminType, which is only ever the currently
// authenticated Admin document attached by `protect`, never guessed or
// taken from the request. Normal Admins are rejected with a 403 in the
// same AppError shape used everywhere else in this file/app. Admin
// documents saved before `adminType` existed default to "admin" (see
// admin.model.js), so they are correctly rejected here too, never
// mistaken for the Super Admin. This does NOT touch req.user.role, JWT,
// or login — it's purely an additional check layered on top of the
// existing "admin" role gate.
const requireSuperAdmin = (req, res, next) => {
  if (!req.user || req.user.adminType !== "superadmin") {
    return next(
      new AppError("Only the Super Admin can perform this action.", 403)
    );
  }

  next();
};

// Attached as a property on `authorize` (rather than a second named
// export) so every existing `const authorize = require(".../authorize.middleware")`
// call site keeps working unchanged, while new routes can additionally
// do `authorize.requireSuperAdmin`.
authorize.requireSuperAdmin = requireSuperAdmin;

module.exports = authorize;