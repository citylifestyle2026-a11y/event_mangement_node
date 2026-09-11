const bcrypt = require("bcrypt");
const eventService = require("../services/event.service");
const Admin = require("../models/admin.model");
//create event
exports.createEvent = async (req, res, next) => {
  try {
    // Creator always comes from the authenticated admin (via `protect`),
    // never from the request body.
    const event = await eventService.createEvent(req.body, req.file, req.user.id);

    return res.status(201).json({
      success: true,
      message: "Event created successfully.",
      data: event,
    });
  } catch (error) {
    next(error);
  }
};
// get by id
exports.getEventById = async (req, res, next) => {
  try {
    const event = await eventService.getEventById(req.params.id);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Event fetched successfully",
      data: event,
    });
  } catch (error) {
    next(error);
  }
};
// Get All Events
exports.getAllEvents = async (req, res, next) => {
  try {
    const result = await eventService.getAllEvents(req.query);

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
// Update Event
exports.updateEvent = async (req, res, next) => {
  try {
    const event = await eventService.updateEvent(
      req.params.id,
      req.body,
      req.file
    );

    return res.status(200).json({
      success: true,
      message: "Event updated successfully.",
      data: event,
    });
  } catch (error) {
    next(error);
  }
};
// Delete Event
// ================= SECURE MANUAL EVENT DELETE =================
// Flow: Confirmation (frontend) -> Admin email + password (this request)
// -> Verify -> Delete. Credentials are checked against the ADMIN
// ATTACHED TO THE CURRENT TOKEN (req.user, set by `protect`) — never
// against whichever Admin document merely matches the submitted email.
// This guarantees a valid admin cannot delete an event using another
// admin's email/password: the submitted email must belong to the same
// account the bearer token was issued for. On any verification failure
// this returns before eventService.deleteEvent is ever called, so the
// event, its Bookings, and BookingTickets are left completely untouched
// (no partial deletion). The delete transaction itself in
// eventService.deleteEvent is unchanged.
exports.deleteEvent = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Only an authenticated Admin account may perform a manual delete.
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only an Admin can delete an event.",
      });
    }

    // Re-fetch the currently authenticated admin's own record (with the
    // normally-hidden password field) by id from the token — not by the
    // submitted email — so there is no way to authenticate as one admin
    // and verify a different admin's credentials.
    const admin = await Admin.findById(req.user.id).select("+password");

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Admin not found.",
      });
    }

    // Submitted email must match the authenticated admin's own email.
    if (
      typeof email !== "string" ||
      email.trim().toLowerCase() !== admin.email.toLowerCase()
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid admin email or password.",
      });
    }

    // Reuses the same bcrypt.compare password verification used by the
    // existing login flow (auth.controller.js).
    const isPasswordMatch = await bcrypt.compare(password, admin.password);

    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid admin email or password.",
      });
    }

    // Credentials verified — proceed with the existing, unmodified
    // delete transaction (Event + Booking + BookingTicket cascade).
    const result = await eventService.deleteEvent(req.params.id, req.user.id);

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
// Change Event Status
exports.changeEventStatus = async (req, res, next) => {
  try {
    const result = await eventService.changeEventStatus(req.params.id);

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};