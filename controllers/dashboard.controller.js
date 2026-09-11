const dashboardService = require("../services/dashboard.service");

// dasboard summery
const getDashboardSummary = async (req, res, next) => {
    try {
        const data = await dashboardService.getDashboardSummary();

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