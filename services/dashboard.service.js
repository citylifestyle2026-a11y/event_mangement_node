const Event = require("../models/event.model.js");
const Booking = require("../models/booking.model.js");
const BookingTicket = require("../models/bookingTicket.model.js");
const TicketType = require("../models/ticketType.model.js");

// ================= OVERALL DASHBOARD COUNTS (ALL EVENTS) =================
// Unlike the rest of this file (which is scoped to a single "active"
// event), these 4 counts are deliberately NOT event-scoped: they cover
// every existing, non-deleted event — including expired ones, since
// expired events remain in the database (and fully visible) until an
// Admin manually deletes them (see eventService.deleteEvent). A manual
// Event delete hard-deletes its Bookings/BookingTickets in the same
// transaction (see event.service.js's deleteEvent cascade), so there is
// no need to additionally filter these queries by which events still
// exist — a Booking/BookingTicket document can only exist here if its
// parent Event is still in the database.
//
// - Total Bookings: SUM of Booking.quantity (not a document count) —
//   a single Booking record can carry quantity > 1 (e.g. one entry
//   booking 5 tickets at once), so counting documents undercounted the
//   actual number of tickets booked. Also excludes bookingStatus:
//   "Cancelled" (mirrors getPassBookingBreakdown's match below — a
//   cancelled booking's tickets shouldn't count as "booked").
// - Registered Tickets: BookingTicket.isRegistered === true (set once
//   the attendee completes the public registration flow — see
//   bookingTicket.service.js's registerUser).
// - Pending Registrations: BookingTicket.isRegistered === false — the
//   exact inverse of the above, same collection.
// - Scanned Entries: BookingTicket.status === "Used" — the same filter
//   already used by entryReport.service.js to mean "actually scanned at
//   the gate".
const getDashboardCounts = async () => {
    const [totalBookingsAgg, registeredTickets, pendingRegistrations, scannedEntries] =
        await Promise.all([
            Booking.aggregate([
                {
                    $match: {
                        isDeleted: { $ne: true },
                        bookingStatus: "Confirmed",
                    },
                },
                { $group: { _id: null, totalQty: { $sum: "$quantity" } } },
            ]),
            BookingTicket.countDocuments({ isRegistered: true }),
            BookingTicket.countDocuments({ isRegistered: false }),
            BookingTicket.countDocuments({ status: "Used" }),
        ]);

    const totalBookings = totalBookingsAgg[0]?.totalQty || 0;

    return {
        totalBookings,
        registeredTickets,
        pendingRegistrations,
        scannedEntries,
    };
};

// Get Active Event
// An event is only considered "active" while isActive === true AND its
// endDateTime has not yet passed. isActive stays a manually controlled
// flag (never written here or auto-flipped) — endDateTime is what makes
// this check time-accurate on every single request, without a cron job,
// scheduler, or any DB write.
const getActiveEvent = async () => {
    const now = new Date();

    const activeEvent = await Event.findOne({
        isActive: true,
        endDateTime: { $gte: now },
    })
        .sort({ startDateTime: 1 })
        .lean();

    return activeEvent;
};


// Today Booking
const getTodayBooking = async (eventId) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date();
    end.setHours(23, 59, 59, 999);

    return await Booking.countDocuments({
        eventId,
        createdAt: {
            $gte: start,
            $lte: end,
        },
    });
};


// Total Booking
const getTotalBooking = async (eventId) => {
    return await Booking.countDocuments({
        eventId,
    });
};


// ================= PASS BOOKING (Today + Total, shared) =================
// Ticket-Type-wise booked quantity + amount, optionally restricted to a
// createdAt date range. Used by both getTodayPassBooking (range = today)
// and getTotalPassBooking (range = undefined = all time), so the exact
// same correct logic backs both cards instead of duplicating it.
//
// Booking.quantity (grouped by ticketTypeId) is the correct "booked"
// source — BookingTicket.status === "Used" measures scanned/entered
// attendees, a different metric, and was the original bug in both cards.
// TicketType.amount is the correct per-unit price (not Booking.amount),
// per the task's explicit formula: TicketType.amount x quantity.
//
// Only 2 queries total regardless of data volume: one $group/$sum
// aggregation on Booking, then one TicketType.find by the resulting
// ticketTypeIds — no N+1, and the summing happens in MongoDB, not by
// pulling every Booking into Node to loop over.
const getPassBookingBreakdown = async (eventId, dateRange) => {
    const match = {
        eventId,
        isDeleted: false,
        bookingStatus: "Confirmed",
    };

    if (dateRange) {
        match.createdAt = {
            $gte: dateRange.start,
            $lte: dateRange.end,
        };
    }

    const grouped = await Booking.aggregate([
        { $match: match },
        {
            $group: {
                _id: "$ticketTypeId",
                qty: { $sum: "$quantity" },
            },
        },
    ]);

    if (!grouped.length) {
        return {
            passBookingCounts: [],
            totalQty: 0,
            totalAmount: 0,
        };
    }

    const ticketTypeIds = grouped.map((g) => g._id);

    // Using the actual TicketType model (rather than a $lookup with a
    // hand-written collection name) so the correct collection is always
    // resolved by Mongoose itself.
    const ticketTypes = await TicketType.find(
        { _id: { $in: ticketTypeIds } },
        { ticketName: 1, amount: 1 }
    ).lean();

    const ticketTypeMap = new Map(
        ticketTypes.map((t) => [String(t._id), t])
    );

    const passBookingCounts = grouped
        .map((g) => {
            const ticketType = ticketTypeMap.get(String(g._id));
            const unitAmount = ticketType?.amount || 0;

            return {
                ticketTypeId: g._id,
                ticketName: ticketType?.ticketName || "Unknown Ticket Type",
                qty: g.qty,
                amount: unitAmount * g.qty,
            };
        })
        .sort((a, b) => a.ticketName.localeCompare(b.ticketName));

    const totalQty = passBookingCounts.reduce((sum, r) => sum + r.qty, 0);
    const totalAmount = passBookingCounts.reduce(
        (sum, r) => sum + r.amount,
        0
    );

    return { passBookingCounts, totalQty, totalAmount };
};

// Today Pass Booking — same breakdown, restricted to bookings created today.
const getTodayPassBooking = async (eventId) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date();
    end.setHours(23, 59, 59, 999);

    return getPassBookingBreakdown(eventId, { start, end });
};

// Total Pass Booking — same breakdown, all time (no date range).
const getTotalPassBooking = async (eventId) => {
    return getPassBookingBreakdown(eventId);
};


// Booking Chart Count
const getBookingCounts = async (eventId) => {

    const data = await Booking.aggregate([
        {
            $match: {
                eventId,
            },
        },
        {
            $group: {
                _id: {
                    $dateToString: {
                        format: "%Y-%m-%d",
                        date: "$createdAt",
                    },
                },
                count: {
                    $sum: 1,
                },
            },
        },
        {
            $sort: {
                _id: 1,
            },
        },
    ]);

    return data.map((item) => ({
        date: item._id,
        count: item.count,
    }));
};

// Total Booking Details (Day Wise)
const getTotalBookingDetails = async (eventId) => {
    const bookings = await Booking.find({
        eventId,
        isDeleted: false,
    })
        .select("quantity ticketTypeId")
        .populate({
            path: "ticketTypeId",
            select: "allowDates",
        })
        .lean();

    const dateWiseMap = {};

    bookings.forEach((booking) => {
        if (!booking.ticketTypeId?.allowDates?.length) return;

        booking.ticketTypeId.allowDates.forEach((date) => {
            const key = new Date(date).toISOString().split("T")[0];

            if (!dateWiseMap[key]) {
                dateWiseMap[key] = {
                    date: key,
                    count: 0,
                };
            }

            dateWiseMap[key].count += booking.quantity;
        });
    });

    return Object.values(dateWiseMap).sort(
        (a, b) => new Date(a.date) - new Date(b.date)
    );
};
// Dashboard Summary
 const getDashboardSummary = async () => {

    // Overall, all-events counts — computed unconditionally (not inside
    // the `!activeEvent` branch below) since these must keep reflecting
    // every existing event, including one whose endDateTime has passed
    // and which therefore no longer qualifies as "active".
    const dashboardCounts = await getDashboardCounts();

    const activeEvent = await getActiveEvent();

    if (!activeEvent) {
        return {
            ...dashboardCounts,
            activeEvent: null,
            todayBooking: 0,
            todayPassBooking: 0,
            todayPassAmount: 0,
            todayPassBookingCounts: [],
            totalBooking: 0,
            totalPassBooking: 0,
            totalPassAmount: 0,
            passBookingCounts: [],
            bookingCounts: [],
            totalBookingDetails: [],
        };
    }


    const todayBooking = await getTodayBooking(activeEvent._id);
    const todayPassResult = await getTodayPassBooking(activeEvent._id);
    const totalBooking = await getTotalBooking(activeEvent._id);
    const totalPassResult = await getTotalPassBooking(activeEvent._id);
    const bookingCounts = await getBookingCounts(activeEvent._id);
    const totalBookingDetails = await getTotalBookingDetails(
        activeEvent._id
    );

    return {
        ...dashboardCounts,
        activeEvent,
        todayBooking,
        // Today's booked quantity + amount, ticket-type-wise breakdown.
        todayPassBooking: todayPassResult.totalQty,
        todayPassAmount: todayPassResult.totalAmount,
        todayPassBookingCounts: todayPassResult.passBookingCounts,
        totalBooking,
        // Total quantity of all booked passes across every ticket type
        // (sum of passBookingCounts[].qty), not a document count.
        totalPassBooking: totalPassResult.totalQty,
        // Sum of every ticket type's (qty x TicketType.amount).
        totalPassAmount: totalPassResult.totalAmount,
        // Ticket-Type-wise breakdown: [{ ticketTypeId, ticketName, qty, amount }]
        passBookingCounts: totalPassResult.passBookingCounts,
        bookingCounts,
        totalBookingDetails,
    };
};
module.exports = {
    getDashboardSummary,
};