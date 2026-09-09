const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const Admin = require("../models/admin.model");
const User = require("../models/user.model");

// Single login endpoint shared by Admin and Checker/User — the frontend
// only has one login form (no role selector), so both account types are
// authenticated here. Admin is checked FIRST and its behavior/response
// shape is completely unchanged from before; a Checker/User is only
// looked up when no Admin matches the given email/mobile.
const login = async (req, res) => {
    try {
        const { login, password } = req.body;

        if (!login || !password) {
            return res.status(400).json({
                success:false,
                message:"Login and password are required",
            });
        }

        const admin = await Admin.findOne({
            $or:[
                { email:login.toLowerCase() },
                { mobile:login }
            ]
        }).select("+password");

        if (admin) {
            const isPasswordMatch = await bcrypt.compare(
                password,
                admin.password
            );

            if (!isPasswordMatch) {
                return res.status(401).json({
                    success:false,
                    message:"Invalid email/mobile or password",
                });
            }

            const token = jwt.sign(
                {
                    id:admin._id,
                    role:"admin",
                },
                process.env.JWT_SECRET,
                {
                    expiresIn:"1d",
                }
            );

            return res.status(200).json({
                success:true,
                message:"Login successful",
                token,
                user:{
                    id:admin._id,
                    name:admin.name,
                    email:admin.email,
                    mobile:admin.mobile,
                    role:"admin",
                },
            });
        }

        // ================= CHECKER / USER LOGIN =================
        // No Admin matched — try the User (checker) collection using the
        // exact same credential lookup and bcrypt comparison approach.
        const user = await User.findOne({
            $or:[
                { email:login.toLowerCase() },
                { mobile:login }
            ]
        }).select("+password");

        if (!user) {
            return res.status(401).json({
                success:false,
                message:"Invalid email/mobile or password",
            });
        }

        if (user.status !== "active") {
            return res.status(403).json({
                success:false,
                message:"Account is inactive",
            });
        }

        const isUserPasswordMatch = await bcrypt.compare(
            password,
            user.password
        );

        if (!isUserPasswordMatch) {
            return res.status(401).json({
                success:false,
                message:"Invalid email/mobile or password",
            });
        }

        const userToken = jwt.sign(
            {
                id:user._id,
                role:user.role, // "checker" — taken from the User document itself,
                                 // never hardcoded, so JWT role always matches the
                                 // authenticated account's actual role.
            },
            process.env.JWT_SECRET,
            {
                expiresIn:"1d",
            }
        );

        return res.status(200).json({
            success:true,
            message:"Login successful",
            token:userToken,
            user:{
                id:user._id,
                name:user.name,
                email:user.email,
                mobile:user.mobile,
                role:user.role,
                permissions:user.permissions,
            },
        });

    } catch(error) {
        return res.status(500).json({
            success:false,
            message:error.message,
        });
    }
};


const getProfile = async (req,res) => {
    try {
        // req.user is already the correct document (Admin or User) as
        // resolved by the protect middleware. req.user.role tells us
        // which collection it came from, so profile lookup below
        // re-fetches from the SAME collection (not always Admin), while
        // keeping the exact same response shape { success, data } that
        // the frontend already relies on.
        if (req.user.role === "admin") {
            const admin = await Admin.findById(req.user.id)
                .select("-password");

            if (!admin) {
                return res.status(404).json({
                    success:false,
                    message:"Admin not found",
                });
            }

            return res.status(200).json({
                success:true,
                data:admin,
            });
        }

        const user = await User.findById(req.user.id)
            .select("-password");

        if (!user) {
            return res.status(404).json({
                success:false,
                message:"User not found",
            });
        }

        return res.status(200).json({
            success:true,
            data:user,
        });

    } catch(error) {
        return res.status(500).json({
            success:false,
            message:error.message,
        });
    }
};


const updateProfile = async (req, res) => {
    try {
        // Same model-resolution pattern already used by getProfile: which
        // collection to hit is taken from req.user.role (set correctly by
        // the protect middleware for both Admin and User/Checker), never
        // hardcoded to Admin.
        const accountId = req.user.id;
        const { name } = req.body;
        const isAdmin = req.user.role === "admin";
        const Model = isAdmin ? Admin : User;

        const account = await Model.findById(accountId);

        if (!account) {
            return res.status(404).json({
                success:false,
                message: isAdmin ? "Admin not found" : "User not found",
            });
        }

       

        // Only these 3 fields are ever touched here.
        // _id, password, role, status are never assigned from req.body.
        account.name = name;
       

        await account.save();

        const updatedAccount = account.toObject();
        delete updatedAccount.password;

        return res.status(200).json({
            success:true,
            message:"Profile updated successfully",
            data:updatedAccount,
        });

    } catch(error) {
        return res.status(500).json({
            success:false,
            message:error.message,
        });
    }
};


const resetPassword = async (req, res) => {
    try {
        // Same model-resolution pattern already used by getProfile — see
        // the matching comment in updateProfile.
        const accountId = req.user.id;
        const { currentPassword, newPassword, confirmPassword } = req.body;
        const isAdmin = req.user.role === "admin";
        const Model = isAdmin ? Admin : User;

        // newPassword === confirmPassword is already enforced by
        // resetPasswordValidation, this is just a defensive re-check
        if (newPassword !== confirmPassword) {
            return res.status(400).json({
                success:false,
                message:"New password and confirm password do not match",
            });
        }

        // password has select:false on the schema, so it must be
        // explicitly requested here
        const account = await Model.findById(accountId).select("+password");

        if (!account) {
            return res.status(404).json({
                success:false,
                message: isAdmin ? "Admin not found" : "User not found",
            });
        }

        const isCurrentPasswordMatch = await bcrypt.compare(
            currentPassword,
            account.password
        );

        if (!isCurrentPasswordMatch) {
            return res.status(401).json({
                success:false,
                message:"Current password is incorrect",
            });
        }

        const isSameAsCurrentPassword = await bcrypt.compare(
            newPassword,
            account.password
        );

        if (isSameAsCurrentPassword) {
            return res.status(400).json({
                success:false,
                message:"New password must be different from current password",
            });
        }

        // Do NOT hash here — both the Admin and User schemas' pre("save")
        // middleware already hash password on save. Hashing again here
        // would double-hash it.
        account.password = newPassword;
        await account.save();

        return res.status(200).json({
            success:true,
            message:"Password reset successfully",
        });

    } catch(error) {
        return res.status(500).json({
            success:false,
            message:error.message,
        });
    }
};


const logout = async (req, res) => {
    try {
        // Stateless JWT: there is no server-side session/token record to
        // clear. The token remains technically valid until it expires
        // (expiresIn: "1d") — the frontend is responsible for discarding
        // it from wherever it's stored (localStorage/cookie/etc).
        return res.status(200).json({
            success:true,
            message:"Logout successful",
        });

    } catch(error) {
        return res.status(500).json({
            success:false,
            message:error.message,
        });
    }
};


module.exports = {
    login,
    getProfile,
    updateProfile,
    resetPassword,
    logout,
};