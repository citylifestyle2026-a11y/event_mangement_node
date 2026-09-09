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

module.exports = authorize;