const Booking = require("../models/booking.model");
const Event = require("../models/event.model");
const TicketType = require("../models/ticketType.model");
const Counter = require("../models/counters.model");
const BookingTicket = require("../models/bookingTicket.model");
const generateTicketNumber = require("../utils/generateTicketNumber");
const generateQrToken = require("../utils/generateQrToken");
const generateQrCode = require("../utils/generateQrCode");
const uploadToCloudinary = require("../utils/cloudinary.util");
const AppError = require("../utils/AppError");
const eventService = require("./event.service");
const whatsappService = require("./whatsapp.service");
const buildRegistrationBodyParams = require("../utils/buildRegistrationBodyParams");
const generateRegistrationToken = require("../utils/generateRegistrationToken");
const mongoose = require("mongoose");

// ================= EVENT-WISE BOOKING NUMBER =================
// Was previously a single global counter keyed by year
// (`BOOKING_${year}`), producing e.g. "BK2026000123" shared across every
// event. Now keyed by the event's own `eventId` (`BOOKING_${eventId}`),
// so each event gets its own independent sequence that always starts at
// BK001 and is never shared with, or affected by, any other event —
// including one that has since been deleted by the expiry scheduler,
// since eventId-keyed Counter documents are never touched by that
// scheduler and stay unique forever. Still a single atomic
// findOneAndUpdate $inc/upsert (same pattern as before and as
// generateTicketNumber.js), so two simultaneous bookings for the same
// event can never receive the same number.
const generateBookingNumber = async (eventId, eventCode, session) => {
  const counter = await Counter.findOneAndUpdate(
    { name: `BOOKING_${eventId}` },
    { $inc: { sequence: 1 } },
    {
      new: true,
      upsert: true,
      session
    }
  );

  return `${eventCode}-BK${String(counter.sequence).padStart(3, "0")}`;
};

// ================= SEND REGISTRATION LINK VIA WHATSAPP (BEST-EFFORT) =================
// QR codes continue to be generated exactly as before (see the
// createBooking loop below — untouched), but are intentionally NOT sent
// over WhatsApp anymore. Instead, the existing public registration link
// mechanism (utils/generateRegistrationToken.js / buildRegistrationUrl.js
// via the template's Dynamic URL button — token/URL structure unchanged)
// is sent to the SAME booking.mobileNumber.
//
// Exactly ONE WhatsApp message is sent per booking (not one per ticket):
// the button param uses the FIRST ticket's registrationToken. All tickets
// created by this booking share the same bookingId, and the public
// registration API (getRegistrationDetails) resolves that ticket's
// bookingId back to the existing Booking.quantity, so opening this single
// link is enough for the registration page/API to know the full booking
// quantity — no new field, token, or URL shape is introduced.
//
// For quantity = 1 this is identical to the previous per-ticket loop
// (exactly one ticket, exactly one message). For quantity > 1, this
// avoids sending multiple different links (and multiple messages) for
// what is, from the customer's point of view, a single registration.
//
// Runs only after the booking + ticket transaction has already
// committed, and is never allowed to fail the booking: any failure
// (missing Chatbox config, Chatbox API error, network error) is caught
// and only logged, never rethrown, so a WhatsApp outage can never turn a
// successful booking into a failed request.
const sendRegistrationWhatsAppNotification = async (booking, event, tickets) => {
  if (!Array.isArray(tickets) || tickets.length === 0) {
    return;
  }

  const templateName =
    process.env.CHATBOX_REGISTRATION_TEMPLATE_NAME || "event_registration_link";
  const templateLanguage =
    process.env.CHATBOX_REGISTRATION_TEMPLATE_LANGUAGE || "en";

  const bodyParams = buildRegistrationBodyParams({ booking, event });

  // Same token every ticket of this booking would otherwise be sent
  // individually for — using the first one is sufficient since the
  // registration details API resolves quantity from the booking, not
  // from which specific ticket the token points to.
  const primaryTicket = tickets[0];

  try {
    await whatsappService.sendTemplateMessage({
      phone: booking.mobileNumber,
      templateName,
      languageCode: templateLanguage,
      bodyParams,
      buttonParam: buildRegistrationBodyParams.buildRegistrationButtonParam(primaryTicket),
    });
  } catch (error) {
    console.error(
      `WhatsApp registration notification failed for booking ${booking.bookingNumber}:`,
      error
    );
  }
};

// post api
// `createdBy` is now accepted as its own argument (set by the controller
// from req.user.id) rather than being expected inside `data` — mirrors
// eventService.createEvent(data, file, adminId) and
// ticketTypeService.createTicketType(data, createdBy).
const createBooking = async (data, createdBy) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const {
      eventId,
      ticketTypeId,
      quantity,
      amount,
      name,
      mobileNumber,
      email,
      discount,
      remark,
    } = data;

    const bookingQuantity = Number(quantity);
    const bookingAmount = Number(amount);
    const discountAmount = Number(discount || 0);
    if (bookingQuantity <= 0) {
      throw new AppError("Invalid booking quantity", 400);
    }

    if (bookingAmount < 0) {
      throw new AppError("Invalid booking amount", 400);
    }
    const event = await Event.findById(eventId).session(session);
    if (!event) {
      throw new AppError("Event not found", 404);
    }
    if (!event.isActive) {
      throw new AppError(
        "Booking cannot be created because the event is inactive.",
        400
      );
    }
    if (new Date(event.endDateTime) < new Date()) {
      throw new AppError(
        "Booking cannot be created because the event has expired.",
        400
      );
    }
    const ticketType = await TicketType.findOneAndUpdate(
      {
        _id: ticketTypeId,
        eventId: eventId,
        isDeleted: false,
        availableCount: {
          $gte: bookingQuantity
        }
      },
      {
        $inc: {
          availableCount: -bookingQuantity
        }
      },
      {
        new: true,
        session
      }
    );

    if (!ticketType) {
      throw new AppError("Ticket not available", 400);
    }

    const expectedAmount =
      (ticketType.amount * bookingQuantity) - discountAmount;

    if (bookingAmount !== expectedAmount) {
      throw new AppError(
        `Invalid booking amount. Expected amount is ${expectedAmount}`,
        400
      );
    }

    const eventCode = await eventService.getOrCreateEventCode(event, session);
    const bookingNumber = await generateBookingNumber(
      event._id,
      eventCode,
      session
    );

    // ================= PASS DATE =================
    // TicketType's date field is `allowDates` — an array, not a single
    // `allowDate`. Since CreateBookingModal has no date-selection UI (and
    // isn't meant to gain one), there's no way for the booking itself to
    // indicate which of possibly several allowDates this ticket is for.
    // The first date in the array is used as the deterministic Pass Date
    // for every ticket this booking generates. If a ticket type only ever
    // has one allowDate in practice, this is exactly that date; if it can
    // genuinely have several, this is a real business-rule assumption —
    // see the accompanying summary.
    const passDate =
      Array.isArray(ticketType.allowDates) && ticketType.allowDates.length > 0
        ? ticketType.allowDates[0]
        : null;

    const booking = await Booking.create(
      [
        {
          bookingNumber,
          eventId,
          ticketTypeId,
          quantity: bookingQuantity,
          amount: bookingAmount,
          name,
          mobileNumber,
          email,
          discount: discountAmount,
          remark,
          createdBy
        }
      ],
      { session }
    );

    const bookingTickets = [];

    for (let i = 0; i < bookingQuantity; i++) {
      // Generate Ticket Number
      const ticketNumber = await generateTicketNumber(
        event._id,
        eventCode,
        session
      );

      // Generate JWT Token
      const qrToken = generateQrToken({
        ticketNumber,
      });

      // Generate QR Buffer
      const qrBuffer = await generateQrCode(qrToken);

      // Upload QR to Cloudinary
      const qrUpload = await uploadToCloudinary(
        qrBuffer,
        "event-management/qr-codes"
      );

      // ================= REGISTRATION TOKEN =================
      // Generated with a pre-assigned _id so the token can identify this
      // exact BookingTicket from the moment it's created -- one unique
      // token per ticket, persisted on the ticket itself (registrationToken)
      // so a later WhatsApp resend reuses this same token instead of
      // minting a new one. Does not touch/replace qrToken, which remains
      // exclusively for the existing QR/entry-scan flow.
      const ticketId = new mongoose.Types.ObjectId();
      const registrationToken = generateRegistrationToken(ticketId);

      bookingTickets.push({
        _id: ticketId,
        bookingId: booking[0]._id,
        eventId,
        ticketTypeId,
        bookingNumber: booking[0].bookingNumber,
        ticketNumber,
        qrToken,
        qrImage: qrUpload.url,
        qrImagePublicId: qrUpload.public_id,
        status: "Active",
        passDate,
        registrationToken,
      });
    }

    const insertedTickets = await BookingTicket.insertMany(
      bookingTickets,
      { session }
    );

    await session.commitTransaction();

    // ================= WHATSAPP REGISTRATION NOTIFICATION (NON-BLOCKING) =================
    // QR codes were generated above exactly as before, but are NOT sent
    // over WhatsApp anymore (see sendRegistrationWhatsAppNotification for
    // details). Only the public registration link is sent, to the same
    // booking.mobileNumber, after the transaction has already committed —
    // so a WhatsApp failure can never roll back or fail an
    // already-successful booking. The response shape below is unchanged.
    await sendRegistrationWhatsAppNotification(
      booking[0],
      event,
      insertedTickets
    );

    return {
      booking: booking[0],
      tickets: insertedTickets,
      totalTickets: insertedTickets.length,
    };

  } catch (error) {
    console.error("Create Booking Error:", error);

    if (session.inTransaction()) {
      await session.abortTransaction();
    }

    throw error;
  } finally {
    await session.endSession();
  }
};

// ================= RESOLVE EVENT SCOPE (MULTIPLE ACTIVE EVENTS) =================
// Shared by getAllBookings and exportBookings so the table and the export
// can never diverge on which events they cover.
//
// - eventId supplied: scope is exactly that one event, as long as it's a
//   real, non-deleted event — its own bookings must stay visible/
//   exportable for as long as the Event document exists, even after it
//   has expired (Step 5: expiring an event must never hide its existing
//   data — only an explicit manual delete may, and a manual delete
//   already hard-removes the Event document itself, along with its
//   Bookings/BookingTickets in the same transaction, so there is nothing
//   further to exclude here once that happens).
// - eventId omitted: scope is EVERY currently active (isActive: true),
//   non-deleted, non-expired event — not just the first one — so bookings
//   from Event A and Event B are both included when both are active.
//   Previously this used Event.findOne(...), which silently discarded
//   every active event but the earliest-starting one. This "no eventId"
//   overview is intentionally left scoped to currently-running events
//   only (unchanged by Step 5) — pick a specific eventId to see a given
//   event's bookings regardless of its expiry status.
const resolveEventScope = async (eventId) => {
  if (eventId) {
    const event = await Event.findOne({
      _id: eventId,
      isDeleted: { $ne: true },
    }).select("_id title startDateTime endDateTime");

    return event ? { eventIds: [event._id], events: [event] } : { eventIds: [], events: [] };
  }

  const now = new Date();

  const activeEvents = await Event.find({
    isActive: true,
    isDeleted: { $ne: true },
    endDateTime: { $gte: now },
  })
    .sort({ startDateTime: 1 })
    .select("_id title startDateTime endDateTime");

  return {
    eventIds: activeEvents.map((event) => event._id),
    events: activeEvents,
  };
};

// ================= GET ALL BOOKINGS =================
const getAllBookings = async (query) => {
  const {
    eventId,
    page = 1,
    limit = 10,
    bookingId,
    mobileNumber,
    name,
    createdBy,
    status,
    fromDate,
    toDate,
    search,
  } = query;

  // ================= CONVERT PAGINATION VALUES =================
  const currentPage = Math.max(Number(page) || 1, 1);
  const pageLimit = Math.max(Number(limit) || 10, 1);

  // ================= RESOLVE EVENT(S) =================
  // A specific eventId → only that event. No eventId → every currently
  // active event, combined (see resolveEventScope above).
  const { eventIds, events } = await resolveEventScope(eventId);

  // ================= NO MATCHING EVENT(S) =================
  if (eventIds.length === 0) {
    return {
      events: [],
      rows: [],
      pagination: {
        page: currentPage,
        limit: pageLimit,
        total: 0,
        totalPages: 0,
      },
    };
  }

  // ================= BUILD FILTER =================
  const filter = {
    eventId: { $in: eventIds },
  };

  // ================= DELETED / SUCCESS STATUS =================
  if (status === "Deleted") {
    filter.isDeleted = true;
  } else {
    // Default + Success
    filter.isDeleted = false;
  }

  // ================= BOOKING ID FILTER =================
  if (bookingId?.trim()) {
    filter.bookingNumber = {
      $regex: bookingId.trim(),
      $options: "i",
    };
  }

  // ================= MOBILE NUMBER FILTER =================
  if (mobileNumber?.trim()) {
    filter.mobileNumber = {
      $regex: mobileNumber.trim(),
      $options: "i",
    };
  }

  // ================= NAME FILTER =================
  if (name?.trim()) {
    filter.name = {
      $regex: name.trim(),
      $options: "i",
    };
  }

  // ================= CREATED BY FILTER =================
  if (createdBy) {
    filter.createdBy = createdBy;
  }

  // ================= GLOBAL SEARCH FILTER =================
  if (search?.trim()) {
    const searchValue = search.trim();

    filter.$or = [
      {
        bookingNumber: {
          $regex: searchValue,
          $options: "i",
        },
      },
      {
        name: {
          $regex: searchValue,
          $options: "i",
        },
      },
      {
        mobileNumber: {
          $regex: searchValue,
          $options: "i",
        },
      },
    ];
  }

  // ================= DATE FILTER =================
  if (fromDate || toDate) {
    filter.createdAt = {};

    if (fromDate) {
      const startDate = new Date(fromDate);

      if (!Number.isNaN(startDate.getTime())) {
        startDate.setHours(0, 0, 0, 0);
        filter.createdAt.$gte = startDate;
      }
    }

    if (toDate) {
      const endDate = new Date(toDate);

      if (!Number.isNaN(endDate.getTime())) {
        endDate.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = endDate;
      }
    }

    // Remove empty createdAt filter
    if (Object.keys(filter.createdAt).length === 0) {
      delete filter.createdAt;
    }
  }

  // ================= TOTAL COUNT =================
  const total = await Booking.countDocuments(filter);

  // ================= TOTAL PAGES =================
  const totalPages = Math.ceil(total / pageLimit);

  // ================= PAGINATION OFFSET =================
  const skip = (currentPage - 1) * pageLimit;

  // ================= FETCH BOOKINGS =================
  const bookings = await Booking.find(filter)
    .populate(
      "eventId",
      "title startDateTime endDateTime"
    )
    .populate(
      "ticketTypeId",
      "ticketName amount"
    )
    .populate(
      "createdBy",
      "name"
    )
    .sort({
      createdAt: -1,
    })
    .skip(skip)
    .limit(pageLimit)
    .lean();

  // ================= RESPONSE =================
  return {
    events,
    rows: bookings,
    pagination: {
      page: currentPage,
      limit: pageLimit,
      total,
      totalPages,
    },
  };
};
// ================= DELETE BOOKING =================
const deleteBooking = async (bookingId, remark, deletedBy) => {
  if (!remark || !remark.trim()) {
    throw new AppError("Delete remark is required", 400);
  }

  const booking = await Booking.findById(bookingId);

  if (!booking) {
    throw new AppError("Booking not found", 404);
  }

  if (booking.isDeleted) {
    throw new AppError("Booking already deleted", 400);
  }

  booking.isDeleted = true;
  booking.deleteRemark = remark.trim();
  booking.deletedAt = new Date();
  booking.deletedBy = deletedBy;

  await booking.save();

  return booking;
};
// ================= EXPORT ALL BOOKINGS =================
const exportBookings = async (query, res) => {
  const {
    eventId,
    bookingId,
    mobileNumber,
    name,
    createdBy,
    status,
    fromDate,
    toDate,
    search,
  } = query;

  // ================= RESOLVE EVENT(S) =================
  // Same resolution as getAllBookings (see resolveEventScope above), so
  // the exported file always matches what the table is showing: a
  // specific eventId if supplied, otherwise every currently active event
  // combined — never just the single earliest one.
  const { eventIds } = await resolveEventScope(eventId);

  if (eventIds.length === 0) {
    throw new AppError("No active event found.", 404);
  }

  // ================= BUILD FILTER =================
  const filter = {
    eventId: { $in: eventIds },
  };

  // ================= DELETED / SUCCESS STATUS =================
  if (status === "Deleted") {
    filter.isDeleted = true;
  } else {
    // Default + Success
    filter.isDeleted = false;
  }

  // ================= BOOKING ID FILTER =================
  if (bookingId?.trim()) {
    filter.bookingNumber = {
      $regex: bookingId.trim(),
      $options: "i",
    };
  }

  // ================= MOBILE NUMBER FILTER =================
  if (mobileNumber?.trim()) {
    filter.mobileNumber = {
      $regex: mobileNumber.trim(),
      $options: "i",
    };
  }

  // ================= NAME FILTER =================
  if (name?.trim()) {
    filter.name = {
      $regex: name.trim(),
      $options: "i",
    };
  }

  // ================= CREATED BY FILTER =================
  if (createdBy) {
    filter.createdBy = createdBy;
  }

  // ================= GLOBAL SEARCH FILTER =================
  if (search?.trim()) {
    const searchValue = search.trim();

    filter.$or = [
      {
        bookingNumber: {
          $regex: searchValue,
          $options: "i",
        },
      },
      {
        name: {
          $regex: searchValue,
          $options: "i",
        },
      },
      {
        mobileNumber: {
          $regex: searchValue,
          $options: "i",
        },
      },
    ];
  }

  // ================= DATE FILTER =================
  if (fromDate || toDate) {
    filter.createdAt = {};

    if (fromDate) {
      const startDate = new Date(fromDate);

      if (!Number.isNaN(startDate.getTime())) {
        startDate.setHours(0, 0, 0, 0);
        filter.createdAt.$gte = startDate;
      }
    }

    if (toDate) {
      const endDate = new Date(toDate);

      if (!Number.isNaN(endDate.getTime())) {
        endDate.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = endDate;
      }
    }

    // Remove empty createdAt filter
    if (Object.keys(filter.createdAt).length === 0) {
      delete filter.createdAt;
    }
  }

  // ================= FETCH ALL BOOKINGS =================
  const bookings = await Booking.find(filter)
    .populate(
      "eventId",
      "title startDateTime endDateTime"
    )
    .populate(
      "ticketTypeId",
      "ticketName amount"
    )
    .populate(
      "createdBy",
      "name"
    )
    .sort({
      createdAt: -1,
    })
    .lean();

  // ================= WORKBOOK =================
  const ExcelJS = require("exceljs");

  const workbook = new ExcelJS.Workbook();

  workbook.creator = "Event Management CRM";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("Booking Report");

  worksheet.columns = [
    {
      header: "Booking Id",
      key: "bookingId",
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
      header: "Email",
      key: "email",
      width: 30,
    },
    {
      header: "Event",
      key: "event",
      width: 25,
    },
    {
      header: "Ticket Type",
      key: "ticketType",
      width: 22,
    },
    {
      header: "Quantity",
      key: "quantity",
      width: 12,
    },
    {
      header: "Amount",
      key: "amount",
      width: 15,
    },
    {
      header: "Discount",
      key: "discount",
      width: 15,
    },
    {
      header: "Created By",
      key: "createdBy",
      width: 22,
    },
    {
      header: "Remark",
      key: "remark",
      width: 30,
    },
    {
      header: "Created At",
      key: "createdAt",
      width: 22,
    },
    {
      header: "Status",
      key: "status",
      width: 15,
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
  bookings.forEach((item) => {
    worksheet.addRow({
      bookingId: item.bookingNumber || "-",

      name: item.name || "-",

      mobile: item.mobileNumber || "-",

      email: item.email || "-",

      event: item.eventId?.title || "-",

      ticketType: item.ticketTypeId?.ticketName || "-",

      quantity: item.quantity ?? 0,

      amount: item.amount ?? 0,

      discount: item.discount ?? 0,

      createdBy: item.createdBy?.name || "-",

      remark: item.remark || "-",

      createdAt: item.createdAt
        ? new Date(item.createdAt).toLocaleString("en-GB")
        : "-",

      status: item.isDeleted ? "Deleted" : "Success",
    });
  });

  // ================= DOWNLOAD =================
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );

  res.setHeader(
    "Content-Disposition",
    `attachment; filename=BookingReport_${Date.now()}.xlsx`
  );

  await workbook.xlsx.write(res);

  res.end();
};
// get booking by id
// ================= GET BOOKING BY ID =================
const getBookingById = async (bookingId) => {
  const booking = await Booking.findById(bookingId)
    .populate(
      "eventId",
      "title startDateTime endDateTime venueName image address"
    )
    .populate(
      "ticketTypeId",
      "ticketName amount"
    )
    .populate(
      "createdBy",
      "name email"
    );

  if (!booking) {
    throw new AppError("Booking not found", 404);
  }

  const tickets = await BookingTicket.find({
    bookingId: booking._id,
  })
    .select("-qrToken -qrImagePublicId -registrationToken -__v")
    .sort({ createdAt: 1 });

  return {
    ...booking.toObject(),
    tickets,
  };
};
module.exports = {
  createBooking,
  getAllBookings,
  deleteBooking,
  getBookingById,
  exportBookings
};