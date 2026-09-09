const Counter = require("../models/counters.model");

// Generates the next event code (EVT001, EVT002, EVT003, ...) from a
// single global, never-reset counter document (`name: "EVENT_SEQ"`).
// Mirrors the existing generateTicketNumber.js pattern: an atomic
// findOneAndUpdate $inc/upsert on the shared Counter collection, so two
// events being created at the same moment can never receive the same
// code. Unlike the booking/ticket counters, this one is intentionally
// NOT scoped by year or by event — event codes must stay unique and
// stable for as long as the system has ever existed, including after an
// event (and its own counter) has been deleted by the expiry scheduler.
const generateEventCode = async (session) => {
  const counter = await Counter.findOneAndUpdate(
    { name: "EVENT_SEQ" },
    { $inc: { sequence: 1 } },
    { new: true, upsert: true, session, setDefaultsOnInsert: true }
  );

  return `EVT${String(counter.sequence).padStart(3, "0")}`;
};

module.exports = generateEventCode;