const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");
const axios = require("axios");
const {
  verifyToken,
  requireEmailVerification,
  verifyTokenAndAdmin,
} = require("../middleware/verifyToken");
const User = require("../models/User");

const router = express.Router();

// Initialize Anthropic (Claude)
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Helper function to analyze usage patterns
const analyzeUsagePattern = (dayHours, nightHours) => {
  const totalHours = dayHours + nightHours;
  const dayPercentage = ((dayHours / totalHours) * 100).toFixed(1);
  const nightPercentage = ((nightHours / totalHours) * 100).toFixed(1);

  let pattern = "Balanced";
  if (dayHours > nightHours * 1.5) pattern = "Day-heavy";
  else if (nightHours > dayHours * 1.5) pattern = "Night-heavy";

  return {
    pattern,
    dayUsage: `${dayPercentage}%`,
    nightUsage: `${nightPercentage}%`,
    totalHours,
    recommendation:
      pattern === "Day-heavy"
        ? "Smaller battery capacity needed"
        : pattern === "Night-heavy"
        ? "Larger battery capacity recommended"
        : "Standard battery configuration suitable",
  };
};

// Helper function to get climate optimizations
const getClimateOptimizations = (location, solarData) => {
  const optimizations = [];

  if (solarData.humidity > 80) {
    optimizations.push("Anti-corrosion coating recommended for high humidity");
  }

  if (solarData.cloudCover > 60) {
    optimizations.push("Consider additional panels for frequent cloud cover");
  }

  if (location.city === "Lagos") {
    optimizations.push(
      "Marine-grade components recommended for coastal location"
    );
  }

  if (solarData.averageSunlightHours < 6) {
    optimizations.push("Enhanced battery storage for limited sunlight hours");
  }

  return optimizations.length > 0
    ? optimizations
    : ["Standard configuration suitable for location"];
};

// Get location data (you can use IP geolocation or user input)
const getLocationData = async (req) => {
  try {
    // Option 1: From user input
    if (req.body.location) {
      return req.body.location;
    }

    // Option 2: IP-based geolocation
    const ip = req.ip || req.connection.remoteAddress || "127.0.0.1";

    // Skip IP lookup for localhost
    if (ip === "127.0.0.1" || ip === "::1" || ip.includes("127.0.0.1")) {
      return {
        country: "Nigeria",
        region: "Lagos",
        city: "Lagos",
        lat: 6.5244,
        lon: 3.3792,
        timezone: "Africa/Lagos",
      };
    }

    const locationAPI = `http://ip-api.com/json/${ip}`;
    const response = await axios.get(locationAPI);

    return {
      country: response.data.country,
      region: response.data.regionName,
      city: response.data.city,
      lat: response.data.lat,
      lon: response.data.lon,
      timezone: response.data.timezone,
    };
  } catch (error) {
    console.error("Location detection failed:", error);
    return {
      country: "Nigeria",
      region: "Lagos",
      city: "Lagos",
      lat: 6.5244,
      lon: 3.3792,
      timezone: "Africa/Lagos",
    };
  }
};

// Get weather/solar data for the location
const getSolarData = async (location) => {
  try {
    // Option 1: Use WeatherAPI (more generous free tier)
    if (process.env.WEATHER_API_KEY && location.lat && location.lon) {
      const weatherAPI = `http://api.weatherapi.com/v1/current.json?key=${process.env.WEATHER_API_KEY}&q=${location.lat},${location.lon}`;
      const response = await axios.get(weatherAPI);

      return {
        averageSunlightHours: calculateSunlightHours(location.lat),
        cloudCover: response.data.current.cloud,
        humidity: response.data.current.humidity,
        temperature: response.data.current.temp_c,
      };
    }

    // Option 2: Static mapping based on Nigerian cities
    const cityWeatherData = {
      Lagos: { averageSunlightHours: 5.5, cloudCover: 65, humidity: 85 },
      Abuja: { averageSunlightHours: 6.5, cloudCover: 45, humidity: 70 },
      Kano: { averageSunlightHours: 7.5, cloudCover: 25, humidity: 45 },
      "Port Harcourt": {
        averageSunlightHours: 5.0,
        cloudCover: 75,
        humidity: 90,
      },
      Ibadan: { averageSunlightHours: 6.0, cloudCover: 55, humidity: 75 },
      Kaduna: { averageSunlightHours: 7.0, cloudCover: 35, humidity: 55 },
      Jos: { averageSunlightHours: 6.8, cloudCover: 40, humidity: 60 },
    };

    const cityData = cityWeatherData[location.city] || cityWeatherData["Abuja"];
    console.log(`Using static weather data for ${location.city}`);
    return cityData;
  } catch (error) {
    console.log("Weather API failed, using defaults");
    return { averageSunlightHours: 6.5, cloudCover: 30, humidity: 70 };
  }
};

// Helper function to calculate sunlight hours based on latitude
const calculateSunlightHours = (latitude) => {
  // Simple approximation for Nigeria (between 4°N and 14°N)
  const baseHours = 6.5;
  const latitudeFactor = (latitude - 9) * 0.1; // Adjust based on distance from center
  return Math.max(5.0, Math.min(8.0, baseHours + latitudeFactor));
};

// Test route to verify Claude API is working (protected by hybrid auth)
router.get("/test", verifyToken, async (req, res) => {
  try {
    const completion = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content:
            "Hello! Just say 'Claude AI is working' if you can see this.",
        },
      ],
    });

    res.json({
      success: true,
      message: "Claude AI connection successful!",
      response: completion.content[0].text,
      model: "claude-3-5-sonnet-20241022",
      userInfo: {
        id: req.user.id,
        username: req.user.username,
        email: req.user.email,
        authMethod: req.user.authMethod,
        tokenType: req.user.tokenType,
        isVerified: req.user.isVerified,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      type: error.constructor.name,
    });
  }
});

// AI-powered recommendation route - SINGLE OPTIMAL RECOMMENDATION WITH REAL PRODUCT IMAGES
router.post("/", async (req, res) => {
  const startTime = Date.now();

  try {
    let items = req.body.items;

    // Validate input
    if (!items || (Array.isArray(items) && items.length === 0)) {
      return res.status(400).json({
        success: false,
        message: "Items are required",
      });
    }

    if (!Array.isArray(items)) {
      items = [items];
    }

    // Validate each item
    for (const item of items) {
      if (
        !item.nameOfItem ||
        !item.quantity ||
        !item.wattage ||
        !item.dayHours ||
        !item.nightHours
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Each item must have nameOfItem, quantity, wattage, dayHours, and nightHours",
        });
      }
    }

    // Get location and solar data
    const location = await getLocationData(req);
    const solarData = await getSolarData(location);

    // Calculate usage metrics
    const totalWattage = items.reduce(
      (sum, item) => sum + Number(item.wattage) * Number(item.quantity),
      0
    );
    const totalDayHours = items.reduce(
      (sum, item) => sum + Number(item.dayHours),
      0
    );
    const totalNightHours = items.reduce(
      (sum, item) => sum + Number(item.nightHours),
      0
    );
    const dailyConsumption = (
      (totalWattage * (totalDayHours + totalNightHours)) /
      1000
    ).toFixed(2);

    // Create Claude AI prompt for SINGLE OPTIMAL recommendation with real product images
    const prompt = `You are an expert solar energy consultant for Nigeria with deep knowledge of solar installations and current market products. Always return valid JSON.

    Based on the following information, provide EXACTLY 1 OPTIMAL solar system recommendation with REAL product images:

    LOCATION: ${location.city}, ${location.region}, ${location.country}
    SOLAR CONDITIONS: ${
      solarData.averageSunlightHours
    } hours average sunlight, ${solarData.cloudCover}% cloud cover

    POWER REQUIREMENTS:
    - Total wattage needed: ${totalWattage}W
    - Daily consumption: ${dailyConsumption} kWh
    - Day usage hours: ${totalDayHours}
    - Night usage hours: ${totalNightHours}

    APPLIANCES:
    ${items
      .map(
        (item) =>
          `- ${item.nameOfItem}: ${item.quantity} units, ${item.wattage}W each, ${item.dayHours}h day + ${item.nightHours}h night`
      )
      .join("\n")}

    REQUIREMENTS:
    1. Recommend the SINGLE MOST OPTIMAL system (not multiple options)
    2. Use SPECIFIC brand names and models available in Nigeria (e.g., "Luminous 5KVA Inverter", "Trojan 200Ah Battery", "Canadian Solar 450W Panel")
    3. Include REAL product image URLs from manufacturer websites or trusted Nigerian retailers
    4. Calculate accurate pricing for Nigerian market (2024/2025 prices)
    5. Consider the climate conditions in ${location.city}

    Return response in this EXACT JSON format:
    {
      "recommendation": {
        "systemName": "Optimal Solar System for Your Needs",
        "components": {
          "inverter": {
            "name": "Specific Brand Model (e.g., Luminous 5KVA Pure Sine Wave Inverter)",
            "quantity": 1,
            "warranty": "2 years warranty",
            "imageUrl": "REAL_PRODUCT_IMAGE_URL_HERE"
          },
          "battery": {
            "name": "Specific Brand Model (e.g., Trojan T-105 Deep Cycle Battery 225Ah)",
            "quantity": 4,
            "warranty": "5 years warranty", 
            "imageUrl": "REAL_PRODUCT_IMAGE_URL_HERE"
          },
          "solarPanels": {
            "name": "Specific Brand Model (e.g., Canadian Solar 450W Monocrystalline Panel)",
            "quantity": 8,
            "warranty": "25 years warranty",
            "imageUrl": "REAL_PRODUCT_IMAGE_URL_HERE"
          }
        },
        "pricing": {
          "subtotal": 4500000,
          "vat": 337500,
          "totalAmount": 4837500,
          "currency": "NGN"
        },
        "performance": {
          "dailyConsumption": "${dailyConsumption} kWh",
          "backupDuration": "12-16 hours",
          "efficiency": "95%"
        },
        "suitability": {
          "reason": "This system is optimal because it perfectly matches your ${dailyConsumption} kWh daily consumption with optimal component sizing",
          "climateConsiderations": ["Suitable for ${
            location.city
          } humidity levels", "Handles ${
      solarData.cloudCover
    }% cloud cover efficiently"]
        }
      }
    }

    IMPORTANT: 
    - Find REAL product images from manufacturer websites or trusted Nigerian solar retailers
    - Use current Nigerian market prices (not outdated prices)
    - Ensure the system can handle the calculated ${dailyConsumption} kWh daily consumption
    - Consider ${location.city}'s ${
      solarData.cloudCover
    }% cloud cover and humidity levels
    - NO fallback options - this is the SINGLE best recommendation`;

    console.log("ANTHROPIC_API_KEY exists:", !!process.env.ANTHROPIC_API_KEY);
    console.log(
      "API key starts with sk-ant:",
      process.env.ANTHROPIC_API_KEY?.startsWith("sk-ant-")
    );
    console.log("API key length:", process.env.ANTHROPIC_API_KEY?.length);
    console.log(
      "First 20 chars:",
      process.env.ANTHROPIC_API_KEY?.substring(0, 20)
    );

    // Get Claude AI recommendations
    const completion = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 2000,
      temperature: 0.3, // Lower temperature for more consistent recommendations
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    // Parse Claude response
    let aiResponse;
    try {
      const responseText = completion.content[0].text;
      console.log("Claude raw response:", responseText);

      // Try to extract JSON if Claude added extra text
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      const jsonString = jsonMatch ? jsonMatch[0] : responseText;

      aiResponse = JSON.parse(jsonString);

      // Validate that we got the expected structure
      if (!aiResponse.recommendation || !aiResponse.recommendation.components) {
        throw new Error("Invalid AI response structure");
      }
    } catch (parseError) {
      console.error("JSON parsing failed:", parseError);
      console.error("Raw Claude response:", completion.content[0].text);

      // Return error instead of fallback
      return res.status(503).json({
        success: false,
        message: "Unable to generate recommendations at this time",
        error: "AI service parsing error",
        suggestion: "Please try again in a few moments",
        canRetry: true,
      });
    }

    // Determine if user is authenticated (without requiring it)
    const isAuthenticated = req.user && req.user.id;

    // Build customer info based on authentication status
    const customerInfo = isAuthenticated
      ? {
          userId: req.user.id,
          username: req.user.username,
          email: req.user.email,
          authMethod: req.user.authMethod,
          isVerified: req.user.isVerified,
          requestId: `REQ_${Date.now()}_${req.user.id.toString().slice(-6)}`,
        }
      : {
          userId: null,
          username: "Anonymous User",
          email: null,
          authMethod: "none",
          isVerified: false,
          requestId: `REQ_${Date.now()}_ANON`,
        };

    // Build the final response
    const result = {
      success: true,
      customerInfo,
      locationProfile: {
        location: location,
        solarConditions: solarData,
        climateOptimizations: getClimateOptimizations(location, solarData),
      },
      powerRequirements: {
        totalWattage,
        dailyConsumption: dailyConsumption + " kWh",
        appliances: items,
        usagePattern: analyzeUsagePattern(totalDayHours, totalNightHours),
      },
      recommendation: aiResponse.recommendation,
      metadata: {
        generatedAt: new Date(),
        aiModel: "claude-3-5-sonnet",
        confidence: "high",
        tokenType: isAuthenticated ? req.user.tokenType : "anonymous",
        processingTime: Date.now() - startTime,
      },
    };

    // Save recommendation request to user's history (only if authenticated)
    if (isAuthenticated) {
      try {
        await saveRecommendationToHistory(req.user.id, result);
        console.log(`💾 Recommendation saved for user: ${req.user.username}`);
      } catch (historyError) {
        console.error("Failed to save recommendation history:", historyError);
        // Don't fail the request if history saving fails
      }
    } else {
      console.log("📝 Anonymous user - skipping history save");
    }

    res.status(200).json(result);
  } catch (error) {
    console.error("AI recommendation error:", error);

    return res.status(503).json({
      success: false,
      message: "Recommendation service is temporarily unavailable",
      error: error.message,
      suggestion:
        "Please try again in a few moments. Our AI system will be back online shortly.",
      canRetry: true,
      supportContact: "If the issue persists, please contact our support team",
    });
  }
});

// Updated helper function to save recommendation to user history
const saveRecommendationToHistory = async (userId, recommendationData) => {
  if (!userId) {
    console.log("📝 No userId provided - skipping history save");
    return;
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      console.log(`⚠️ User not found: ${userId}`);
      return;
    }

    // Create history entry for single recommendation structure
    const historyEntry = {
      requestId: recommendationData.customerInfo.requestId,
      totalWattage: recommendationData.powerRequirements.totalWattage,
      dailyConsumption: recommendationData.powerRequirements.dailyConsumption,
      appliances: recommendationData.powerRequirements.appliances,
      location: {
        city: recommendationData.locationProfile.location.city,
        region: recommendationData.locationProfile.location.region,
        country: recommendationData.locationProfile.location.country,
      },
      solarConditions: {
        averageSunlightHours:
          recommendationData.locationProfile.solarConditions
            .averageSunlightHours,
        cloudCover:
          recommendationData.locationProfile.solarConditions.cloudCover,
        humidity: recommendationData.locationProfile.solarConditions.humidity,
      },
      recommendedSystem: {
        systemName: recommendationData.recommendation.systemName,
        totalAmount: recommendationData.recommendation.pricing.totalAmount,
        components: recommendationData.recommendation.components,
        performance: recommendationData.recommendation.performance,
      },
      aiModel: recommendationData.metadata.aiModel,
      processingTime: recommendationData.metadata.processingTime,
      requestedAt: new Date(),
    };

    // Initialize recommendationHistory if it doesn't exist
    if (!user.recommendationHistory) {
      user.recommendationHistory = [];
    }

    // Add to user's recommendation history (keep last 10 recommendations)
    user.recommendationHistory.push(historyEntry);
    if (user.recommendationHistory.length > 10) {
      user.recommendationHistory.shift(); // Remove oldest if more than 10
    }

    await user.save();
    console.log(
      `💾 Recommendation saved for user: ${user.username} (Total: ${user.recommendationHistory.length})`
    );
  } catch (error) {
    console.error("Failed to save recommendation history:", error);
    // Don't throw error - this shouldn't break the main flow
    throw error; // Re-throw so calling function can handle it
  }
};

router.get("/debug/recommendations", verifyTokenAndAdmin, async (req, res) => {
  try {
    // Check what's actually in the database
    const users = await User.find({}).select("username recommendationHistory");

    const debug = {
      totalUsers: await User.countDocuments(),
      usersWithRecommendations: users.filter(
        (u) => u.recommendationHistory && u.recommendationHistory.length > 0
      ),
      sampleUser: users[0],
      recommendationHistoryLength: users[0]?.recommendationHistory?.length || 0,
    };

    res.json(debug);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
