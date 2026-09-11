const Event = require("../models/event.model.js");
const Booking = require("../models/booking.model.js");
const BookingTicket = require("../models/bookingTicket.model.js");
const TicketType = require("../models/ticketType.model.js");

// Get Active Event
// An event is "currently running" while isActive === true AND its
// endDateTime has not yet passed — that part is unchanged. But an event
// expiring must never hide its own historical data (Step 5): if nothing
// is currently running, this now falls back to the most recently expired
// (but not yet deleted) event instead of returning null, so the
// Dashboard keeps showing that event's booking/pass counts until an
// Admin explicitly deletes it. A deleted event's document no longer
// exists at all (hard delete, cascading to its Bookings/BookingTickets
// in the same transaction — see event.service.js), so nothing further
// needs excluding here once that happens. isActive stays a manually
// controlled flag (never written here or auto-flipped by expiry).
const getActiveEvent = async () => {
    const now = new Date();

    const runningEvent = await Event.findOne({
        isActive: true,
        endDateTime: { $gte: now },
    })
        .sort({ startDateTime: 1 })
        .lean();

    if (runningEvent) {
        return runningEvent;
    }

    const lastExpiredEvent = await Event.findOne({
        isActive: true,
        endDateTime: { $lt: now },
    })
        .sort({ endDateTime: -1 })
        .lean();

    return lastExpiredEvent;
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

    const activeEvent = await getActiveEvent();

    if (!activeEvent) {
        return {
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