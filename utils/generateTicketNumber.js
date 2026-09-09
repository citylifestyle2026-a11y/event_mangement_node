const Counter = require("../models/counters.model");

// ================= EVENT-WISE TICKET NUMBER =================
// Was previously a single global counter keyed by year (`TICKET_${year}`),
// producing e.g. "TKT2026000123" shared across every event. Now keyed by
// the event's own `eventId` (`TICKET_${eventId}`) — completely separate
// from the booking counter's `BOOKING_${eventId}` key — so each event
// gets its own independent ticket sequence that always starts at 1 and
// is never shared with, or affected by, any other event. Format is
// `{eventCode}-{sequence}` with no zero-padding and no "BK" segment
// (e.g. "EVT001-1", "EVT001-2"), per the required ticket format — do not
// confuse this with the booking number's separate "EVT001-BK001" format.
// Still a single atomic findOneAndUpdate $inc/upsert (same pattern as
// before and as generateBookingNumber in booking.service.js), so two
// tickets being generated at the same moment for the same event can
// never receive the same number.
const generateTicketNumber = async (eventId, eventCode, session) => {
  const counter = await Counter.findOneAndUpdate(
    {
      name: `TICKET_${eventId}`,
    },
    {
      $inc: {
        sequence: 1,
      },
    },
    {
      new: true,
      upsert: true,
      session,
      setDefaultsOnInsert: true,
    }
  );

  return `${eventCode}-${counter.sequence}`;
};

module.exports = generateTicketNumber;