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
const buildQrNotificationBodyParams = require("../utils/buildQrNotificationBodyParams");
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

// ================= SEND BOOKING QR VIA WHATSAPP (BEST-EFFORT) =================
// Runs only after the booking + ticket transaction has already committed
// successfully, and is intentionally never allowed to fail the booking:
// Chatbox is an optional notification channel here, not part of the core
// booking transaction. Any failure (missing Chatbox env config, Chatbox
// API error, network error) is caught per-ticket and only logged —
// never rethrown, and never surfaced in the API response — so a
// WhatsApp outage can never turn a successful booking into a failed
// request. The caught error's message is logged for diagnostics but the
// CHATBOX_API_KEY itself is never part of that message (see
// whatsapp.service.js), so nothing sensitive reaches the logs.
//
// Uses sendMediaTemplateMessage (an approved WhatsApp template), NOT
// sendImageMessage. A freshly-booked customer has virtually never
// messaged the business's WhatsApp number first, so the 24-hour
// customer-service session window is closed — WhatsApp rejects a
// free-form sendImageMessage in that case with error 131047
// ("Re-engagement message"), even though the Chatbox API itself still
// returns HTTP 200. Templates are the only supported way to deliver a
// message outside that window. See utils/buildQrNotificationBodyParams.js
// for the exact {{1}}-{{5}} mapping used by the approved
// "event_booking_qr_pass" template.
const sendBookingWhatsAppNotifications = async (booking, event, ticketType, tickets) => {
  const templateName = process.env.CHATBOX_QR_TEMPLATE_NAME;
  const templateLanguage = process.env.CHATBOX_QR_TEMPLATE_LANGUAGE || "en";

  for (const ticket of tickets) {
    try {
      await whatsappService.sendMediaTemplateMessage({
        phone: booking.mobileNumber,
        templateName,
        languageCode: templateLanguage,
        imageUrl: ticket.qrImage,
        bodyParams: buildQrNotificationBodyParams({ booking, event, ticketType, ticket }),
      });
    } catch (error) {
      console.error(
        `WhatsApp QR notification failed for ticket ${ticket.ticketNumber}:`,
        error.message
      );
    }
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

      bookingTickets.push({
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
      });
    }

    const insertedTickets = await BookingTicket.insertMany(
      bookingTickets,
      { session }
    );

    await session.commitTransaction();

    // ================= WHATSAPP QR NOTIFICATION (NON-BLOCKING) =================
    // Sent only after the transaction has committed, so a WhatsApp failure
    // can never roll back or fail an already-successful booking (see
    // sendBookingWhatsAppNotifications above for the error-handling
    // rationale). The response shape below is unchanged either way.
    await sendBookingWhatsAppNotifications(
      booking[0],
      event,
      ticketType,
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
// - eventId supplied: scope is exactly that one event, and ONLY if it's
//   still a real, non-deleted, non-expired event — never blindly trusted,
//   so a stale/expired eventId can't leak bookings that should already be
//   gone. (There's a small window, up to one scheduler tick, where an
//   event has expired but the expiry scheduler hasn't deleted it yet;
//   this check keeps that window's bookings from showing rather than
//   waiting for the scheduler.)
// - eventId omitted: scope is EVERY currently active (isActive: true),
//   non-deleted, non-expired event — not just the first one — so bookings
//   from Event A and Event B are both included when both are active.
//   Previously this used Event.findOne(...), which silently discarded
//   every active event but the earliest-starting one.
const resolveEventScope = async (eventId) => {
  const now = new Date();

  if (eventId) {
    const event = await Event.findOne({
      _id: eventId,
      isDeleted: { $ne: true },
      endDateTime: { $gte: now },
    }).select("_id title startDateTime endDateTime");

    return event ? { eventIds: [event._id], events: [event] } : { eventIds: [], events: [] };
  }

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
    .select("-qrToken -qrImagePublicId -__v")
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