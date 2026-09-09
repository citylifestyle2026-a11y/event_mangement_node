const BookingTicket = require("../models/bookingTicket.model");
const Event = require("../models/event.model");
const ExcelJS = require("exceljs");

// Shared search fields for the toolbar "quick search" — Booking Id, Ticket
// Id, QR Code, Name, Mobile Number, per the Entry Report spec. Used by both
// getAllEntryReports and exportEntryReport so search behaves identically
// in the table and in the exported file.
const buildSearchOr = (search) => [
  { bookingNumber: { $regex: search, $options: "i" } },
  { ticketNumber: { $regex: search, $options: "i" } },
  { qrImage: { $regex: search, $options: "i" } },
  { "attendee.name": { $regex: search, $options: "i" } },
  { "attendee.mobileNumber": { $regex: search, $options: "i" } },
];

// Applies the end-of-day boundary in UTC explicitly. setHours() would
// apply the Node process's local timezone, which can shift the boundary
// by that offset and cause off-by-one-day results depending on where the
// server runs. startDate/endDate arrive as "YYYY-MM-DD" (date-only ISO),
// which `new Date(...)` already parses as UTC midnight, so pairing it
// with setUTCHours keeps both ends of the range in the same timezone.
const endOfDayUtc = (dateStr) => {
  const d = new Date(dateStr);
  d.setUTCHours(23, 59, 59, 999);
  return d;
};

// ================= IST DATE BOUNDARIES =================
// BookingTicket.passDate is copied directly from TicketType.allowDates[0]
// at booking time (see booking.service.js) — and allowDates are captured
// by the Ticket Type date picker as IST midnight of the selected calendar
// day. Concretely: selecting "14-08-2026" in that picker stores
// 2026-08-13T18:30:00.000Z (14 Aug 00:00 IST = 13 Aug 18:30 UTC), NOT
// 2026-08-14T00:00:00.000Z. So a naive `new Date(dateStr)` on a
// "YYYY-MM-DD" query param (which parses as UTC midnight of that date)
// would be 5.5 hours later than the actual stored instant for that same
// IST calendar day — enough to miss it entirely in a $gte/$lte compare.
//
// IST is a fixed UTC+5:30 offset with no DST, so a constant offset is
// correct here (not a reason to pull in a timezone library).
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// The UTC instant representing 00:00 IST on the given "YYYY-MM-DD" date —
// i.e. exactly what gets stored for that calendar date's passDate.
const istMidnightUtc = (dateStr) =>
  new Date(new Date(dateStr).getTime() - IST_OFFSET_MS);

// The UTC instant one millisecond before the *next* IST calendar day
// begins — i.e. the inclusive upper bound covering every moment of the
// given IST calendar date, mirroring how endOfDayUtc works for the
// (UTC-midnight-based) scannedAt boundary above.
const istEndOfDayUtc = (dateStr) => {
  const nextDayIstMidnight = new Date(
    istMidnightUtc(dateStr).getTime() + 24 * 60 * 60 * 1000
  );
  return new Date(nextDayIstMidnight.getTime() - 1);
};

// ================= ACTIVE EVENT FILTER (SHARED) =================
// Single definition of "active event" for this module: isActive === true
// AND endDateTime not yet passed, evaluated against the current time on
// every call (mirrors the equivalent check already used elsewhere in the
// project, e.g. dashboardService's getActiveEvent / bookingService's
// expiry guard). getAllEntryReports, exportEntryReport, and
// getActiveEvents below all call this instead of each redefining the
// condition inline, so there is exactly one place it's expressed here.
const activeEventFilter = () => ({
  isActive: true,
  endDateTime: { $gte: new Date() },
});

// Restricts a query filter to only the records the authenticated user is
// allowed to see. Admin (role "admin", set from the previous auth step)
// is left completely unrestricted — existing behavior. Any other role
// (currently only "checker") only ever sees tickets where
// BookingTicket.scannedBy matches THEIR OWN authenticated _id — sourced
// from currentUser (req.user, resolved server-side by the protect
// middleware), never from any client-supplied query parameter. Shared by
// both getAllEntryReports and exportEntryReport so the table and the
// export can never diverge.
const applyScannerScope = (filter, currentUser) => {
  if (currentUser && currentUser.role !== "admin") {
    filter.scannedBy = currentUser._id;
  }
};

// ================= GET ACTIVE EVENTS (FOR EVENT DROPDOWN) =================
// Backs the Entry Report page's Event dropdown. Reuses activeEventFilter()
// — the exact same condition getAllEntryReports/exportEntryReport already
// use to resolve a single active event — so the dropdown can never list
// (and the report can never be scoped to) an event that condition would
// otherwise reject. Sorted ascending by startDateTime, same ordering
// convention as the rest of this module. Access itself is already gated
// by the same protect + authorize("admin", "checker", { permission:
// "Entry Report" }) middleware as the rest of the Entry Report routes, so
// no separate per-user event visibility filter is needed here.
const getActiveEvents = async () => {
  const events = await Event.find(activeEventFilter())
    .sort({ startDateTime: 1 })
    .select("_id name title eventCode startDateTime endDateTime")
    .lean();

  return events;
};

// ================= GET ALL ENTRY REPORT =================
const getAllEntryReports = async (query, currentUser) => {
  let {
    page = 1,
    limit = 10,
    bookingId = "",
    ticketId = "",
    mobileNumber = "",
    name = "",
    search = "",
    startDate,
    endDate,
    eventId: requestedEventId,
  } = query;

  page = parseInt(page, 10) || 1;
  limit = parseInt(limit, 10) || 10;
  const skip = (page - 1) * limit;

  // ================= ACTIVE EVENT =================
  // The frontend now selects a specific event (Event dropdown) and sends
  // its id as eventId. That id is still never trusted blindly — it must
  // also satisfy the same activeEventFilter() every other event lookup in
  // this module uses, so Entry Report can never return records from an
  // inactive/expired/forged eventId.
  //
  // If eventId isn't supplied at all (older/legacy callers), fall back to
  // the previous default: the single "current" active event, sorted
  // ascending by startDateTime so a Running event (startDateTime <= now)
  // always sorts ahead of any Upcoming event — same as before.
  let activeEvent;

  if (requestedEventId) {
    activeEvent = await Event.findOne({
      _id: requestedEventId,
      ...activeEventFilter(),
    })
      .select("_id name title startDateTime endDateTime")
      .lean();
  } else {
    activeEvent = await Event.findOne(activeEventFilter())
      .sort({ startDateTime: 1 })
      .select("_id name title startDateTime endDateTime")
      .lean();
  }

  if (!activeEvent) {
    // No matching active event: respond gracefully so the UI can show its
    // normal empty state instead of an error.
    return {
      event: null,
      rows: [],
      pagination: { page, limit, total: 0, totalPages: 0 },
    };
  }

  const eventId = activeEvent._id;

  // ================= FILTER =================

  const filter = {
    eventId,
    status: "Used",
  };

  // Checker-scoping — added BEFORE the optional filters below so it
  // combines with them via a normal AND, exactly like every other base
  // filter field already does. Admin is unaffected (no-op for admin).
  applyScannerScope(filter, currentUser);

  if (bookingId) {
    filter.bookingNumber = {
      $regex: bookingId,
      $options: "i",
    };
  }

  if (ticketId) {
    filter.ticketNumber = {
      $regex: ticketId,
      $options: "i",
    };
  }

  if (mobileNumber) {
    filter["attendee.mobileNumber"] = {
      $regex: mobileNumber,
      $options: "i",
    };
  }

  if (name) {
    filter["attendee.name"] = {
      $regex: name,
      $options: "i",
    };
  }

  // Toolbar quick-search — combines with the specific field filters above
  // (Mongo ANDs every top-level key, including $or), so Search-button
  // filters and toolbar search apply together correctly.
  if (search) {
    filter.$or = buildSearchOr(search);
  }

  if (startDate || endDate) {
    filter.passDate = {};

    if (startDate) {
      filter.passDate.$gte = istMidnightUtc(startDate);
    }

    if (endDate) {
      filter.passDate.$lte = istEndOfDayUtc(endDate);
    }
  }

  // ================= FETCH DATA =================

  const [tickets, total] = await Promise.all([
    BookingTicket.find(filter)
      .sort({ scannedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),

    BookingTicket.countDocuments(filter),
  ]);

  // ================= FORMAT ROWS =================

  const rows = tickets.map((ticket) => ({
    _id: ticket._id,

    profileImage: ticket.attendee?.profileImage || "",

    bookingId: ticket.bookingNumber,

    ticketId: ticket.ticketNumber,

    qrImage: ticket.qrImage || "",

    name: ticket.attendee?.name || "-",

    mobileNumber: ticket.attendee?.mobileNumber || "-",

    passDate: ticket.passDate || null,

    scannedAt: ticket.scannedAt || null,
  }));

  return {
    event: activeEvent,

    rows,

    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

// ================= EXPORT ENTRY REPORT =================

const exportEntryReport = async (query, res, currentUser) => {
  let {
    bookingId = "",
    ticketId = "",
    name = "",
    mobileNumber = "",
    search = "",
    startDate,
    endDate,
    eventId: requestedEventId,
  } = query;

  // ================= ACTIVE EVENT =================
  // Same resolution as getAllEntryReports: prefer the client-supplied
  // eventId (still constrained to activeEventFilter()), so export always
  // targets the same event currently selected in the table. Falls back to
  // the previous single-active-event default when no eventId is sent.
  let activeEvent;

  if (requestedEventId) {
    activeEvent = await Event.findOne({
      _id: requestedEventId,
      ...activeEventFilter(),
    })
      .select("_id name title startDateTime endDateTime")
      .lean();
  } else {
    activeEvent = await Event.findOne(activeEventFilter())
      .sort({ startDateTime: 1 })
      .select("_id name title startDateTime endDateTime")
      .lean();
  }

  if (!activeEvent) {
    throw new Error("No active event found.");
  }

  const eventId = activeEvent._id;

  // ================= FILTER =================

  const filter = {
    eventId,
    status: "Used",
  };

  // Same Checker-scoping as getAllEntryReports — export must never be a
  // way for a Checker to bypass the same-user restriction the table
  // enforces.
  applyScannerScope(filter, currentUser);

  if (bookingId) {
    filter.bookingNumber = {
      $regex: bookingId,
      $options: "i",
    };
  }

  if (ticketId) {
    filter.ticketNumber = {
      $regex: ticketId,
      $options: "i",
    };
  }

  if (name) {
    filter["attendee.name"] = {
      $regex: name,
      $options: "i",
    };
  }

  if (mobileNumber) {
    filter["attendee.mobileNumber"] = {
      $regex: mobileNumber,
      $options: "i",
    };
  }

  if (search) {
    filter.$or = buildSearchOr(search);
  }

  if (startDate || endDate) {
    filter.passDate = {};

    if (startDate) {
      filter.passDate.$gte = istMidnightUtc(startDate);
    }

    if (endDate) {
      filter.passDate.$lte = istEndOfDayUtc(endDate);
    }
  }

  // ================= DATA =================

  const rows = await BookingTicket.find(filter)
    .select(`
      bookingNumber
      ticketNumber
      qrImage
      scannedAt
      passDate
      attendee
    `)
    .sort({ scannedAt: -1 })
    .lean();

  // ================= WORKBOOK =================

  const workbook = new ExcelJS.Workbook();

  workbook.creator = "Event Management CRM";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("Entry Report");

  worksheet.columns = [
    {
      header: "Booking Id",
      key: "bookingId",
      width: 22,
    },
    {
      header: "Ticket Id",
      key: "ticketId",
      width: 22,
    },
    {
      header: "Name",
      key: "name",
      width: 25,
    },
    {
      header: "Mobile Number",
      key: "mobile",
      width: 18,
    },
    {
      header: "Pass Date",
      key: "passDate",
      width: 22,
    },
    {
      header: "Scanned At",
      key: "scannedAt",
      width: 24,
    },
    {
      header: "QR Image",
      key: "qrImage",
      width: 45,
    },
    {
      header: "Profile Image",
      key: "profileImage",
      width: 45,
    },
  ];

  // ================= HEADER STYLE =================

  worksheet.getRow(1).font = {
    bold: true,
    color: {
      argb: "FFFFFFFF",
    },
  };

  worksheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: {
      argb: "1F4E78",
    },
  };

  worksheet.getRow(1).alignment = {
    vertical: "middle",
    horizontal: "center",
  };

  // ================= ROWS =================
  // Pass Date now reflects each ticket's own stored passDate (from
  // BookingTicket, copied from its TicketType's allowDates[0] at booking
  // time), not the active event's date — so the exported file matches
  // what's actually on each ticket, and matches the on-screen table
  // (getAllEntryReports above uses the same field). The explicit
  // Asia/Kolkata timeZone is required here: passDate is stored as the
  // UTC instant of IST midnight (e.g. 14-08-2026 IST is stored as
  // 2026-08-13T18:30:00.000Z), and toLocaleDateString without an explicit
  // timeZone uses the Node process's own timezone — commonly UTC on a
  // server — which would print 13/08/2026 instead of the correct
  // 14/08/2026.

  rows.forEach((item) => {
    worksheet.addRow({
      bookingId: item.bookingNumber,

      ticketId: item.ticketNumber,

      name: item.attendee?.name || "-",

      mobile: item.attendee?.mobileNumber || "-",

      passDate: item.passDate
        ? new Date(item.passDate).toLocaleDateString("en-GB", {
            timeZone: "Asia/Kolkata",
          })
        : "-",

      scannedAt: item.scannedAt
        ? new Date(item.scannedAt).toLocaleString("en-GB")
        : "-",

      qrImage: item.qrImage || "-",

      profileImage: item.attendee?.profileImage || "-",
    });
  });

  // ================= DOWNLOAD =================

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );

  res.setHeader(
    "Content-Disposition",
    `attachment; filename=EntryReport_${Date.now()}.xlsx`
  );

  await workbook.xlsx.write(res);

  res.end();
};

module.exports = {
  getActiveEvents,
  getAllEntryReports,
  exportEntryReport,
};