const express = require("express");
const router = express.Router();
const { createClerkClient } = require("@clerk/backend");
const User = require("../models/User");
const { verifyTokenAndAdmin, verifyTokenAndAuthorization } = require("../middleware/verifyToken");

const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});


// Get single user
router.get("/find/:id", verifyTokenAndAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const { ...userWithoutSensitiveData } = user._doc;
    res.status(200).json(userWithoutSensitiveData);
  } catch (error) {
    res.status(500).json({ error: "Unable to retrieve user" });
  }
});

// Get all users with pagination
router.get("/", verifyTokenAndAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const users = await User.find()
      .select('-password')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await User.countDocuments();

    res.status(200).json({
      users,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalUsers: total
    });
  } catch (error) {
    res.status(500).json({ error: "Unable to retrieve users" });
  }
});

// User stats
router.get("/stats", verifyTokenAndAdmin, async (req, res) => {
  try {
    const date = new Date();
    const pastYear = new Date(date.setFullYear(date.getFullYear() - 1));

    const data = await User.aggregate([
      { $match: { createdAt: { $gte: pastYear } } },
      {
        $project: {
          month: { $month: "$createdAt" },
          year: { $year: "$createdAt" }
        },
      },
      {
        $group: {
          _id: {
            month: "$month",
            year: "$year"
          },
          total: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);

    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: "Unable to retrieve user statistics" });
  }
});

// Delete user
router.delete("/:id", verifyTokenAndAuthorization, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    await clerk.users.deleteUser(user.clerkId);
    await User.findByIdAndDelete(req.params.id);

    res.status(200).json({ message: "User successfully deleted" });
  } catch (error) {
    res.status(500).json({ error: "Unable to delete user" });
  }
});

module.exports = router;