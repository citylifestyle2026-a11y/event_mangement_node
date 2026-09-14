const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const adminSchema = new mongoose.Schema(
{
    name:{
        type:String,
        required:true,
        trim:true
    },

    email:{
        type:String,
        required:true,
        unique:true,
        lowercase:true,
        trim:true
    },

    mobile:{
        type:String,
        required:true,
        unique:true,
        trim:true
    },

    password:{
        type:String,
        required:true,
        select:false
    },

    role:{
        type:String,
        default:"admin"
    },

    // Distinguishes the Super Admin (CityLifestyle) from normal Admins.
    // Separate from `role` on purpose — `role` is what the existing
    // auth/JWT/authorize system already reads ("admin" vs "checker") and
    // must stay untouched. `adminType` is the new, additive field that
    // Admin-management features will use to gate Super-Admin-only
    // actions (e.g. creating Admins) later.
    // default:"admin" also means any Admin document saved/read without
    // this field (existing records created before this change) safely
    // resolves to a normal "admin" — never "superadmin" by accident.
    adminType:{
        type:String,
        enum:["superadmin","admin"],
        default:"admin"
    },

    status:{
        type:String,
        enum:["active","inactive"],
        default:"active"
    },

    // Admin's own profile photo (Edit Profile). Same field/pattern as
    // User.model.js's profileImage/profileImagePublicId — populated via
    // the shared uploadToLocal utility (utils/localUpload.util.js), which
    // now stores every uploaded image as WEBP. Optional: an Admin with no
    // photo simply has "" here, and the frontend falls back to a
    // generated avatar (see Header.jsx/Profile.jsx).
    profileImage:{
        type:String,
        default:"",
        trim:true
    },

    profileImagePublicId:{
        type:String,
        default:"",
        trim:true
    },

    // ================= FORGOT PASSWORD (OTP, via email) =================
    // Populated by POST /api/auth/forgot-password (controllers/auth.controller.js
    // forgotPassword) and consumed by POST /api/auth/verify-reset-otp /
    // POST /api/auth/reset-password-confirm. The OTP itself is hashed with
    // bcrypt before being stored here — never kept in plaintext — mirroring
    // how `password` above is handled. `select:false` so neither field is
    // ever returned by a normal query (must be explicitly `.select("+resetPasswordOtp ...")`ed,
    // same convention as `password`).
    resetPasswordOtp:{
        type:String,
        select:false
    },

    resetPasswordOtpExpiresAt:{
        type:Date,
        select:false
    }
},
{
    timestamps:true,
    versionKey:false
}
);


// Password Hash
adminSchema.pre("save",async function(next){

    if(!this.isModified("password")){
        return next();
    }

    const salt = await bcrypt.genSalt(10);

    this.password = await bcrypt.hash(
        this.password,
        salt
    );

    next();
});


const Admin = mongoose.model(
    "Admin",
    adminSchema
);


module.exports = Admin;