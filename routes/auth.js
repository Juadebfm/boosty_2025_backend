const express = require("express");
const router = express.Router();
const { createClerkClient } = require("@clerk/backend");
const crypto = require("crypto");
const User = require("../models/User");
const {
  verifyToken,
  verifyClerkToken,
  verifyTraditionalToken,
  generateJWTToken,
} = require("../middleware/verifyToken");
const { sendVerificationEmail } = require("../services/emailServices");

const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

// Traditional User Registration
router.post("/register", async (req, res) => {
  try {
    const { username, email, password, firstName, lastName } = req.body;

    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({
        error: "Username, email, and password are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: "Password must be at least 6 characters long",
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { username: username }],
    });

    if (existingUser) {
      if (existingUser.email === email.toLowerCase()) {
        return res.status(400).json({ error: "Email already registered" });
      }
      if (existingUser.username === username) {
        return res.status(400).json({ error: "Username already taken" });
      }
    }

    // Generate email verification token
    const emailVerificationToken = crypto.randomBytes(32).toString("hex");
    const emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Create new user
    const user = new User({
      username,
      email: email.toLowerCase(),
      password,
      firstName,
      lastName,
      authMethod: "traditional",
      emailVerificationToken,
      emailVerificationExpires,
      isVerified: false,
    });

    await user.save();

    // Generate JWT token
    const token = generateJWTToken(user._id);

    // Send verification email here
    try {
      await sendVerificationEmail(user.email, emailVerificationToken);
      console.log("Verification email sent to:", user.email);
    } catch (emailError) {
      console.error("Email sending failed:", emailError);
      // Don't fail registration if email fails
    }

    res.status(201).json({
      success: true,
      message:
        "User registered successfully. Please check your email for verification.",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        authMethod: user.authMethod,
        isVerified: user.isVerified,
      },
      token,
      tokenType: "jwt",
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Registration failed" });
  }
});

// Traditional User Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Check if user can use traditional auth
    if (!user.canUseTraditionalAuth()) {
      return res.status(400).json({
        error: "Please login using your social account (Google, GitHub, etc.)",
        authMethod: user.authMethod,
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(403).json({ error: "Account is deactivated" });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT token
    const token = generateJWTToken(user._id);

    res.status(200).json({
      success: true,
      message: "Login successful",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        authMethod: user.authMethod,
        isVerified: user.isVerified,
        isAdmin: user.isAdmin,
      },
      token,
      tokenType: "jwt",
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

// Email Verification
router.post("/verify-email", async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: "Verification token is required" });
    }

    // Find user with valid verification token
    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: new Date() },
    });

    if (!user) {
      return res
        .status(400)
        .json({ error: "Invalid or expired verification token" });
    }

    // Update user as verified
    user.isVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Email verified successfully",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        isVerified: user.isVerified,
      },
    });
  } catch (error) {
    console.error("Email verification error:", error);
    res.status(500).json({ error: "Email verification failed" });
  }
});

// Resend Email Verification
router.post(
  "/resend-verification",
  verifyTraditionalToken,
  async (req, res) => {
    try {
      const user = await User.findById(req.user.id);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (user.isVerified) {
        return res.status(400).json({ error: "Email is already verified" });
      }

      // Generate new verification token
      const emailVerificationToken = crypto.randomBytes(32).toString("hex");
      const emailVerificationExpires = new Date(
        Date.now() + 24 * 60 * 60 * 1000
      );

      user.emailVerificationToken = emailVerificationToken;
      user.emailVerificationExpires = emailVerificationExpires;
      await user.save();

      // Send verification email
      try {
        await sendVerificationEmail(user.email, emailVerificationToken);
      } catch (emailError) {
        console.error("Email sending failed:", emailError);
        return res
          .status(500)
          .json({ error: "Failed to send verification email" });
      }

      res.status(200).json({
        success: true,
        message: "Verification email sent successfully",
      });
    } catch (error) {
      console.error("Resend verification error:", error);
      res.status(500).json({ error: "Failed to resend verification email" });
    }
  }
);

// Fix for options
router.options("/clerk-sync", (req, res) => {
  res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-clerk-auth-token"
  );
  res.header("Access-Control-Allow-Credentials", "true");
  res.sendStatus(200);
});

// Clerk User Sync (Enhanced)
router.post("/clerk-sync", verifyClerkToken, async (req, res) => {
  try {
    const { email, username, firstName, lastName } = req.body;

    // Get Clerk user details
    const clerkUser = await clerk.users.getUser(req.user.clerkId);
    const isEmailVerified =
      clerkUser.emailAddresses.find(
        (emailAddr) => emailAddr.id === clerkUser.primaryEmailAddressId
      ).verification.status === "verified";

    // Check if user already exists with this email (traditional user)
    const existingUser = await User.findOne({
      email: email.toLowerCase(),
      clerkId: { $exists: false },
    });

    if (existingUser) {
      // Link existing traditional account with Clerk
      existingUser.clerkId = req.user.clerkId;
      existingUser.authMethod = "both";
      existingUser.isVerified = isEmailVerified;
      existingUser.firstName = firstName || existingUser.firstName;
      existingUser.lastName = lastName || existingUser.lastName;
      await existingUser.save();

      return res.status(200).json({
        success: true,
        message: "Accounts linked successfully",
        user: existingUser,
        accountLinked: true,
      });
    }

    // Create or update Clerk user
    const user = await User.findOneAndUpdate(
      { clerkId: req.user.clerkId },
      {
        email: email.toLowerCase(),
        username,
        firstName,
        lastName,
        authMethod: "clerk",
        isVerified: isEmailVerified,
      },
      { upsert: true, new: true }
    );

    res.status(200).json({
      success: true,
      message: "Clerk user synced successfully",
      user,
      accountLinked: false,
    });
  } catch (error) {
    console.error("Clerk sync error:", error);
    res.status(500).json({ error: "Clerk sync failed" });
  }
});

// Get Current User (Works with both auth methods)
router.get("/me", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        authMethod: user.authMethod,
        isVerified: user.isVerified,
        isAdmin: user.isAdmin,
        isActive: user.isActive,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
      },
      tokenType: req.user.tokenType,
    });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ error: "Failed to get user information" });
  }
});

// Logout
router.post("/logout", verifyToken, async (req, res) => {
  try {
    // For JWT tokens, we rely on client-side token removal
    // For Clerk tokens, we could optionally revoke the session

    res.status(200).json({
      success: true,
      message: "Logged out successfully",
      instructions: "Please remove the token from client storage",
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ error: "Logout failed" });
  }
});

// Grant Admin Permission
router.put("/admin", verifyToken, async (req, res) => {
  const { userId, isAdmin } = req.body;

  // Only allow current admin to grant admin permissions
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  try {
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { isAdmin: isAdmin },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(200).json({
      success: true,
      message: `Admin status ${isAdmin ? "granted" : "revoked"} successfully`,
      user: updatedUser,
    });
  } catch (error) {
    console.error("Admin update error:", error);
    res.status(500).json({ error: "Failed to update admin status" });
  }
});

module.exports = router;
