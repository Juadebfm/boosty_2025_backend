const express = require("express");
const jwt = require("jsonwebtoken");
const Investor = require("../models/Investor");
const {
  verifyToken,
  verifyTokenAndAdmin,
  verifyTokenAndAuthorization,
} = require("../middleware/verifyToken");

const router = express.Router();

// Create investor
router.post("/", async (req, res) => {
  try {
    const {
      businessEmail,
      firstName,
      lastName,
      companyName,
      investmentInterestArea,
    } = req.body;

    // Input validation
    if (
      !businessEmail ||
      !firstName ||
      !lastName ||
      !companyName ||
      !investmentInterestArea
    ) {
      return res.status(400).json({
        message:
          "All fields are required: businessEmail, firstName, lastName, companyName, investmentInterestArea",
        missingFields: {
          businessEmail: !businessEmail,
          firstName: !firstName,
          lastName: !lastName,
          companyName: !companyName,
          investmentInterestArea: !investmentInterestArea,
        },
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(businessEmail)) {
      return res.status(400).json({
        message: "Please provide a valid business email address",
      });
    }

    // Check if investor already exists
    const existingInvestor = await Investor.findOne({
      businessEmail: businessEmail.toLowerCase(),
    });
    if (existingInvestor) {
      return res.status(400).json({
        message: "An investor with this business email already exists",
      });
    }

    // Create investor with explicit fields
    const investorData = {
      businessEmail: businessEmail.toLowerCase().trim(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      companyName: companyName.trim(),
      investmentInterestArea: investmentInterestArea.trim(),
      // Explicitly set isAdmin to false
      isAdmin: false,
    };

    const investor = new Investor(investorData);
    const savedInvestor = await investor.save();

    // Generate access token for the investor (Fixed)
    const accessToken = jwt.sign(
      {
        id: savedInvestor._id,
        email: savedInvestor.businessEmail,
        type: "investor",
        isAdmin: savedInvestor.isAdmin,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Return success response without sensitive data
    res.status(201).json({
      success: true,
      message: "Investor registered successfully",
      investor: {
        id: savedInvestor._id,
        businessEmail: savedInvestor.businessEmail,
        firstName: savedInvestor.firstName,
        lastName: savedInvestor.lastName,
        companyName: savedInvestor.companyName,
        investmentInterestArea: savedInvestor.investmentInterestArea,
        isAdmin: savedInvestor.isAdmin,
        createdAt: savedInvestor.createdAt,
      },
      accessToken,
      tokenType: "Bearer",
    });
  } catch (error) {
    console.error("Investor registration error:", error);

    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        message: "Business email already registered",
      });
    }

    // Handle validation errors
    if (error.name === "ValidationError") {
      const validationErrors = Object.values(error.errors).map(
        (err) => err.message
      );
      return res.status(400).json({
        message: "Validation failed",
        errors: validationErrors,
      });
    }

    res.status(500).json({
      message: "Failed to register investor",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
});

// Investor login
router.post("/login", async (req, res) => {
  try {
    const { businessEmail } = req.body;

    if (!businessEmail) {
      return res.status(400).json({ message: "Business email is required" });
    }

    const investor = await Investor.findOne({
      businessEmail: businessEmail.toLowerCase(),
    });
    if (!investor) {
      return res.status(401).json({ message: "Investor not found" });
    }

    // Generate access token
    const accessToken = jwt.sign(
      {
        id: investor._id,
        email: investor.businessEmail,
        type: "investor",
        isAdmin: investor.isAdmin,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(200).json({
      success: true,
      message: "Login successful",
      investor: {
        id: investor._id,
        businessEmail: investor.businessEmail,
        firstName: investor.firstName,
        lastName: investor.lastName,
        companyName: investor.companyName,
        investmentInterestArea: investor.investmentInterestArea,
        isAdmin: investor.isAdmin,
      },
      accessToken,
      tokenType: "Bearer",
    });
  } catch (error) {
    console.error("Investor login error:", error);
    res.status(500).json({ message: "Login failed" });
  }
});

// Update investor by ID
router.put("/:id", verifyTokenAndAuthorization, async (req, res) => {
  try {
    const {
      businessEmail,
      firstName,
      lastName,
      companyName,
      investmentInterestArea,
    } = req.body;

    // Build update object
    const updateData = {};
    if (businessEmail)
      updateData.businessEmail = businessEmail.toLowerCase().trim();
    if (firstName) updateData.firstName = firstName.trim();
    if (lastName) updateData.lastName = lastName.trim();
    if (companyName) updateData.companyName = companyName.trim();
    if (investmentInterestArea)
      updateData.investmentInterestArea = investmentInterestArea.trim();

    const updatedInvestor = await Investor.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedInvestor) {
      return res.status(404).json({ message: "Investor not found" });
    }

    res.status(200).json({
      success: true,
      message: "Investor updated successfully",
      investor: updatedInvestor,
    });
  } catch (error) {
    console.error("Update investor error:", error);
    res.status(400).json({ message: "Failed to update investor" });
  }
});

// Get all investors
router.get("/", verifyTokenAndAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const isNew = req.query.new;

    let query = {};
    let investors;

    if (isNew) {
      investors = await Investor.find(query)
        .sort({ _id: -1 })
        .limit(5)
        .select("-__v");
    } else {
      investors = await Investor.find(query)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .select("-__v");
    }

    const total = await Investor.countDocuments(query);

    res.status(200).json({
      success: true,
      investors,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalInvestors: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error("Get investors error:", error);
    res.status(500).json({ message: "Failed to fetch investors" });
  }
});

// Get single investor by ID
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const investor = await Investor.findById(req.params.id).select("-__v");
    if (!investor) {
      return res.status(404).json({ message: "Investor not found" });
    }
    res.status(200).json({
      success: true,
      investor,
    });
  } catch (error) {
    console.error("Get investor error:", error);
    res.status(500).json({ message: "Failed to fetch investor" });
  }
});

// Delete investor by ID
router.delete("/:id", verifyTokenAndAuthorization, async (req, res) => {
  try {
    const deletedInvestor = await Investor.findByIdAndDelete(req.params.id);
    if (!deletedInvestor) {
      return res.status(404).json({ message: "Investor not found" });
    }
    res.status(200).json({
      success: true,
      message: "Investor deleted successfully",
    });
  } catch (error) {
    console.error("Delete investor error:", error);
    res.status(500).json({ message: "Failed to delete investor" });
  }
});

module.exports = router;
