const mongoose = require("mongoose");

const RecommendationRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    requestId: {
      type: String,
      required: true,
      unique: true,
    },

    // Power Requirements
    totalWattage: {
      type: Number,
      required: true,
    },
    dailyConsumption: {
      type: String,
      required: true,
    },

    // Appliances
    appliances: [
      {
        nameOfItem: { type: String, required: true },
        quantity: { type: Number, required: true },
        wattage: { type: Number, required: true },
        dayHours: { type: Number, required: true },
        nightHours: { type: Number, required: true },
      },
    ],

    // Location & Solar Data
    location: {
      city: String,
      region: String,
      country: String,
      lat: Number,
      lon: Number,
    },
    solarConditions: {
      averageSunlightHours: Number,
      cloudCover: Number,
      humidity: Number,
    },

    // AI Processing
    aiModel: {
      type: String,
      default: "claude-3-5-sonnet",
    },
    processingTime: Number,

    // Generated Recommendations 
    recommendations: [
      {
        tier: {
          type: String,
          required: true,
        },
        description: String,

        // Equipment Summary
        equipment: {
          panels: String,
          battery: String,
          inverter: String,
          warranty: String,
        },

        // Pricing
        totalAmount: {
          type: Number,
          required: true,
        },
        breakdown: {
          equipment: Number,
          vat: Number,
          installation: Number,
        },

        // Performance
        dailyConsumption: String,
        benefits: [String],
        suitability: String,

        // User choice tracking
        isSelected: {
          type: Boolean,
          default: false,
        },
      },
    ],

    // Status
    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "completed",
    },
  },
  {
    timestamps: true,
    indexes: [
      { userId: 1, createdAt: -1 },
      { "appliances.nameOfItem": 1 },
      { "location.city": 1 },
      { totalWattage: 1 },
    ],
  }
);

module.exports = mongoose.model(
  "RecommendationRequest",
  RecommendationRequestSchema
);
