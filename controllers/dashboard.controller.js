const dashboardService = require("../services/dashboard.service");

// dasboard summery
const getDashboardSummary = async (req, res, next) => {
    try {
        // Optional: lets the dashboard's own Event selector request any
        // one non-deleted event (active or inactive/expired) specifically.
        // Omitted -> unchanged default (currently active event, or the
        // most recently expired one if nothing is currently running).
        const data = await dashboardService.getDashboardSummary(req.query.eventId);

        return res.status(200).json({
            success: true,
            message: "Dashboard summary fetched successfully.",
            data,
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getDashboardSummary,
};