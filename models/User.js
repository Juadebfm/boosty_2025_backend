const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    clerkId: {
      type: String,
      required: true,
      unique: true,
      immutable: true
    },
    username: {
      type: String,
      required: true,
      unique: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    isAdmin: {
      type: Boolean,
      default: false
    },
    isVerified: {
      type: Boolean,
      default: false
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);