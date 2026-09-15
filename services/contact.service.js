const mongoose = require("mongoose");
const Contact = require("../models/contact.model")
const CompanyCategory = require("../models/companycategory.model");
const AppError = require("../utils/AppError");

// Case-insensitive collation used for the reference filter below — same
// settings as the collation-based indexes already defined on
// Contact.model.js (`references`) and CompanyCategory.model.js (`name`),
// so this query actually uses those indexes instead of a full scan.
const CASE_INSENSITIVE_COLLATION = { locale: "en", strength: 2 };

// Fields the List API is allowed to sort by — kept to an explicit
// allow-list so an unrecognized/typo'd `sortBy` query value can never
// silently turn into an unindexed or unexpected sort; it just falls
// back to the default instead.
const SORTABLE_FIELDS = [
  "fullName",
  "whatsappNumber",
  "companyName",
  "createdAt",
  "updatedAt",
];

// ================= CREATE CONTACT =================
// `adminId` always comes from the authenticated admin (req.user.id in
// the controller), never from req.body — same convention already used
// by eventService.createEvent/ticketTypeService.createTicketType.
const createContact = async (data, adminId) => {
  const {
    fullName,
    whatsappNumber,
    companyName,
    address,
    references,
    companyCategory,
  } = data;

  if (companyCategory) {
    await assertCompanyCategoryExists(companyCategory);
  }

  await assertWhatsappNumberNotDuplicate(whatsappNumber);

  // References are passed through as-is here — trimming and
  // case-insensitive de-duplication happen in Contact.model.js's own
  // pre-save hook, not here, so every write path (this create, or a
  // future bulk-import) gets the same guarantee for free.
  const contact = await Contact.create({
    fullName,
    whatsappNumber,
    companyName,
    address,
    references: Array.isArray(references) ? references : [],
    companyCategory: companyCategory || null,
    createdBy: adminId,
  });

  return contact;
};

// ================= GET ALL CONTACTS =================
// Supports: search, sorting, pagination, companyCategory filter,
// reference filter (case-insensitive — see the reference-filter note
// below). Response shape mirrors eventService.getAllEvents (the service
// returns the full { success, message, data, pagination } payload, and
// the controller just forwards it as-is).
const getAllContacts = async (query) => {
  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 10;
  const search = (query.search || "").trim();

  const sortField = SORTABLE_FIELDS.includes(query.sortBy)
    ? query.sortBy
    : "createdAt";
  const sortOrder = query.sortOrder === "asc" ? 1 : -1;

  const filter = { isDeleted: { $ne: true } };

  if (search) {
    filter.$or = [
      { fullName: { $regex: search, $options: "i" } },
      { whatsappNumber: { $regex: search, $options: "i" } },
      { companyName: { $regex: search, $options: "i" } },
      { address: { $regex: search, $options: "i" } },
    ];
  }

  if (query.companyCategory) {
    if (!mongoose.Types.ObjectId.isValid(query.companyCategory)) {
      throw new AppError("Invalid Company Category filter", 400);
    }
    filter.companyCategory = query.companyCategory;
  }

  // ================= REFERENCE FILTER =================
  // "Same reference must be treated as one unique reference across
  // contacts" (e.g. Karan's "a" and Mahesh's "A" are the same
  // reference) — references are stored with their ORIGINAL casing (see
  // Contact.model.js), so an exact-equality filter would miss "A" when
  // searching for "a". A case-insensitive collation on the query (the
  // exact same collation the `references` index was built with in Step
  // 1) makes Mongo compare "a" and "A" as equal while still using that
  // index, without needing a separate lowercase shadow field.
  const referenceFilterValue = query.reference
    ? Contact.normalizeReferenceKey(query.reference)
    : null;

  if (referenceFilterValue) {
    filter.references = referenceFilterValue;
  }

  const applyCollationIfNeeded = (mongooseQuery) =>
    referenceFilterValue
      ? mongooseQuery.collation(CASE_INSENSITIVE_COLLATION)
      : mongooseQuery;

  const total = await applyCollationIfNeeded(Contact.countDocuments(filter));

  const contacts = await applyCollationIfNeeded(
    Contact.find(filter)
      .populate("companyCategory", "name")
      .populate("createdBy", "name")
      .sort({ [sortField]: sortOrder })
      .skip((page - 1) * limit)
      .limit(limit)
  );

  return {
    success: true,
    message: "Contacts fetched successfully",
    data: contacts,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

// ================= GET CONTACT BY ID =================
const getContactById = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid Contact ID", 400);
  }

  const contact = await Contact.findOne({ _id: id, isDeleted: { $ne: true } })
    .populate("companyCategory", "name")
    .populate("createdBy", "name");

  if (!contact) {
    throw new AppError("Contact not found", 404);
  }

  return contact;
};

// ================= UPDATE CONTACT =================
// Only fields actually present in `data` are touched — an edit may send
// just a subset of fields (same convention as eventService.updateEvent
// leaving untouched fields alone). References normalization (trim +
// case-insensitive de-dup within this contact) happens in
// Contact.model.js's pre-findOneAndUpdate hook.
const updateContact = async (id, data) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid Contact ID", 400);
  }

  const contact = await Contact.findOne({ _id: id, isDeleted: { $ne: true } });

  if (!contact) {
    throw new AppError("Contact not found", 404);
  }

  if (data.companyCategory) {
    await assertCompanyCategoryExists(data.companyCategory);
  }

  // Only re-check for a duplicate if the number is actually changing —
  // re-saving a contact with its own unchanged number must never be
  // rejected as "already exists" (same pattern as
  // companyCategoryService.updateCompanyCategory's name check).
  if (
    data.whatsappNumber !== undefined &&
    data.whatsappNumber.trim() !== contact.whatsappNumber.trim()
  ) {
    await assertWhatsappNumberNotDuplicate(data.whatsappNumber, id);
  }

  const updateFields = {};

  if (data.fullName !== undefined) updateFields.fullName = data.fullName;
  if (data.whatsappNumber !== undefined) updateFields.whatsappNumber = data.whatsappNumber;
  if (data.companyName !== undefined) updateFields.companyName = data.companyName;
  if (data.address !== undefined) updateFields.address = data.address;
  if (data.references !== undefined) updateFields.references = data.references;
  if (data.companyCategory !== undefined) {
    updateFields.companyCategory = data.companyCategory || null;
  }

  const updatedContact = await Contact.findOneAndUpdate(
    { _id: id, isDeleted: { $ne: true } },
    updateFields,
    { new: true, runValidators: true }
  )
    .populate("companyCategory", "name")
    .populate("createdBy", "name");

  return updatedContact;
};

// ================= DELETE CONTACT (SOFT DELETE) =================
// Same soft-delete pattern as bookingService.deleteBooking: sets
// isDeleted/deletedAt/deletedBy rather than removing the document.
const deleteContact = async (id, adminId) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid Contact ID", 400);
  }

  const contact = await Contact.findOne({ _id: id, isDeleted: { $ne: true } });

  if (!contact) {
    throw new AppError("Contact not found", 404);
  }

  contact.isDeleted = true;
  contact.deletedAt = new Date();
  contact.deletedBy = adminId;

  await contact.save();

  return contact;
};

// ================= GET REFERENCE SUMMARY =================
// Groups every reference value across ALL active (non-soft-deleted)
// contacts, case-insensitively, into { reference, contacts: [...] }
// records — e.g. Karan -> [a,d,c,x] and Ramesh -> [a,s,z,t] becomes
// a -> [Karan, Ramesh], d -> [Karan], s -> [Ramesh], etc.
//
// Grouping uses Contact.normalizeReferenceKey (the exact same
// trim + lowercase logic already used by the model's own de-dup hooks
// and by getAllContacts' reference filter above), so "a" on one contact
// and "A" on another land in the same group. The original casing of
// whichever occurrence is seen first is kept as the display value for
// that group, and each contact name is only ever listed once per
// reference even if (defensively) it appeared more than once.
const getReferenceSummary = async () => {
  const contacts = await Contact.find(
    { isDeleted: { $ne: true } },
    { fullName: 1, references: 1 }
  ).lean();

  const groups = new Map(); // normalized key -> { reference, contacts: [] }

  for (const contact of contacts) {
    const references = Array.isArray(contact.references)
      ? contact.references
      : [];

    for (const raw of references) {
      if (typeof raw !== "string") continue;

      const trimmed = raw.trim();
      if (!trimmed) continue;

      const key = Contact.normalizeReferenceKey(trimmed);

      if (!groups.has(key)) {
        groups.set(key, { reference: trimmed, contacts: [] });
      }

      const group = groups.get(key);
      if (!group.contacts.includes(contact.fullName)) {
        group.contacts.push(contact.fullName);
      }
    }
  }

  // Alphabetical, case-insensitive order (e.g. a, b, c, d, h, n, v) —
  // only orders the reference groups themselves, unrelated to any
  // Contact List row sorting.
  const data = Array.from(groups.values()).sort((a, b) =>
    a.reference.trim().toLowerCase().localeCompare(b.reference.trim().toLowerCase())
  );

  return {
    success: true,
    message: "Reference summary fetched successfully",
    data,
  };
};

// Shared uniqueness pre-check used by both createContact and
// updateContact — same collation-free string-equality approach as
// CompanyCategory's assertNameNotDuplicate, just without a collation
// since WhatsApp numbers have no meaningful "case". Scoped to active
// (non-soft-deleted) contacts only, so a soft-deleted contact's number
// never blocks that same number being reused on a new/other contact —
// the underlying guarantee against a create/update race is the partial
// unique index on Contact.model.js's `whatsappNumber` field.
async function assertWhatsappNumberNotDuplicate(whatsappNumber, excludeId = null) {
  const filter = {
    isDeleted: { $ne: true },
    whatsappNumber: String(whatsappNumber || "").trim(),
  };

  if (excludeId) {
    filter._id = { $ne: excludeId };
  }

  const existing = await Contact.findOne(filter);

  if (existing) {
    throw new AppError("WhatsApp Number already exists", 400);
  }
}

// Shared existence/shape check used by both createContact and
// updateContact whenever a companyCategory is supplied.
async function assertCompanyCategoryExists(companyCategoryId) {
  if (!mongoose.Types.ObjectId.isValid(companyCategoryId)) {
    throw new AppError("Invalid Company Category", 400);
  }

  const category = await CompanyCategory.findOne({
    _id: companyCategoryId,
    isDeleted: { $ne: true },
  });

  if (!category) {
    throw new AppError("Company Category not found", 404);
  }
}

module.exports = {
  createContact,
  getAllContacts,
  getContactById,
  updateContact,
  deleteContact,
  getReferenceSummary,
};