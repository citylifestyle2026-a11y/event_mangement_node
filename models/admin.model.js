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

    status:{
        type:String,
        enum:["active","inactive"],
        default:"active"
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