const express = require("express");
const router = express.Router();
const { createClerkClient } = require("@clerk/backend");
const User = require("../models/User");
const RecommendationRequest = require("../models/RecommendationRequest");

const {
  verifyTokenAndAdmin,
  verifyTokenAndAuthorization,
} = require("../middleware/verifyToken");

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
      .select("-password")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await User.countDocuments();

    res.status(200).json({
      users,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalUsers: total,
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
          year: { $year: "$createdAt" },
        },
      },
      {
        $group: {
          _id: {
            month: "$month",
            year: "$year",
          },
          total: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
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

// ADMIN ANALYTICS ENDPOINTS

// Get popular appliances from recommendation data
router.get("/analytics/appliances", verifyTokenAndAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // Get popular appliances with user details
    const popularAppliances = await User.aggregate([
      { $match: { recommendationHistory: { $exists: true, $ne: [] } } },
      { $unwind: "$recommendationHistory" },
      { $unwind: "$recommendationHistory.appliances" },
      {
        $group: {
          _id: "$recommendationHistory.appliances.nameOfItem",
          totalRequests: { $sum: 1 },
          averageWattage: { $avg: "$recommendationHistory.appliances.wattage" },
          totalQuantity: { $sum: "$recommendationHistory.appliances.quantity" },
          maxWattage: { $max: "$recommendationHistory.appliances.wattage" },
          minWattage: { $min: "$recommendationHistory.appliances.wattage" },
          uniqueUsers: { $addToSet: "$_id" },
          userDetails: {
            $push: {
              userId: "$_id",
              username: "$username",
              email: "$email",
              wattage: "$recommendationHistory.appliances.wattage",
              quantity: "$recommendationHistory.appliances.quantity",
              requestedAt: "$recommendationHistory.requestedAt",
              requestId: "$recommendationHistory.requestId",
            },
          },
        },
      },
      {
        $project: {
          appliance: "$_id",
          totalRequests: 1,
          averageWattage: { $round: ["$averageWattage", 2] },
          totalQuantity: 1,
          maxWattage: 1,
          minWattage: 1,
          uniqueUsersCount: { $size: "$uniqueUsers" },
          userSubmissions: "$userDetails",
        },
      },
      { $sort: { totalRequests: -1 } },
      { $skip: skip },
      { $limit: limit },
    ]);

    // Total appliances count in the entire system
    const totalAppliancesInSystem = await User.aggregate([
      { $match: { recommendationHistory: { $exists: true, $ne: [] } } },
      { $unwind: "$recommendationHistory" },
      { $unwind: "$recommendationHistory.appliances" },
      {
        $group: {
          _id: null,
          totalApplianceInstances: {
            $sum: "$recommendationHistory.appliances.quantity",
          },
          totalApplianceSubmissions: { $sum: 1 },
          uniqueApplianceTypes: {
            $addToSet: "$recommendationHistory.appliances.nameOfItem",
          },
        },
      },
      {
        $project: {
          totalApplianceInstances: 1,
          totalApplianceSubmissions: 1,
          uniqueApplianceTypes: { $size: "$uniqueApplianceTypes" },
        },
      },
    ]);

    // User-specific appliance summary
    const userApplianceSummary = await User.aggregate([
      { $match: { recommendationHistory: { $exists: true, $ne: [] } } },
      { $unwind: "$recommendationHistory" },
      { $unwind: "$recommendationHistory.appliances" },
      {
        $group: {
          _id: "$_id",
          username: { $first: "$username" },
          email: { $first: "$email" },
          totalAppliancesSubmitted: {
            $sum: "$recommendationHistory.appliances.quantity",
          },
          uniqueApplianceTypes: {
            $addToSet: "$recommendationHistory.appliances.nameOfItem",
          },
          totalWattageSubmitted: {
            $sum: {
              $multiply: [
                "$recommendationHistory.appliances.wattage",
                "$recommendationHistory.appliances.quantity",
              ],
            },
          },
          appliancesList: {
            $push: {
              name: "$recommendationHistory.appliances.nameOfItem",
              wattage: "$recommendationHistory.appliances.wattage",
              quantity: "$recommendationHistory.appliances.quantity",
              submittedAt: "$recommendationHistory.requestedAt",
            },
          },
        },
      },
      {
        $project: {
          username: 1,
          email: 1,
          totalAppliancesSubmitted: 1,
          uniqueApplianceTypesCount: { $size: "$uniqueApplianceTypes" },
          uniqueApplianceTypes: "$uniqueApplianceTypes",
          totalWattageSubmitted: 1,
          appliancesWithDetails: "$appliancesList",
        },
      },
      { $sort: { totalAppliancesSubmitted: -1 } },
    ]);

    res.status(200).json({
      success: true,
      appliances: popularAppliances,
      systemOverview: {
        totalAppliancesInSystem: totalAppliancesInSystem[0] || {
          totalApplianceInstances: 0,
          totalApplianceSubmissions: 0,
          uniqueApplianceTypes: 0,
        },
        totalUsers: userApplianceSummary.length,
      },
      userApplianceSummary: userApplianceSummary,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(popularAppliances.length / limit),
        itemsPerPage: limit,
      },
    });
  } catch (error) {
    console.error("Get appliances analytics error:", error);
    res.status(500).json({ error: "Unable to retrieve appliance analytics" });
  }
});

// Update the dashboard to remove Item dependencies
router.get("/analytics/dashboard", verifyTokenAndAdmin, async (req, res) => {
  try {
    // System overview
    const totalUsers = await User.countDocuments();
    const verifiedUsers = await User.countDocuments({ isVerified: true });
    const activeUsers = await User.countDocuments({ isActive: true });

    // Auth method distribution
    const authMethodStats = await User.aggregate([
      {
        $group: {
          _id: "$authMethod",
          count: { $sum: 1 },
        },
      },
    ]);

    // Recent activity (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentUsers = await User.countDocuments({
      createdAt: { $gte: thirtyDaysAgo },
    });

    // Total recommendation requests
    const totalRecommendationRequests = await User.aggregate([
      { $unwind: "$recommendationHistory" },
      { $count: "total" },
    ]);

    // Recent recommendation requests (last 30 days)
    const recentRecommendations = await User.aggregate([
      { $unwind: "$recommendationHistory" },
      {
        $match: {
          "recommendationHistory.requestedAt": { $gte: thirtyDaysAgo },
        },
      },
      { $count: "total" },
    ]);

    // Total unique appliances requested
    const totalAppliances = await User.aggregate([
      { $unwind: "$recommendationHistory" },
      { $unwind: "$recommendationHistory.appliances" },
      {
        $group: {
          _id: "$recommendationHistory.appliances.nameOfItem",
        },
      },
      { $count: "total" },
    ]);

    res.status(200).json({
      success: true,
      systemOverview: {
        totalUsers,
        verifiedUsers,
        activeUsers,
        totalRecommendationRequests: totalRecommendationRequests[0]?.total || 0,
        totalUniqueAppliances: totalAppliances[0]?.total || 0,
        verificationRate:
          totalUsers > 0 ? ((verifiedUsers / totalUsers) * 100).toFixed(1) : 0,
      },
      authMethodDistribution: authMethodStats,
      recentActivity: {
        newUsersLast30Days: recentUsers,
        recommendationRequestsLast30Days: recentRecommendations[0]?.total || 0,
      },
      generatedAt: new Date(),
    });
  } catch (error) {
    console.error("Get dashboard analytics error:", error);
    res.status(500).json({ error: "Unable to retrieve dashboard analytics" });
  }
});

// Get all recommendation requests across the system
router.get(
  "/analytics/recommendations",
  verifyTokenAndAdmin,
  async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const skip = (page - 1) * limit;

      // Get detailed recommendation data
      const detailedRecommendations = await User.aggregate([
        { $match: { recommendationHistory: { $exists: true, $ne: [] } } },
        { $unwind: "$recommendationHistory" },
        {
          $project: {
            userId: "$_id",
            userInfo: {
              username: "$username",
              email: "$email",
              authMethod: "$authMethod",
              isVerified: "$isVerified",
            },
            recommendationDetails: {
              requestId: "$recommendationHistory.requestId",
              requestedAt: "$recommendationHistory.requestedAt",
              totalWattage: "$recommendationHistory.totalWattage",
              dailyConsumption: "$recommendationHistory.dailyConsumption",
              processingTime: "$recommendationHistory.processingTime",
              aiModel: "$recommendationHistory.aiModel",
            },
            location: "$recommendationHistory.location",
            solarConditions: "$recommendationHistory.solarConditions",
            triggeringAppliances: {
              applianceCount: { $size: "$recommendationHistory.appliances" },
              appliances: "$recommendationHistory.appliances",
              totalApplianceWattage: {
                $reduce: {
                  input: "$recommendationHistory.appliances",
                  initialValue: 0,
                  in: {
                    $add: [
                      "$$value",
                      { $multiply: ["$$this.wattage", "$$this.quantity"] },
                    ],
                  },
                },
              },
            },
          },
        },
        { $sort: { "recommendationDetails.requestedAt": -1 } },
        { $skip: skip },
        { $limit: limit },
      ]);

      // Recommendation statistics
      const recommendationStats = await User.aggregate([
        { $match: { recommendationHistory: { $exists: true, $ne: [] } } },
        { $unwind: "$recommendationHistory" },
        {
          $group: {
            _id: null,
            totalRequests: { $sum: 1 },
            averageWattage: { $avg: "$recommendationHistory.totalWattage" },
            maxWattage: { $max: "$recommendationHistory.totalWattage" },
            minWattage: { $min: "$recommendationHistory.totalWattage" },
            averageProcessingTime: {
              $avg: "$recommendationHistory.processingTime",
            },
            averageAppliancesPerRequest: {
              $avg: { $size: "$recommendationHistory.appliances" },
            },
            totalAppliancesProcessed: {
              $sum: { $size: "$recommendationHistory.appliances" },
            },
          },
        },
        {
          $project: {
            totalRequests: 1,
            averageWattage: { $round: ["$averageWattage", 2] },
            maxWattage: 1,
            minWattage: 1,
            averageProcessingTime: { $round: ["$averageProcessingTime", 2] },
            averageAppliancesPerRequest: {
              $round: ["$averageAppliancesPerRequest", 2],
            },
            totalAppliancesProcessed: 1,
          },
        },
      ]);

      // Time-based analytics
      const timeBasedAnalytics = await User.aggregate([
        { $match: { recommendationHistory: { $exists: true, $ne: [] } } },
        { $unwind: "$recommendationHistory" },
        {
          $group: {
            _id: {
              year: { $year: "$recommendationHistory.requestedAt" },
              month: { $month: "$recommendationHistory.requestedAt" },
              day: { $dayOfMonth: "$recommendationHistory.requestedAt" },
            },
            requestsCount: { $sum: 1 },
            averageWattage: { $avg: "$recommendationHistory.totalWattage" },
            uniqueUsers: { $addToSet: "$_id" },
          },
        },
        {
          $project: {
            date: "$_id",
            requestsCount: 1,
            averageWattage: { $round: ["$averageWattage", 2] },
            uniqueUsersCount: { $size: "$uniqueUsers" },
          },
        },
        { $sort: { "_id.year": -1, "_id.month": -1, "_id.day": -1 } },
        { $limit: 30 }, // Last 30 days
      ]);

      // Popular locations with request times
      const locationAnalytics = await User.aggregate([
        { $match: { recommendationHistory: { $exists: true, $ne: [] } } },
        { $unwind: "$recommendationHistory" },
        {
          $group: {
            _id: "$recommendationHistory.location.city",
            requestCount: { $sum: 1 },
            region: { $first: "$recommendationHistory.location.region" },
            country: { $first: "$recommendationHistory.location.country" },
            averageWattage: { $avg: "$recommendationHistory.totalWattage" },
            uniqueUsers: { $addToSet: "$_id" },
            recentRequests: {
              $push: {
                requestedAt: "$recommendationHistory.requestedAt",
                username: "$username",
                totalWattage: "$recommendationHistory.totalWattage",
              },
            },
          },
        },
        {
          $project: {
            city: "$_id",
            requestCount: 1,
            region: 1,
            country: 1,
            averageWattage: { $round: ["$averageWattage", 2] },
            uniqueUsersCount: { $size: "$uniqueUsers" },
            recentRequests: { $slice: ["$recentRequests", -5] }, // Last 5 requests
          },
        },
        { $sort: { requestCount: -1 } },
        { $limit: 10 },
      ]);

      const totalRecommendations = await User.aggregate([
        { $match: { recommendationHistory: { $exists: true, $ne: [] } } },
        { $unwind: "$recommendationHistory" },
        { $count: "total" },
      ]);

      res.status(200).json({
        success: true,
        recommendations: detailedRecommendations,
        analytics: {
          overview: recommendationStats[0] || {},
          timeBasedTrends: timeBasedAnalytics,
          locationAnalytics: locationAnalytics,
        },
        pagination: {
          currentPage: page,
          totalPages: Math.ceil((totalRecommendations[0]?.total || 0) / limit),
          totalRecommendations: totalRecommendations[0]?.total || 0,
          recommendationsPerPage: limit,
        },
      });
    } catch (error) {
      console.error("Get recommendations analytics error:", error);
      res
        .status(500)
        .json({ error: "Unable to retrieve recommendation analytics" });
    }
  }
);

// User activity analytics
router.get(
  "/analytics/users-activity",
  verifyTokenAndAdmin,
  async (req, res) => {
    try {
      // User registration trends (last 12 months)
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

      const userTrends = await User.aggregate([
        { $match: { createdAt: { $gte: twelveMonthsAgo } } },
        {
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              month: { $month: "$createdAt" },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ]);

      // Most active users (by recommendation requests)
      const mostActiveUsers = await User.aggregate([
        {
          $project: {
            username: 1,
            email: 1,
            authMethod: 1,
            recommendationCount: { $size: "$recommendationHistory" },
            lastLogin: 1,
            createdAt: 1,
          },
        },
        { $sort: { recommendationCount: -1 } },
        { $limit: 10 },
      ]);

      // Users by verification status
      const verificationStats = await User.aggregate([
        {
          $group: {
            _id: "$isVerified",
            count: { $sum: 1 },
          },
        },
      ]);

      res.status(200).json({
        success: true,
        userRegistrationTrends: userTrends,
        mostActiveUsers,
        verificationStatus: verificationStats,
        generatedAt: new Date(),
      });
    } catch (error) {
      console.error("Get user activity analytics error:", error);
      res
        .status(500)
        .json({ error: "Unable to retrieve user activity analytics" });
    }
  }
);

module.exports = router;
