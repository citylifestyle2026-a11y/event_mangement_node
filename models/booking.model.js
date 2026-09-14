const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    bookingNumber: {
      type: String,
      unique: true,
      trim: true,
    },

    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },

    ticketTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TicketType",
      required: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: 1,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    mobileNumber: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      trim: true,
      default: "",
    },

    discount: {
      type: Number,
      default: 0,
    },

    remark: {
      type: String,
      trim: true,
      default: "",
    },

    bookingStatus: {
      type: String,
      enum: ["Confirmed", "Cancelled"],
      default: "Confirmed",
    },

    // Tracks which Admin created this booking (req.user.id from the
    // authenticated admin — see booking.controller.js's createBooking).
    // Must ref "Admin", matching Event.createdBy and
    // TicketType.createdBy, so populate("createdBy", "name") actually
    // resolves to that admin's name instead of silently matching nothing.
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
   

    isDeleted: {
      type: Boolean,
      default: false,
    },

    deletedAt: {
      type: Date,
      default: null,
    },

    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Booking", bookingSchema);