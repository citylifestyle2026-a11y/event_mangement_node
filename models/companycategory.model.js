const mongoose = require("mongoose");

/**
 * CompanyCategory Model
 * A small lookup collection used to categorize Contacts (see
 * Contact.companyCategory in models/contact.model.js, which refs this
 * model). Kept as its own collection — rather than a free-text field
 * directly on Contact — so category names stay consistent and
 * de-duplicated across every contact, the same reasoning TicketType is
 * its own collection rather than a free-text field on Booking.
 */
const companyCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    // Mirrors Admin/User's active/inactive status convention (as
    // opposed to Event's Active/Expired, which is specifically
    // time-based expiry and doesn't apply to a lookup list like this).
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },

    // Soft-delete fields, same pattern already used on Event/Booking
    // (isDeleted / deletedAt / deletedBy) — deleting a category never
    // hard-removes the document.
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

    // Tracks which Admin created this category, same convention as
    // Event.createdBy / TicketType.createdBy.
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Case-insensitive uniqueness on `name` ("Restaurants" and "restaurants"
// must be treated as the same category) while still preserving whatever
// casing the admin actually typed for display. A collation-based unique
// index gives both at once, without needing a separate lowercase shadow
// field the way Admin.model.js's `email` does (email is fine to
// lowercase outright since nothing depends on its display casing; a
// category name is user-facing text an admin may deliberately capitalize).
// strength: 2 = case-insensitive, still accent-sensitive.
//
// NOTE: enforcing this with a friendly "Category name already exists"
// error message (translating Mongo's E11000 duplicate-key error) is a
// service-layer concern for the next step — intentionally not added
// here since this step is models/validators only.
// partialFilterExpression scopes the uniqueness guarantee to ACTIVE
// (non-soft-deleted) categories only, so a soft-deleted category's name
// never blocks that same name being reused on a new category — matching
// the service layer's assertNameNotDuplicate, which already scopes its
// pre-check the same way.
companyCategorySchema.index(
  { name: 1 },
  {
    unique: true,
    collation: { locale: "en", strength: 2 },
    partialFilterExpression: { isDeleted: false },
  }
);

// Common "list active, non-deleted categories" query.
companyCategorySchema.index({ isDeleted: 1, status: 1 });

module.exports = mongoose.model("CompanyCategory", companyCategorySchema);