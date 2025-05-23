const mongoose = require("mongoose");

const Itemschema = new mongoose.Schema(
    {
        nameOfItem: {
            type: String,
            required: true,
        },
        quantity: {
            type: Number,
            required: true,
        },
        dayHours: {
            type: Number,
            required: true,
        },
        nightHours: {
            type: Number,
            required: true,
        },
        wattage: {
            type: Number,
            required: true,
        },
    },
    {timestamps: true}
);


module.exports = mongoose.model("Item", Itemschema);