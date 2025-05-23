const mongoose = require("mongoose");

const AddressSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true 
  },
  street: { 
    type: String, 
    required: true 
  },
  area: { 
    type: String, 
    required: true 
  },
  city: { 
    type: String, 
    required: true 
  },
  zipCode: { 
    type: String, 
    required: true 
  }
});

const OrderSchema = new mongoose.Schema({
  items: [{
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Item",
      required: true,
    },
    quantity: {
      type: Number,
      default: 1,
    },
    warranty: {
      type: Number,
      default: 3
    }
  }],
  itemsAndInstallation: {
    type: Number,
    required: true,
  },
  vat: {
    type: Number,
    required: true,
  },
  totalAmount: {
    type: Number,
    required: true,
  },
  address: {
    type: AddressSchema,
    required: true
  },
  paymentMethod: {
    type: String,
    enum: ['visa', 'pay-small-small'],
    required: true
  },
  paymentDetails: {
    cardLastFour: String,
  },
  installationSchedule: {
    earliestDate: Date,
    maxDuration: String
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'installing', 'completed', 'cancelled'],
    default: "pending",
  }
}, { timestamps: true });

module.exports = mongoose.model("Order", OrderSchema);