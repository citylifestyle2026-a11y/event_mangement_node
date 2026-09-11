// schedulers/eventExpiry.scheduler.js
//
// ================= DISABLED: EXPIRY MUST NEVER AUTO-DELETE =================
// Per the app's rule, an expired event must NOT be treated as deleted —
// its bookings, entry-report data, and dashboard counts must remain fully
// available until an Admin explicitly deletes it (see
// eventService.deleteEvent, the ONLY supported deletion path, which
// requires admin email/password verification at the controller layer).
//
// This scheduler previously called a `eventService.deleteExpiredEvents()`
// method that performed automatic cleanup of expired events. That method
// does not exist on eventService (event.service.js has no such export),
// and this scheduler was never wired into any app startup file in this
// project, so it has never actually run. It is kept here only as a
// disabled no-op (rather than removed outright) so any external code that
// already imports start/stopEventExpiryScheduler keeps working, but it is
// intentionally hardcoded to do nothing — automatic expiry deletion must
// never be reintroduced here or anywhere else.
//
// If a periodic job is ever needed again for something else (e.g. purely
// cosmetic status housekeeping), it must NOT delete Event/Booking/
// BookingTicket documents. Deletion must stay exclusively behind the
// manual, admin-verified delete flow.

let intervalHandle = null;

// No-op: intentionally does not delete anything.
const runCleanup = async () => {};

// No-op: does not start any interval/timer. Safe to call; does nothing.
const startEventExpiryScheduler = () => {
  return intervalHandle;
};

// No-op: nothing is ever started, so there is nothing to stop.
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