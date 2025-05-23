const mongoose = require("mongoose");

const PartnerSchema = new mongoose.Schema(
    {
        businessEmail: {
            type: String,
            required: true,
            unique: true,
        },
        firstName: {
            type: String,
            required: true,
        },
        lastName: {
            type: String,
            required: true,
        },
        companyName: {
            type: String,
            required: true,
        },
        jobTitle: {
            type: String,
            required: true,
        },
        phoneNumber: {
            type: String,
            required: true,
        },
        whichOneAreYou: {
            type: String,
            required: true,
            enum: ['Manufacturer', 'Installer', 'Retailer/Distributor'],
        },
        isAdmin: {
            type: Boolean,
            default: false,
        },
    },
    {timestamps: true}
);

module.exports = mongoose.model("Partner", PartnerSchema);