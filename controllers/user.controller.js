const userService = require("../services/user.service");
// create user
const createUser = async (req, res, next) => {
  try {
    // TEMP DEBUG — remove after confirming upload works
    const result = await userService.createUser(
      req.user,
      req.body,
      req.file
    );

    return res.status(201).json({
      success: true,
      message: "User created successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
// get user
const getUsers = async (req, res, next) => {
  try {
    const result = await userService.getUsers(req.query);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
// edit user
const updateUser = async (req, res, next) => {
  try {

    const result = await userService.updateUser(
      req.params.id,
      req.body,
      req.file
    );

    return res.status(200).json({
      success: true,
      message: "User updated successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
// delete users
const deleteUser = async (req, res, next) => {
  try {
    await userService.deleteUser(req.params.id);

    return res.status(200).json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};
module.exports = {
  createUser,
  getUsers,
  updateUser,
  deleteUser,
};