const { createClerkClient } = require("@clerk/backend");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Investor = require("../models/Investor");

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

//  Middleware that supports both Clerk and traditional JWT tokens
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: "You are not authenticated" });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Access token is missing" });
  }

  try {
    // Try to determine token type and verify accordingly
    let user = null;
    let tokenType = null;

    // First, try to verify as Clerk token
    try {
      const session = await clerkClient.verifyToken(token);
      user = await User.findOne({ clerkId: session.sub });
      tokenType = "clerk";

      if (user) {
        console.log("✅ Clerk token verified successfully");
      }
    } catch (clerkError) {
      // If Clerk verification fails, try traditional JWT
      console.log("🔄 Clerk verification failed, trying JWT...");

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Check if it's an investor or user token
        if (decoded.type === "investor") {
          user = await Investor.findById(decoded.id);
          tokenType = "jwt";

          if (user) {
            console.log("✅ JWT investor token verified successfully");
          }
        } else {
          // Default to user lookup for backward compatibility
          user = await User.findById(decoded.id);
          tokenType = "jwt";

          if (user) {
            console.log("✅ JWT user token verified successfully");
          }
        }
      } catch (jwtError) {
        console.log("❌ Both Clerk and JWT verification failed");
        return res.status(403).json({
          message: "Token is invalid or has expired",
          details: {
            clerkError: clerkError.message,
            jwtError: jwtError.message,
          },
        });
      }
    }

    // Check if user/investor exists in database
    if (!user) {
      return res.status(404).json({
        message: "User not found in database",
        tokenType: tokenType,
      });
    }

    // Handle investor-specific logic
    if (user.businessEmail) {
      // This indicates it's an investor
      // Attach investor info to request
      req.user = {
        id: user._id,
        email: user.businessEmail,
        firstName: user.firstName,
        lastName: user.lastName,
        isAdmin: user.isAdmin,
        userType: "investor",
        tokenType: tokenType,
      };

      return next();
    }

    // Handle user-specific logic (existing code)
    // Check if user account is active
    if (!user.isActive) {
      return res.status(403).json({ message: "Account is deactivated" });
    }

    // Verify user can use this auth method
    if (tokenType === "clerk" && !user.canUseClerkAuth()) {
      return res
        .status(403)
        .json({ message: "User cannot use Clerk authentication" });
    }

    if (tokenType === "jwt" && !user.canUseTraditionalAuth()) {
      return res
        .status(403)
        .json({ message: "User cannot use traditional authentication" });
    }

    // Update last login time
    await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });

    // Attach user info to request
    req.user = {
      id: user._id,
      clerkId: user.clerkId,
      email: user.email,
      username: user.username,
      isAdmin: user.isAdmin,
      isVerified: user.isVerified,
      authMethod: user.authMethod,
      userType: "user",
      tokenType: tokenType,
    };

    next();
  } catch (error) {
    console.error("Authentication error:", error);
    return res.status(500).json({
      message: "Authentication service error",
      error: error.message,
    });
  }
};

// Rest of your middleware functions remain the same...
const verifyTraditionalToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: "You are not authenticated" });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Access token is missing" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.canUseTraditionalAuth()) {
      return res
        .status(403)
        .json({ message: "User cannot use traditional authentication" });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: "Account is deactivated" });
    }

    req.user = {
      id: user._id,
      email: user.email,
      username: user.username,
      isAdmin: user.isAdmin,
      isVerified: user.isVerified,
      authMethod: user.authMethod,
      tokenType: "jwt",
    };

    next();
  } catch (error) {
    return res.status(403).json({ message: "Token is invalid or has expired" });
  }
};

const verifyClerkToken = async (req, res, next) => {
  if (req.method === "OPTIONS") {
    return next();
  }

  const clerkToken = req.headers["x-clerk-auth-token"];

  if (!clerkToken) {
    return res.status(401).json({ message: "Clerk token is missing" });
  }

  try {
    // ✅ CORRECT METHOD - Use verifyToken directly on clerkClient
    const { userId } = await clerkClient.verifyToken(clerkToken);

    if (!userId) {
      throw new Error("Invalid token - no userId found");
    }

    req.user = {
      clerkId: userId,
      tokenType: "clerk",
    };

    next();
  } catch (error) {
    console.error("Clerk token verification failed:", error);
    return res.status(403).json({
      message: "Clerk token is invalid or has expired",
      error: error.message,
    });
  }
};

// Authorization middleware
const verifyTokenAndAuthorization = (req, res, next) => {
  verifyToken(req, res, () => {
    if (req.user.id.toString() === req.params.id || req.user.isAdmin) {
      next();
    } else {
      res.status(403).json({ message: "You can't perform this action" });
    }
  });
};

// Admin middleware
const verifyTokenAndAdmin = (req, res, next) => {
  verifyToken(req, res, () => {
    if (req.user.isAdmin) {
      next();
    } else {
      res
        .status(403)
        .json({ message: "You're Not Authorized To Perform This Operation" });
    }
  });
};

// Email verification middleware
const requireEmailVerification = (req, res, next) => {
  if (!req.user.isVerified) {
    return res.status(403).json({
      message: "Email verification required",
      code: "EMAIL_NOT_VERIFIED",
    });
  }
  next();
};

// Utility function to generate JWT tokens
const generateJWTToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

module.exports = {
  verifyToken,
  verifyTraditionalToken,
  verifyClerkToken,
  verifyTokenAndAuthorization,
  verifyTokenAndAdmin,
  requireEmailVerification,
  generateJWTToken,
};
