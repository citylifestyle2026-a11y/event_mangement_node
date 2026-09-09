const express = require("express");

const router = express.Router();

const entryReportController = require("../controllers/entryReport.controller");
const { protect } = require("../middlewares/auth.middleware");
const authorize = require("../middlewares/authorize.middleware");
const validate = require("../middlewares/validate.middleware");

const {
  getAllEntryReportValidation,
  exportEntryReportValidation,
} = require("../validators/entryReport.validation");
// get active events (for the Event dropdown)
// Same access rule as the rest of this module: Admin always has access;
// a Checker additionally needs the "Entry Report" permission.
router.get(
  "/active-events",
  protect,
  authorize("admin", "checker", { permission: "Entry Report" }),
  entryReportController.getActiveEvents
);
// get all entery report
// Admin always has access; a Checker additionally needs the
// "Entry Report" permission on their User document.
router.get(
  "/get-all-entry-report",
  protect,
  authorize("admin", "checker", { permission: "Entry Report" }),
  getAllEntryReportValidation,
  validate,
  entryReportController.getAllEntryReports
);
// export excel
router.get(
  "/export",
  protect,
  authorize("admin", "checker", { permission: "Entry Report" }),
  exportEntryReportValidation,
  validate,
  entryReportController.exportEntryReport
);
module.exports = router;