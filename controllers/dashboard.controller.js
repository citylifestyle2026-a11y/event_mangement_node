import * as dashboardService from "../services/dashboard.service.js";
import Event from "../models/event.model.js";
// dasboard summery
export const getDashboardSummary = async (req, res, next) => {
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
