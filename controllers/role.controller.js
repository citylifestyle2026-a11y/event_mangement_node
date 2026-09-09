const roleService = require("../services/role.service");

const getRole = async (req, res) => {
  try {
    const data = roleService.getRole();

    return res.status(200).json({
      success: true,
      message: "Role fetched successfully.",
      data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch role.",
      error: error.message,
    });
  }
};

module.exports = {
  getRole,
};