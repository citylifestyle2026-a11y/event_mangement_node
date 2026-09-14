const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const path = require("path");
const healthRoutes = require("./routes/health.routes");
const authRoutes = require("./routes/auth.routes");
const userRoutes = require("./routes/user.routes");
const adminRoutes = require("./routes/admin.routes");
const eventRoutes = require('./routes/event.routes');
const ticketTypeRoutes = require("./routes/ticketType.routes");
const bookingRoutes = require("./routes/booking.routes");
const bookingTicketRoutes = require("./routes/bookingTicket.routes");
const qrRoutes = require("./routes/qr.routes");
const entryReportRoutes = require("./routes/entryReport.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const roleRoutes = require("./routes/role.routes");
const publicRegistrationRoutes = require("./routes/publicRegistration.routes");
const app = express();

// ---------- Core Middlewares ----------
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

// ---------- Routes ----------
app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
//users
app.use("/api/users", userRoutes);
// admin management (was previously missing here — routes/admin.routes.js
// already implements GET/POST/PUT for Admin Management and Edit
// Profile-by-Super-Admin, it just was never mounted, hence every
// /api/admin/... request falling through to the 404 handler below)
app.use("/api/admin", adminRoutes);
// events
app.use("/api/events", eventRoutes);
// ticket 
app.use("/api/ticket-type", ticketTypeRoutes);
// booking
app.use("/api/bookings", bookingRoutes);;
// booking ticket
app.use("/api/booking-ticket", bookingTicketRoutes);
// qr routes
app.use("/api/qr", qrRoutes);
// entery reports
app.use("/api/entry-report", entryReportRoutes);
//dashboard
app.use("/api/dashboard", dashboardRoutes);
// ROLE
app.use("/api/roles", roleRoutes);
// export
app.use("/api/bookings", bookingRoutes);
// publick register router
app.use("/api/public/registration", publicRegistrationRoutes);
// image 
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ---------- 404 Handler ----------
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// ---------- Global Error Handler ----------
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";

  // Invalid MongoDB ObjectId
  if (err.name === "CastError") {
    statusCode = 400;
    message = `Invalid value for field: ${err.path}`;
  }

  // Mongoose schema validation errors
  if (err.name === "ValidationError") {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((val) => val.message)
      .join(", ");
  }

  // Duplicate key error (e.g. email already exists)
  if (err.code === 11000) {
    statusCode = 400;
    const field = Object.keys(err.keyValue || {})[0];
    message = `${field ? field.charAt(0).toUpperCase() + field.slice(1) : "Field"} already exists`;
  }

  // JWT errors that slip through (defensive; auth middleware already handles most)
  if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Invalid token";
  }

  if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Token has expired";
  }

  if (process.env.NODE_ENV !== "production" && !err.isOperational) {
    console.error(err.stack);
  }

  res.status(statusCode).json({
    success: false,
    message,
  });
});

module.exports = app;