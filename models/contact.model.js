const mongoose = require("mongoose");

/**
 * Contact Model
 *
 * References (see the `references` field below):
 *  - A contact can hold multiple references (e.g. Karan -> [a,b,c,d]).
 *  - Values are trimmed and de-duplicated CASE-INSENSITIVELY within the
 *    SAME contact's own list before saving (see the pre-save /
 *    pre-findOneAndUpdate hooks below) — "a" and "A" on the same
 *    contact are treated as one entry; whichever was typed first is
 *    what's kept.
 *  - The SAME reference value is expected to appear across DIFFERENT
 *    contacts on purpose (e.g. Karan -> [a,b,c,d] and Mahesh -> [a,j,k,l]
 *    both legitimately have "a") — that is NOT a duplicate to prevent,
 *    it's how references are meant to be cross-matched later. Any
 *    future cross-contact lookup should also compare case-insensitively,
 *    which is why `normalizeReferenceKey`/`normalizeReferences` are
 *    exposed as statics below instead of being reimplemented ad hoc in
 *    a later service.
 */
const contactSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },

    whatsappNumber: {
      type: String,
      required: true,
      trim: true,
    },

    companyName: {
      type: String,
      trim: true,
      default: "",
    },

    address: {
      type: String,
      trim: true,
      default: "",
    },

    // Original casing is preserved for display — matching/de-dup is
    // case-insensitive (see normalizeReferences below) but nothing here
    // lowercases the stored value itself.
    references: {
      type: [
        {
          type: String,
          trim: true,
        },
      ],
      default: [],
    },

    // References models/companyCategory.model.js. Optional — a contact
    // isn't required to have a category assigned.
    companyCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompanyCategory",
      default: null,
    },

    // Mirrors Admin/User's active/inactive status convention (as
    // opposed to Event's Active/Expired, which is specifically
    // time-based expiry and doesn't apply here).
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },

    // Soft-delete fields, same pattern already used on Event/Booking
    // (isDeleted / deletedAt / deletedBy) — deleting a contact never
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

    // Tracks which Admin created this contact, same convention as
    // Event.createdBy / TicketType.createdBy / Booking.createdBy.
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

// ================= REFERENCE NORMALIZATION =================
// Trims every value and drops case-insensitive duplicates, keeping the
// first occurrence's original casing — e.g. ["a", " A ", "b", "a"]
// becomes ["a", "b"]. Also drops empty/non-string entries (defensive;
// the validator already rejects these at the request layer).
function normalizeReferences(list) {
  if (!Array.isArray(list)) return [];

  const seen = new Set();
  const result = [];

  for (const raw of list) {
    if (typeof raw !== "string") continue;

    const trimmed = raw.trim();
    if (!trimmed) continue;

    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

// Exposed so later services/controllers normalize/compare references
// the exact same way, instead of reimplementing this lowercase-trim
// logic ad hoc (e.g. when cross-matching "a" across Karan's and
// Mahesh's contacts).
contactSchema.statics.normalizeReferences = normalizeReferences;
contactSchema.statics.normalizeReferenceKey = (value) =>
  String(value || "").trim().toLowerCase();

// Applies on every direct save (create, or `contact.save()` after
// mutating `.references` in memory).
contactSchema.pre("save", function (next) {
  if (this.isModified("references")) {
    this.references = normalizeReferences(this.references);
  }
  next();
});

// Also normalize on findOneAndUpdate / findByIdAndUpdate — same
// dual-hook convention already used by User.model.js for its
// `password` field (hash on save AND on findOneAndUpdate).
contactSchema.pre("findOneAndUpdate", function (next) {
  const update = this.getUpdate() || {};
  const references = update.references || (update.$set && update.$set.references);

  if (!references) return next();

  const normalized = normalizeReferences(references);

  if (update.references) {
    update.references = normalized;
  } else {
    update.$set.references = normalized;
  }

  this.setUpdate(update);
  next();
});

// ================= INDEXES =================
// Common "list active, non-deleted contacts" query.
contactSchema.index({ isDeleted: 1, status: 1 });

// Lookup/search by name.
contactSchema.index({ fullName: 1 });

// WhatsApp number must be unique among ACTIVE (non-soft-deleted)
// contacts only — a partial unique index so a soft-deleted contact's
// number never blocks the same number being reused on a new contact,
// while still preventing two active contacts from sharing one number.
contactSchema.index(
  { whatsappNumber: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);

// Filter contacts by category.
contactSchema.index({ companyCategory: 1 });

// Case-insensitive lookup of "which contacts have reference X" (the
// Karan/Mahesh example above). Mongo indexes array fields element-by-
// element automatically (a multikey index), and the collation here
// makes that lookup case-insensitive — same collation settings as
// CompanyCategory.model.js's unique `name` index, for consistency.
contactSchema.index(
  { references: 1 },
  { collation: { locale: "en", strength: 2 } }
);

module.exports = mongoose.model("Contact", contactSchema);