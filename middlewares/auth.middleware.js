const jwt = require("jsonwebtoken");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");

const User = require("../models/user.model");
const Admin = require("../models/admin.model");

const protect = asyncHandler(async(req,res,next)=>{
    let token;

    const authHeader = req.headers.authorization;

    if(authHeader && authHeader.startsWith("Bearer ")){
        token = authHeader.split(" ")[1];
    }

    if(!token){
        throw new AppError(
            "Not authorized, no token provided",
            401
        );
    }

    let decoded;

    try{
        decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );
    }catch(error){
        throw new AppError(
            "Not authorized, invalid or expired token",
            401
        );
    }

    let user;

    if(decoded.role === "admin"){
        user = await Admin.findById(decoded.id);
    }else{
        user = await User.findById(decoded.id);
    }

    if(!user){
        throw new AppError(
            "Not authorized, user no longer exists",
            401
        );
    }

    if(user.status !== "active"){
        throw new AppError(
            "Account is inactive",
            403
        );
    }

    req.user = user;

    next();
});

module.exports = {
    protect
};