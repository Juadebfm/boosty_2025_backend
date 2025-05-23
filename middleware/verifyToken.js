const { clerkClient } = require('@clerk/backend');
const User = require('../models/User');

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: "You are not authenticated" });
  }

  const token = authHeader.split(" ")[1];

  try {
    // Verify Clerk token
    const session = await clerkClient.verifyToken(token);
    
    // Find user in database
    const user = await User.findOne({ clerkId: session.sub });
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    req.user = {
      id: user._id,
      isAdmin: user.isAdmin,
      clerkId: user.clerkId
    };
    
    next();
  } catch (error) {
    return res.status(403).json({ message: "Token is invalid / has expired" });
  }
};

const verifyTokenAndAuthorization = (req, res, next) => {
  verifyToken(req, res, () => {
    if (req.user.id.toString() === req.params.id || req.user.isAdmin) {
      next();
    } else {
      res.status(403).json({ message: "You can't perform this action" });
    }
  });
};

const verifyTokenAndAdmin = (req, res, next) => {
  verifyToken(req, res, () => {
    if (req.user.isAdmin) {
      next();
    } else {
      res.status(403).json({ message: "You're Not Authorized To Perform This Operation" });
    }
  });
};

module.exports = {
  verifyToken,
  verifyTokenAndAuthorization,
  verifyTokenAndAdmin,
};