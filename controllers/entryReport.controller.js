const entryReportService = require("../services/entryReport.service");
// get active events (for the Entry Report Event dropdown)
const getActiveEvents = async (req, res, next) => {
  try {
    const events = await entryReportService.getActiveEvents();

    return res.status(200).json({
      success: true,
      message: "Active events fetched successfully.",
      data: events,
    });
  } catch (error) {
    next(error);
  }
};
// get all entery report
const getAllEntryReports = async (req, res, next) => {
  try {
    // req.user is the authenticated Admin or User (Checker) document,
    // resolved server-side by the protect middleware — never trust a
    // scannedBy/checker id sent from the client. The service uses this
    // to decide whether to restrict results to this Checker's own scans.
    const result = await entryReportService.getAllEntryReports(
      req.query,
      req.user
    );

    return res.status(200).json({
      success: true,
      message: "Entry report fetched successfully.",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
// export entery report
const exportEntryReport = async (req, res, next) => {
  try {
    // Same authenticated-user-driven restriction applied to export as
    // to the table endpoint, so a Checker can never export another
    // Checker's (or the full) record set.
    await entryReportService.exportEntryReport(req.query, res, req.user);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getActiveEvents,
  getAllEntryReports,
  exportEntryReport,
};