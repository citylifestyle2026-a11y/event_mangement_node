const mongoose = require("mongoose");

const bookingTicketSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      index: true,
    },

    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      index: true,
    },

    ticketTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TicketType",
      required: true,
    },

    bookingNumber: {
      type: String,
      required: true,
      index: true,
    },

    ticketNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    qrToken: {
      type: String,
      required: true,
    },

    qrImage: {
      type: String,
      default: "",
    },

    // ================= PUBLIC TICKET REGISTRATION =================
    // Signed JWT (see utils/generateRegistrationToken.js) that grants
    // access to this exact ticket on the public, unauthenticated
    // registration flow (`/r/:token` -> GET/PUT /api/public/registration/:token).
    // Generated once per ticket at booking-creation time and persisted
    // here so it can be reused as-is on every WhatsApp resend — a new
    // token must never be minted on resend, since that would silently
    // invalidate any link the customer already has. Never returned by
    // any public-facing API response (see
    // services/publicRegistration.service.js's toPublicSafeTicket).
    registrationToken: {
      type: String,
      default: "",
    },

    qrImagePublicId: {
      type: String,
      default: "",
    },

    // ================= INDIVIDUAL TICKET PDF (POST-REGISTRATION) =================
    // Publicly accessible Cloudinary URL of THIS exact ticket's own PDF
    // (event image/name, attendee photo/name/phone, ticket name, and
    // this ticket's own existing qrImage + ticketNumber). Generated once
    // registration completes for this specific ticket (see
    // services/ticketDelivery.service.js) — never a PDF shared across
    // other tickets, even other tickets on the same booking. Regenerated
    // (and the old Cloudinary "raw" file removed) on every fresh
    // registerUser call, using ticketPdfPublicId to know what to clean
    // up. Never returned on the public (unauthenticated) registration
    // API — see publicRegistration.service.js's toPublicSafeTicket —
    // it is only ever delivered via the WhatsApp "Download Ticket"
    // template button.
    ticketPdfUrl: {
      type: String,
      default: "",
    },

    ticketPdfPublicId: {
      type: String,
      default: "",
    },

    status: {
      type: String,
      enum: ["Active", "Used", "Cancelled","Expired"],
      default: "Active",
      index: true,
    },

    scannedAt: {
      type: Date,
      default: null,
    },

    // The date this specific ticket is valid for entry — copied from the
    // selected TicketType's allowDates at booking-creation time (see
    // booking.service.js's createBooking). Distinct from scannedAt (when
    // the ticket was actually scanned at the gate) and from createdAt
    // (when the booking record was made).
    passDate: {
      type: Date,
      default: null,
    },

    scannedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // ================= REGISTER USER =================

    isRegistered: {
      type: Boolean,
      default: false,
    },

    attendee: {
      name: {
        type: String,
        trim: true,
        default: "",
      },

      mobileNumber: {
        type: String,
        trim: true,
        default: "",
      },

      email: {
        type: String,
        trim: true,
        lowercase: true,
        default: "",
      },

      profileImage: {
        type: String,
        default: "",
      },

      profileImagePublicId: {
        type: String,
        default: "",
      },

      registeredAt: {
        type: Date,
        default: null,
      },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("BookingTicket", bookingTicketSchema);