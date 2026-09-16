require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Admin = require("../models/admin.model");

const ADMIN_NAME = process.env.SEED_ADMIN_NAME || "SuperAdmin";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || "lunagriyamukund1@gmail.com";
const ADMIN_MOBILE = process.env.SEED_ADMIN_MOBILE || "9081312475";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "RDM789!@#";

const run = async () => {
    await connectDB();

    const existing = await Admin.findOne({
        $or: [
            { email: ADMIN_EMAIL.toLowerCase() },
            { mobile: ADMIN_MOBILE }
        ]
    });

    if (existing) {
        existing.name = ADMIN_NAME;
        existing.email = ADMIN_EMAIL.toLowerCase();
        existing.mobile = ADMIN_MOBILE;
        existing.password = ADMIN_PASSWORD;
        existing.adminType = "superadmin";

        await existing.save();

        console.log("Existing Admin updated successfully.");
    } else {
        await Admin.create({
            name: ADMIN_NAME,
            email: ADMIN_EMAIL.toLowerCase(),
            mobile: ADMIN_MOBILE,
            password: ADMIN_PASSWORD,
            adminType: "superadmin"
        });

        console.log("Admin created successfully!");
    }

    await mongoose.connection.close();
    process.exit(0);
};

run().catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
});