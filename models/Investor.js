const mongoose = require("mongoose");

const InvestorSchema = new mongoose.Schema(
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
        investmentInterestArea: {
            type: String,
            required: true,
        },
        isAdmin: {
            type: Boolean,
            default: false,
        },
    },
    {timestamps: true}
);

module.exports = mongoose.model("Investor", InvestorSchema);
 