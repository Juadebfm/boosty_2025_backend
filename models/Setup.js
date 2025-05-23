const mongoose = require("mongoose");

const SetupSchema = new mongoose.Schema(
    {
        type: {
            type: String,
            required: true,
            enum: ['business', 'home'],
        },
        address: {
            type: String,
            required: true,
        },
        budget: {
            type: Number,
            required: true,
        },
    },
    {timestamps: true}
);

module.exports = mongoose.model("Setup", SetupSchema);