require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Admin = require("../models/admin.model");

const ADMIN_NAME = process.env.SEED_ADMIN_NAME || "Super Admin";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || "admin@gmail.com";
const ADMIN_MOBILE = process.env.SEED_ADMIN_MOBILE || "9876543210";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "Admin@123";

const run = async () => {
    await connectDB();

    const existing = await Admin.findOne({
        $or: [
            { email: ADMIN_EMAIL.toLowerCase() },
            { mobile: ADMIN_MOBILE }
        ]
    });

    if (existing) {
        console.log("Admin already exists. Nothing to do.");
    } else {
        await Admin.create({
            name: ADMIN_NAME,
            email: ADMIN_EMAIL.toLowerCase(),
            mobile: ADMIN_MOBILE,
            password: ADMIN_PASSWORD
        });

        console.log("Admin created successfully!");
        console.log(`Name: ${ADMIN_NAME}`);
        console.log(`Email: ${ADMIN_EMAIL}`);
        console.log(`Mobile: ${ADMIN_MOBILE}`);
    }

    await mongoose.connection.close();
    process.exit(0);
};

run().catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
});