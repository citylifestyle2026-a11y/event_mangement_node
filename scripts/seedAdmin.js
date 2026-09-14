require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Admin = require("../models/admin.model");

const ADMIN_NAME = process.env.SEED_ADMIN_NAME || "City LifeStyle ";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || "citylifestyle@gmail.com";
const ADMIN_MOBILE = process.env.SEED_ADMIN_MOBILE || "9876543210";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "citylifestyle123";

const run = async () => {
    await connectDB();

    const existing = await Admin.findOne({
        $or: [
            { email: ADMIN_EMAIL.toLowerCase() },
            { mobile: ADMIN_MOBILE }
        ]
    });

    if (existing) {
        // This account is the main CityLifestyle Super Admin identity by
        // definition (matched on the seed email/mobile above). If it was
        // created before `adminType` existed, or somehow isn't marked as
        // "superadmin" yet, promote it now. Only `adminType` is touched —
        // name/email/mobile/password/role/status are left exactly as-is.
        if (existing.adminType !== "superadmin") {
            existing.adminType = "superadmin";
            await existing.save();
            console.log("Existing Admin found and marked as superadmin.");
        } else {
            console.log("Admin already exists. Nothing to do.");
        }
    } else {
        await Admin.create({
            name: ADMIN_NAME,
            email: ADMIN_EMAIL.toLowerCase(),
            mobile: ADMIN_MOBILE,
            password: ADMIN_PASSWORD,
            adminType: "superadmin"
        });

        console.log("Admin created successfully!");
        console.log(`Name: ${ADMIN_NAME}`);
        console.log(`Email: ${ADMIN_EMAIL}`);
        console.log(`Mobile: ${ADMIN_MOBILE}`);
        console.log("Admin Type: superadmin");
    }

    await mongoose.connection.close();
    process.exit(0);
};

run().catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
});