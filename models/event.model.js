const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    // Stable, human-readable event identifier used as the prefix for
    // that event's booking numbers (e.g. "EVT001-BK001"). Assigned once,
    // atomically, from the shared EVENT_SEQ counter (see
    // utils/generateEventCode.js) — at creation time for new events via
    // eventService.createEvent, or lazily/self-healingly for pre-existing
    // events that predate this field via eventService.getOrCreateEventCode
    // (called from bookingService.createBooking). Never reassigned once
    // set, so it stays stable for the lifetime of the event.
    // `sparse: true` lets existing documents with no eventCode yet
    // coexist under the `unique` index until they're backfilled.
    eventCode: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    startDateTime: {
      type: Date,
      required: true,
    },
    endDateTime: {
      type: Date,
      required: true,
    },
    venueName: {
      type: String,
      required: true,
      trim: true,
    },
    latitude: {
      type: String,
      required: true,
    },
    longitude: {
      type: String,
      required: true,
    },
    address: {
      type: String,
      required: true,
    },
    image: {
      type: String,
      default: "",
    },
    imagePublicId: {
      type: String,
      default: "",
    },
    termsConditions: {
      type: String,
      required: true,
    },

    videoLinks: [
      {
        type: String,
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    // Explicit, persisted lifecycle status — separate from `isActive`
    // (which stays a manually-controlled admin flag and is never touched
    // by expiry logic; see changeEventStatus/updateEvent in
    // event.service.js). This field only ever tracks time-based expiry:
    // "Expired" once endDateTime has passed, "Active" otherwise. Kept in
    // sync lazily (no cron/scheduler) — see
    // eventService.syncEventExpiryStatus, called from the read/update
    // paths where an Event is loaded.
    status: {
      type: String,
      enum: ["Active", "Expired"],
      default: "Active",
    },
    // Tracks which Admin created this event. Not required so existing
    // documents created before this field was added continue to work —
    // they simply resolve to createdBy: null / not populated.
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },

    // Soft-delete fields, matching the same pattern already used on
    // Booking (isDeleted / deletedAt / deletedBy). Deleting an event
    // never hard-removes the document — see eventService.deleteEvent.
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

module.exports = mongoose.model("Event", eventSchema);