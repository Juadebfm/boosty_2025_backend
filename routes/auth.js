const express = require("express");
const router = express.Router();
const { createClerkClient } = require("@clerk/backend");
const User = require("../models/User");
const { verifyToken } = require("../middleware/verifyToken");
const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});


// User Sync Route
router.post('/sync', verifyToken, async (req, res) => {
  const { id, email, username, password } = req.body;
  
  try {
    // Ensure the authenticated user is syncing their own account
    if (req.user.id !== id) {
      return res.status(403).json({ error: 'Unauthorized sync attempt' });
    }

    // Get Clerk user verification status
    const clerkUser = await clerk.users.getUser(id);
    const isEmailVerified = clerkUser.emailAddresses.find(
      email => email.id === clerkUser.primaryEmailAddressId
    ).verification.status === "verified";


    const user = await User.findOneAndUpdate(
      { clerkId: id },
      { 
        email, 
        username, 
        isVerified: isEmailVerified 
      },
      { upsert: true, new: true }
    );
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ error: 'Sync failed' });
  }
});

// Grant Admin Permission (Optional)
router.put('/admin', verifyToken, async (req, res) => {
  const { userId, isAdmin } = req.body;

  // Only allow current admin to grant admin permissions
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    const updatedUser = await User.findOneAndUpdate(
      { clerkId: userId },
      { isAdmin: isAdmin },
      { new: true }
    );

    res.status(200).json(updatedUser);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update admin status' });
  }
});



module.exports = router;