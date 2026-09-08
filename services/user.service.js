const User = require("../models/user.model");
const AppError = require("../utils/AppError");
const uploadToCloudinary = require("../utils/cloudinary.util");
const deleteFromCloudinary = require("../utils/deleteCloudinaryFile");
// create user
const createUser = async (admin, data, file) => {
  if (!admin || admin.role !== "admin") {
    throw new AppError("Only Admin can create users", 403);
  }

  const {
    name,
    mobile,
    password,
    confirmPassword,
  } = data;

  const email = data.email?.trim() || null;

  // permissions may arrive as a real array (JSON request) or as
  // repeated multipart/form-data fields (parsed by multer/express as a
  // single string or an array of strings) — normalize to a clean array
  // either way. Unrecognized values are dropped rather than rejected so
  // a stray/legacy value can never silently grant an unintended screen.
  const permissions = ["QR Pass", "Entry Report"];

  if (!name || !mobile || !password || !confirmPassword) {
    throw new AppError("All required fields are mandatory", 400);
  }

  if (password !== confirmPassword) {
    throw new AppError("Password and Confirm Password do not match", 400);
  }

  const mobileExist = await User.findOne({ mobile, status: "active" });

  if (mobileExist) {
    throw new AppError("Mobile already exists", 409);
  }

  if (email) {
    const emailExist = await User.findOne({ email, status: "active" });

    if (emailExist) {
      throw new AppError("Email already exists", 409);
    }
  }
  let profileImage = "";
  let profileImagePublicId = "";

  if (file) {
    const uploadedImage = await uploadToCloudinary(
      file.buffer,
      "event-management/users"
    );

    // TEMP DEBUG — remove after confirming upload works
    console.log("[DEBUG] createUser Cloudinary result:", uploadedImage);

    profileImage = uploadedImage.url;
    profileImagePublicId = uploadedImage.public_id;
  }

  // TEMP DEBUG — remove after confirming upload works
  console.log("[DEBUG] createUser before User.create ->", {
    profileImage,
    profileImagePublicId,
  });

  const user = await User.create({
    name,
    mobile,
    email,
    password,
    profileImage,
    role: "checker",
    permissions,
    profileImagePublicId,
    createdBy: admin._id
  });

  return user;
};
// get user
const getUsers = async (query) => {
  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 10;
  const search = query.search || "";

  const skip = (page - 1) * limit;

  const filter = {
    role: "checker",
    status: "active",

  };

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { mobile: { $regex: search, $options: "i" } },
    ];
  }

  const users = await User.find(filter)
    .select("-password")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await User.countDocuments(filter);

  return {
    users,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};
// update user
const updateUser = async (id, data, file) => {
  const {
    name,
    mobile,
    email,
    password,
    status,
  } = data;

  const user = await User.findById(id);

  if (!user) {
    throw new AppError("User not found", 404);
  }

  // Mobile Duplicate Check
  if (mobile && mobile !== user.mobile) {
    const mobileExists = await User.findOne({
      mobile,
      _id: { $ne: id },
    });

    if (mobileExists) {
      throw new AppError("Mobile already exists", 409);
    }
  }

  // Email Duplicate Check
  if (email && email !== user.email) {
    const emailExists = await User.findOne({
      email,
      _id: { $ne: id },
    });

    if (emailExists) {
      throw new AppError("Email already exists", 409);
    }
  }

  let profileImage = user.profileImage;
  let profileImagePublicId = user.profileImagePublicId;

  if (file) {
    if (profileImagePublicId) {
      await deleteFromCloudinary(profileImagePublicId);
    }

    const uploadedImage = await uploadToCloudinary(
      file.buffer,
      "event-management/users"
    );

    // TEMP DEBUG — remove after confirming upload works
    console.log("[DEBUG] updateUser Cloudinary result:", uploadedImage);

    profileImage = uploadedImage.url;
    profileImagePublicId = uploadedImage.public_id;
  }

  // TEMP DEBUG — remove after confirming upload works
  console.log("[DEBUG] updateUser before findByIdAndUpdate ->", {
    profileImage,
    profileImagePublicId,
  });

  const updatedUser = await User.findByIdAndUpdate(
    id,
    {
      name,
      mobile,
      email,
      status,
      profileImage,
      profileImagePublicId,
      ...(password && { password }),

      // Every Checker always has the same permissions
      permissions: ["QR Pass", "Entry Report"],
    },
    {
      new: true,
      runValidators: true,
    }
  ).select("-password");

  return updatedUser;
};
// delete
const deleteUser = async (id) => {
  const user = await User.findById(id);

  if (!user) {
    throw new AppError("User not found", 404);
  }
  if (user.profileImagePublicId) {
    await deleteFromCloudinary(user.profileImagePublicId);
  }

  await User.findByIdAndDelete(id);

  return user;
};
module.exports = {
  createUser,
  getUsers,
  updateUser,
  deleteUser
};