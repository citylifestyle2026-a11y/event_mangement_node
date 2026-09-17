const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const Admin = require("../models/admin.model");
const User = require("../models/user.model");
const uploadImage = require("../utils/localUpload.util");
const deleteImage = require("../utils/deleteLocalFile");
const { sendPasswordResetOtpEmail } = require("../utils/email.util");

// 6-digit numeric OTP, generated fresh on every forgot-password request.
// Never returned to the client anywhere — only ever emailed and, hashed,
// stored on the account for later verification.
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));

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
                    message:"Password is incorrect",
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
                message:"Email or mobile number is incorrect",
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
                message:"Password is incorrect",
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

        // Only these fields are ever touched here.
        // _id, password, role, status are never assigned from req.body.
        account.name = name;

        // Optional profile photo — `upload.single("profileImage")`
        // (routes/auth.routes.js) parses it into req.file before this
        // controller runs. Only touched when a new file was actually
        // sent, so saving the form without picking a new photo never
        // wipes out the existing one. Reuses the exact same
        // local-storage upload/delete utilities as every other image
        // flow in the app (Event, User, attendee photos) — no second
        // storage system, and localUpload.util.js already converts
        // JPG/PNG to WEBP the same way it does for every other upload.
        if (req.file) {
            if (account.profileImagePublicId) {
                await deleteImage(account.profileImagePublicId);
            }

            const folder = isAdmin
                ? "event-management/admins"
                : "event-management/users";

            const uploadedImage = await uploadImage(req.file, folder);

            account.profileImage = uploadedImage.url;
            account.profileImagePublicId = uploadedImage.public_id;
        }

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


// ================= FORGOT PASSWORD: STEP 1 — SEND OTP =================
// Public route (no `protect`) — the whole point is the user isn't logged
// in. Looks across BOTH Admin and User/Checker (same shared-collection
// pattern as login/getProfile/updateProfile above), since both sign in
// through the same Login page. Always returns the same generic success
// message whether or not an account exists for that email, so this
// endpoint can't be used to enumerate registered accounts — a real OTP
// is only generated/emailed when an account IS found.
const forgotPassword = async (req, res) => {
    try {
        const email = req.body.email.trim().toLowerCase();

        const genericSuccess = () => res.status(200).json({
            success:true,
            message:"If an account exists with this email, a password reset OTP has been sent.",
        });

        const admin = await Admin.findOne({ email });
        const account = admin || await User.findOne({ email });

        if (!account) {
            return genericSuccess();
        }

        const otp = generateOtp();
        const otpHash = await bcrypt.hash(otp, 10);

        account.resetPasswordOtp = otpHash;
        account.resetPasswordOtpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
        await account.save();

        try {
            await sendPasswordResetOtpEmail(account.email, account.name, otp);
        } catch (emailError) {
            // Log the real SMTP/nodemailer error so it's actually visible
            // in server logs — the response below is intentionally generic
            // for the client, but we must not lose the real reason server-side.
            console.error("Password reset email failed:", {
                message: emailError.message,
                code: emailError.code,
                response: emailError.response,
                command: emailError.command,
            });

            // The email never went out — roll back the OTP so it can't
            // be "verified" via some other channel, and tell the caller
            // this specific attempt failed (this is the one case where
            // the response intentionally differs from the generic
            // message above, since it reflects a server/delivery
            // problem rather than which emails are registered).
            account.resetPasswordOtp = undefined;
            account.resetPasswordOtpExpiresAt = undefined;
            await account.save();

            return res.status(500).json({
                success:false,
                message:"Failed to send the reset email. Please try again in a few minutes.",
            });
        }

        return genericSuccess();

    } catch(error) {
        return res.status(500).json({
            success:false,
            message:error.message,
        });
    }
};


// ================= FORGOT PASSWORD: STEP 2 — VERIFY OTP =================
// Lets the frontend confirm the OTP is correct BEFORE showing the
// new-password screen (better UX than only finding out at the final
// submit). This does not consume/clear the OTP or change anything —
// resetPasswordWithOtp below independently re-verifies it from scratch
// before actually changing the password, so this step is purely
// informational and can't be used to "pre-approve" a later request.
const verifyResetOtp = async (req, res) => {
    try {
        const email = req.body.email.trim().toLowerCase();
        const { otp } = req.body;

        const invalid = () => res.status(400).json({
            success:false,
            message:"Invalid or expired OTP.",
        });

        const admin = await Admin.findOne({ email })
            .select("+resetPasswordOtp +resetPasswordOtpExpiresAt");
        const account = admin || await User.findOne({ email })
            .select("+resetPasswordOtp +resetPasswordOtpExpiresAt");

        if (!account || !account.resetPasswordOtp || !account.resetPasswordOtpExpiresAt) {
            return invalid();
        }

        if (account.resetPasswordOtpExpiresAt.getTime() < Date.now()) {
            return invalid();
        }

        const isMatch = await bcrypt.compare(otp, account.resetPasswordOtp);

        if (!isMatch) {
            return invalid();
        }

        return res.status(200).json({
            success:true,
            message:"OTP verified. You can now set a new password.",
        });

    } catch(error) {
        return res.status(500).json({
            success:false,
            message:error.message,
        });
    }
};


// ================= FORGOT PASSWORD: STEP 3 — SET NEW PASSWORD =================
// Re-verifies the OTP+expiry+match from scratch (never trusts that
// verifyResetOtp was called earlier in the same session) before actually
// changing the password — the same "never trust client-asserted state"
// principle already used elsewhere in this file. On success the OTP is
// cleared so it can't be reused.
const resetPasswordWithOtp = async (req, res) => {
    try {
        const email = req.body.email.trim().toLowerCase();
        const { otp, newPassword, confirmPassword } = req.body;

        // newPassword === confirmPassword is already enforced by
        // resetPasswordWithOtpValidation, this is just a defensive re-check
        // (same pattern as the authenticated resetPassword above).
        if (newPassword !== confirmPassword) {
            return res.status(400).json({
                success:false,
                message:"New password and confirm password do not match",
            });
        }

        const invalid = () => res.status(400).json({
            success:false,
            message:"Invalid or expired OTP.",
        });

        const admin = await Admin.findOne({ email })
            .select("+resetPasswordOtp +resetPasswordOtpExpiresAt");
        const account = admin || await User.findOne({ email })
            .select("+resetPasswordOtp +resetPasswordOtpExpiresAt");

        if (!account || !account.resetPasswordOtp || !account.resetPasswordOtpExpiresAt) {
            return invalid();
        }

        if (account.resetPasswordOtpExpiresAt.getTime() < Date.now()) {
            return invalid();
        }

        const isMatch = await bcrypt.compare(otp, account.resetPasswordOtp);

        if (!isMatch) {
            return invalid();
        }

        // Do NOT hash here — both the Admin and User schemas' pre("save")
        // middleware already hash password on save (same note as the
        // authenticated resetPassword above).
        account.password = newPassword;
        account.resetPasswordOtp = undefined;
        account.resetPasswordOtpExpiresAt = undefined;
        await account.save();

        return res.status(200).json({
            success:true,
            message:"Password reset successfully. You can now log in with your new password.",
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
    forgotPassword,
    verifyResetOtp,
    resetPasswordWithOtp,
    logout,
};