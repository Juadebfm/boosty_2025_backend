const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const UserSchema = new mongoose.Schema(
  {
    // Clerk id- for OAuth/SSO users)
    clerkId: {
      type: String,
      unique: true,
      sparse: true,
    },

    // Traditional Authentication
    password: {
      type: String,
      minlength: 6,
    },

    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    firstName: {
      type: String,
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
    },

    // Authentication Method Tracking
    authMethod: {
      type: String,
      enum: ["clerk", "traditional", "both"],
      required: true,
      default: "traditional",
    },

    // Verification Status
    isVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: {
      type: String,
    },
    emailVerificationExpires: {
      type: Date,
    },

    passwordResetToken: {
      type: String,
    },
    passwordResetExpires: {
      type: Date,
    },

    // User Permissions
    isAdmin: {
      type: Boolean,
      default: false,
    },

    // Account Status
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
    },
  },
  {
    timestamps: true,
    indexes: [{ email: 1 }, { clerkId: 1 }, { username: 1 }, { authMethod: 1 }],
  }
);

// Validation: Ensure either clerkId OR password exists
UserSchema.pre("validate", function (next) {
  // If it's a Clerk user, clerkId is required
  if (this.authMethod === "clerk" && !this.clerkId) {
    this.invalidate("clerkId", "clerkId is required for Clerk authentication");
  }

  // If it's a traditional user, password is required
  if (this.authMethod === "traditional" && !this.password) {
    this.invalidate(
      "password",
      "Password is required for traditional authentication"
    );
  }

  // If it's both, both should exist
  if (this.authMethod === "both" && (!this.clerkId || !this.password)) {
    this.invalidate(
      "authMethod",
      "Both clerkId and password required for hybrid authentication"
    );
  }

  next();
});

// Hash password before saving (only for traditional auth)
UserSchema.pre("save", async function (next) {
  // Only hash password if it's modified and user uses traditional auth
  if (!this.isModified("password") || this.authMethod === "clerk") {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare passwords (for traditional auth)
UserSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) {
    throw new Error("User does not have a password set");
  }
  return bcrypt.compare(candidatePassword, this.password);
};

// Method to check if user can use traditional auth
UserSchema.methods.canUseTraditionalAuth = function () {
  return this.authMethod === "traditional" || this.authMethod === "both";
};

// Method to check if user can use Clerk auth
UserSchema.methods.canUseClerkAuth = function () {
  return this.authMethod === "clerk" || this.authMethod === "both";
};

// Static method to find user by email or clerkId
UserSchema.statics.findByEmailOrClerkId = function (email, clerkId) {
  const query = {};
  if (email) query.email = email;
  if (clerkId) query.clerkId = clerkId;

  return this.findOne({
    $or: [{ email: email }, { clerkId: clerkId }],
  });
};

// Virtual for full name
UserSchema.virtual("fullName").get(function () {
  if (this.firstName && this.lastName) {
    return `${this.firstName} ${this.lastName}`;
  }
  return this.username;
});

// Ensure virtual fields are serialized
UserSchema.set("toJSON", {
  virtuals: true,
  transform: function (doc, ret) {
    // Remove sensitive fields from JSON output
    delete ret.password;
    delete ret.passwordResetToken;
    delete ret.emailVerificationToken;
    return ret;
  },
});

module.exports = mongoose.model("User", UserSchema);
