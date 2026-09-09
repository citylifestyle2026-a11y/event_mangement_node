// schedulers/eventExpiry.scheduler.js
//
// Automatic expired-event cleanup. No cron / job-queue / background-worker
// mechanism existed anywhere in this backend before this file — the only
// prior "expiry" handling (dashboard.service.js's getActiveEvent,
// booking.service.js's createBooking/getAllBookings, entryReport.service.js)
// was a read-time `endDateTime < now` check; none of it ever deleted
// anything, and nothing ran on its own. This file is the smallest addition
// that makes cleanup automatic without adding any new npm dependency: a
// plain setInterval loop using Node's built-in timer API, calling
// eventService.deleteExpiredEvents() (see services/event.service.js) on a
// fixed cadence.
//
// This module does nothing on require — it only exports functions. Wiring
// it in requires exactly ONE line added to the application's startup file
// (the file that currently calls connectDB()), for example:
//
//   const connectDB = require("./config/db");
//   const { startEventExpiryScheduler } = require("./schedulers/eventExpiry.scheduler");
//
//   connectDB().then(() => {
//     startEventExpiryScheduler();
//   });
//
// It must be started AFTER the Mongoose connection is established, so the
// first cleanup tick never runs against a disconnected DB. No server.js /
// app.js was included in the uploaded backend, so that one-line call could
// not be added here — it needs to be added to your actual startup file.

const eventService = require("../services/event.service");

// 5 minutes: frequent enough that an expired event's data is purged
// promptly, infrequent enough to add no meaningful DB load. This is the
// only place the cadence is defined.
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

let intervalHandle = null;

const runCleanup = async () => {
  try {
    const result = await eventService.deleteExpiredEvents();

    if (result.processed > 0 || result.failed > 0) {
      console.log(
        `[eventExpiry.scheduler] processed=${result.processed} failed=${result.failed}`,
        result.details
      );
    }
  } catch (error) {
    // deleteExpiredEvents already isolates per-event failures internally
    // (see event.service.js) — this catch only guards against something
    // failing before that loop even starts (e.g. a transient DB
    // connection error), so a single bad tick can never kill the
    // interval or crash the process.
    console.error("[eventExpiry.scheduler] cleanup run failed:", error);
  }
};

// Starts the recurring cleanup. Safe to call more than once — a second
// call is a no-op rather than creating a second overlapping interval.
const startEventExpiryScheduler = () => {
  if (intervalHandle) {
    return intervalHandle;
  }

  // Run once immediately, so an event that expired while the server was
  // down (or during the gap before the first interval tick) doesn't sit
  // around undeleted for a full interval.
  runCleanup();

  intervalHandle = setInterval(runCleanup, CLEANUP_INTERVAL_MS);

  // Don't let this timer keep the Node process alive on its own (e.g.
  // during graceful shutdown or tests).
  if (typeof intervalHandle.unref === "function") {
    intervalHandle.unref();
  }

  return intervalHandle;
};

// Stops the recurring cleanup. Exposed mainly for tests / graceful
// shutdown; normal server operation never needs to call this.
const stopEventExpiryScheduler = () => {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
};

module.exports = {
  startEventExpiryScheduler,
  stopEventExpiryScheduler,
};