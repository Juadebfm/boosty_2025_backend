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

// Enhanced location data with user address priority
const getLocationData = async (req) => {
  try {
    // PRIORITY 1: From user input in request body (highest priority)
    if (req.body.location) {
      console.log("Using location from request body");
      return await enhanceLocationWithAddress(req.body.location);
    }

    // PRIORITY 2: From authenticated user's stored address (NEW - high priority)
    if (req.user && req.user.id) {
      try {
        const user = await User.findById(req.user.id).select("address");
        if (user && user.address && user.address.coordinates) {
          console.log(`Using stored address for user: ${req.user.username}`);

          // Convert user address to location format
          const userLocation = {
            country: user.address.country,
            region: user.address.state,
            city: user.address.city,
            lat: user.address.coordinates.lat,
            lon: user.address.coordinates.lon,
            timezone: "Africa/Lagos", // Default for Nigeria
            fullAddress: user.address.fullAddress,
            addressComponents: {
              street: user.address.street,
              neighbourhood: user.address.neighbourhood,
              city: user.address.city,
              state: user.address.state,
              country: user.address.country,
              postcode: user.address.postcode,
            },
            addressSource: "user_stored",
            addressAccuracy: "exact",
          };

          return userLocation;
        } else {
          console.log("User authenticated but no stored address found");
        }
      } catch (userAddressError) {
        console.log("Failed to fetch user address:", userAddressError.message);
      }
    }

    // PRIORITY 3: IP-based geolocation (fallback)
    const ip = req.ip || req.connection.remoteAddress || "127.0.0.1";

    // Skip IP lookup for localhost
    if (ip === "127.0.0.1" || ip === "::1" || ip.includes("127.0.0.1")) {
      console.log("Using localhost fallback location");
      const defaultLocation = {
        country: "Nigeria",
        region: "Lagos",
        city: "Lagos",
        lat: 6.5244,
        lon: 3.3792,
        timezone: "Africa/Lagos",
      };
      return await enhanceLocationWithAddress(defaultLocation);
    }

    console.log("Getting location from IP:", ip);
    const locationAPI = `http://ip-api.com/json/${ip}?fields=status,message,country,regionName,city,lat,lon,timezone,isp,district`;
    const response = await axios.get(locationAPI);

    if (response.data.status === "success") {
      const baseLocation = {
        country: response.data.country,
        region: response.data.regionName,
        city: response.data.city,
        lat: response.data.lat,
        lon: response.data.lon,
        timezone: response.data.timezone,
        district: response.data.district,
        isp: response.data.isp,
      };

      console.log("Using IP-based location");
      return await enhanceLocationWithAddress(baseLocation);
    } else {
      throw new Error("IP geolocation failed");
    }
  } catch (error) {
    console.error("Location detection failed:", error);
    const fallbackLocation = {
      country: "Nigeria",
      region: "Lagos",
      city: "Lagos",
      lat: 6.5244,
      lon: 3.3792,
      timezone: "Africa/Lagos",
    };
    console.log("Using final fallback location");
    return await enhanceLocationWithAddress(fallbackLocation);
  }
};

// Helper function to enhance location with approximate address
const enhanceLocationWithAddress = async (baseLocation) => {
  try {
    // If we already have a full address, return as is
    if (baseLocation.fullAddress) {
      return baseLocation;
    }

    // Use reverse geocoding to get approximate address
    if (baseLocation.lat && baseLocation.lon) {
      try {
        // Option 1: Using OpenStreetMap Nominatim (free)
        const nominatimAPI = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${baseLocation.lat}&lon=${baseLocation.lon}&zoom=18&addressdetails=1`;

        const response = await axios.get(nominatimAPI, {
          headers: {
            "User-Agent": "Boosty Solar App (contact@boosty.com)",
          },
          timeout: 5000,
        });

        if (response.data && response.data.address) {
          const addr = response.data.address;

          // Build approximate address from available components
          const addressComponents = [];

          if (addr.house_number) addressComponents.push(addr.house_number);
          if (addr.road) addressComponents.push(addr.road);
          if (addr.neighbourhood) addressComponents.push(addr.neighbourhood);
          if (addr.suburb) addressComponents.push(addr.suburb);
          if (addr.city || addr.town || addr.village) {
            addressComponents.push(addr.city || addr.town || addr.village);
          }
          if (addr.state) addressComponents.push(addr.state);

          const approximateAddress = addressComponents.join(", ");

          return {
            ...baseLocation,
            fullAddress: approximateAddress,
            addressComponents: {
              street: addr.road || null,
              neighbourhood: addr.neighbourhood || addr.suburb || null,
              city: addr.city || addr.town || addr.village || baseLocation.city,
              state: addr.state || baseLocation.region,
              country: addr.country || baseLocation.country,
              postcode: addr.postcode || null,
            },
            addressSource: "nominatim",
            addressAccuracy: "approximate",
          };
        }
      } catch (geocodingError) {
        console.log("Reverse geocoding failed:", geocodingError.message);
      }
    }

    // Fallback: Generate approximate address from known data
    const fallbackAddress = generateFallbackAddress(baseLocation);

    return {
      ...baseLocation,
      fullAddress: fallbackAddress,
      addressComponents: {
        street: null,
        neighbourhood: null,
        city: baseLocation.city,
        state: baseLocation.region,
        country: baseLocation.country,
        postcode: null,
      },
      addressSource: "estimated",
      addressAccuracy: "city-level",
    };
  } catch (error) {
    console.error("Address enhancement failed:", error);

    // Return basic location with estimated address
    const estimatedAddress = generateFallbackAddress(baseLocation);

    return {
      ...baseLocation,
      fullAddress: estimatedAddress,
      addressSource: "estimated",
      addressAccuracy: "city-level",
    };
  }
};

// Generate fallback address from available location data
const generateFallbackAddress = (location) => {
  const parts = [];

  if (location.district) parts.push(location.district);
  if (location.city) parts.push(location.city);
  if (location.region) parts.push(location.region);
  if (location.country) parts.push(location.country);

  return parts.join(", ") || "Address not available";
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

// Enhanced price validation function with realistic bounds
const validatePricing = (pricing, totalWattage, dailyConsumption) => {
  const issues = [];

  // Calculate price per watt (realistic range: ₦1,200 - ₦2,800 per watt for quality systems)
  const pricePerWatt = pricing.totalAmount / totalWattage;

  // Set realistic bounds - not too high, not too low
  if (pricePerWatt > 3000) {
    issues.push(
      `Price per watt too high: ₦${pricePerWatt.toFixed(
        0
      )}/watt (recommended: ₦1,200-₦2,800/watt)`
    );
  }

  if (pricePerWatt < 1000) {
    issues.push(
      `Price per watt too low: ₦${pricePerWatt.toFixed(
        0
      )}/watt (minimum quality threshold: ₦1,000/watt)`
    );
  }

  // Quality system should not be suspiciously cheap
  if (pricePerWatt < 1200 && parseFloat(dailyConsumption) > 30) {
    issues.push(
      `System price may be too low for ${dailyConsumption} kWh daily consumption - quality components needed`
    );
  }

  // Check total system cost (realistic residential systems: ₦2.5M - ₦12M)
  if (pricing.totalAmount > 12000000) {
    issues.push(
      `System cost very high: ₦${pricing.totalAmount.toLocaleString()} (typical residential: ₦2.5M-₦12M)`
    );
  }

  if (pricing.totalAmount < 2000000 && parseFloat(dailyConsumption) > 25) {
    issues.push(
      `System cost seems too low: ₦${pricing.totalAmount.toLocaleString()} for ${dailyConsumption} kWh daily consumption`
    );
  }

  // Minimum viable system cost (to ensure quality)
  const minimumViableSystemCost = Math.max(1500000, totalWattage * 1000); // At least ₦1.5M or ₦1000/watt
  if (pricing.totalAmount < minimumViableSystemCost) {
    issues.push(
      `System cost too low: ₦${pricing.totalAmount.toLocaleString()} (minimum viable: ₦${minimumViableSystemCost.toLocaleString()})`
    );
  }

  // VAT should be 7.5% of subtotal
  const expectedVAT = Math.round(pricing.subtotal * 0.075);
  if (Math.abs(pricing.vat - expectedVAT) > 1000) {
    issues.push(
      `VAT calculation incorrect: ₦${pricing.vat} (expected: ₦${expectedVAT})`
    );
  }

  // Subtotal + VAT should equal totalAmount
  const expectedTotal = pricing.subtotal + pricing.vat;
  if (Math.abs(pricing.totalAmount - expectedTotal) > 1000) {
    issues.push(
      `Total amount calculation incorrect: ₦${pricing.totalAmount} (expected: ₦${expectedTotal})`
    );
  }

  if (issues.length > 0) {
    console.warn("⚠️ Pricing validation issues:", issues);
    return { valid: false, issues, pricing };
  }

  console.log(
    `✅ Pricing validated: ₦${pricePerWatt.toFixed(
      0
    )}/watt, Total: ₦${pricing.totalAmount.toLocaleString()}`
  );
  return { valid: true, issues: [], pricing };
};

// NEW: Component validation function
const validateRecommendation = (
  recommendation,
  totalWattage,
  dailyConsumption
) => {
  const issues = [];
  const components = recommendation.components;

  // Validate inverter sizing (should be 1.2-1.5x total wattage)
  const inverterMatch = components.inverter.name.match(/(\d+(?:\.\d+)?)\s*kw/i);
  if (inverterMatch) {
    const inverterCapacityW = parseFloat(inverterMatch[1]) * 1000;
    const minRequired = totalWattage * 1.2;
    const maxReasonable = totalWattage * 2.0;

    if (inverterCapacityW < minRequired) {
      issues.push(
        `Inverter undersized: ${inverterCapacityW}W for ${totalWattage}W load`
      );
    } else if (inverterCapacityW > maxReasonable) {
      issues.push(
        `Inverter oversized: ${inverterCapacityW}W for ${totalWattage}W load`
      );
    }
  }

  // Validate battery quantity (reasonable for daily consumption)
  const batteryQuantity = components.battery.quantity;
  const maxReasonableBatteries = Math.ceil(
    (parseFloat(dailyConsumption) * 1.5) / 2.5
  ); // Assuming ~2.5kWh avg battery

  if (batteryQuantity > maxReasonableBatteries) {
    issues.push(
      `Too many batteries: ${batteryQuantity} (reasonable max: ${maxReasonableBatteries} for ${dailyConsumption} kWh daily)`
    );
  }

  if (batteryQuantity > 25) {
    issues.push(`Excessive battery count: ${batteryQuantity} batteries`);
  }

  // Validate solar panel quantity
  const panelQuantity = components.solarPanels.quantity;
  const maxReasonablePanels = Math.ceil(
    (parseFloat(dailyConsumption) * 1.8 * 1000) / 400
  ); // Assuming ~400W avg panel

  if (panelQuantity > maxReasonablePanels) {
    issues.push(
      `Too many panels: ${panelQuantity} (reasonable max: ${maxReasonablePanels} for ${dailyConsumption} kWh daily)`
    );
  }

  if (panelQuantity > 30) {
    issues.push(`Excessive panel count: ${panelQuantity} panels`);
  }

  if (issues.length > 0) {
    console.warn("⚠️ Component validation issues:", issues);
    return { valid: false, issues, recommendation };
  }

  console.log(
    `✅ Components validated: ${components.inverter.name}, ${batteryQuantity} batteries, ${panelQuantity} panels`
  );
  return { valid: true, issues: [], recommendation };
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

// AI-powered recommendation route - ENHANCED WITH PRICING CONTROLS
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

    // ENHANCED: Calculate recommended component sizes for better AI guidance
    const recommendedInverterCapacity = Math.ceil((totalWattage * 1.3) / 1000); // in kW
    const recommendedBatteryCount = Math.ceil(
      (parseFloat(dailyConsumption) * 1.2) / 3.5
    ); // Assuming 3.5kWh batteries
    const recommendedPanelCount = Math.ceil(
      (parseFloat(dailyConsumption) * 1.5 * 1000) / 450
    ); // Assuming 450W panels

    // ENHANCED: Create Claude AI prompt with detailed pricing guidelines
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

    PRICING GUIDELINES for Nigerian market (2024/2025) - REALISTIC QUALITY PRICING:
    - Inverters: ₦200,000 - ₦800,000 (depending on capacity: 2kVA-10kVA range)
    - Quality Deep Cycle Batteries: ₦80,000 - ₦200,000 per unit (100Ah-200Ah range)
    - Solar panels: ₦80,000 - ₦150,000 per 400-500W panel
    - Installation & accessories: 15-20% of equipment cost
    - VAT: 7.5% of subtotal
    
    TARGET SYSTEM COST: Should typically range ₦2.5M - ₦8M for residential systems
    MINIMUM QUALITY THRESHOLD: ₦1,200 per watt (below this, quality may be compromised)
    MAXIMUM ACCEPTABLE TOTAL: ₦12M (only for very large installations)
    
    PRICING BALANCE RULES:
    - Don't make it too expensive (avoid ₦30M+ quotes)
    - Don't make it too cheap (maintain quality - minimum ₦1,000/watt)
    - Ensure realistic Nigerian market prices for quality components
    - Account for proper installation and warranty costs

    COMPONENT SIZING LOGIC:
    - Inverter capacity: Recommend ${recommendedInverterCapacity}kW (1.2-1.5x total wattage)
    - Battery bank: Around ${recommendedBatteryCount} units for ${dailyConsumption} kWh daily consumption + backup
    - Solar panels: Around ${recommendedPanelCount} x 450W panels (1.3-1.8x daily consumption for weather buffer)
    - NEVER exceed: 25 batteries, 30 panels, or 15kW inverter for residential

    REQUIREMENTS:
    1. Recommend the SINGLE MOST OPTIMAL system (not multiple options)
    2. Use SPECIFIC brand names and models available in Nigeria (e.g., "Luminous 5KVA Pure Sine Wave Inverter", "Trojan 150Ah Deep Cycle Battery", "Canadian Solar 450W Panel")
    3. Include REAL product image URLs from manufacturer websites or trusted Nigerian retailers
    4. Calculate REALISTIC pricing for Nigerian market - avoid inflated prices
    5. Consider the climate conditions in ${location.city}
    6. Ensure total system cost is reasonable (₦2M-₦8M typical, max ₦12M)

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
            "name": "Specific Brand Model (e.g., Trojan T-105 Deep Cycle Battery 150Ah)",
            "quantity": ${Math.min(recommendedBatteryCount, 16)},
            "warranty": "5 years warranty", 
            "imageUrl": "REAL_PRODUCT_IMAGE_URL_HERE"
          },
          "solarPanels": {
            "name": "Specific Brand Model (e.g., Canadian Solar 450W Monocrystalline Panel)",
            "quantity": ${Math.min(recommendedPanelCount, 20)},
            "warranty": "25 years warranty",
            "imageUrl": "REAL_PRODUCT_IMAGE_URL_HERE"
          }
        },
        "pricing": {
          "subtotal": [REASONABLE_AMOUNT_BETWEEN_2M_AND_8M],
          "vat": [SUBTOTAL_X_0.075],
          "totalAmount": [SUBTOTAL_PLUS_VAT],
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

    CRITICAL PRICING RULES:
    - Price per watt should be ₦1,000-₦3,000 (total cost divided by ${totalWattage}W)
    - Total system cost MUST be under ₦12,000,000
    - Use realistic Nigerian market prices, not inflated estimates
    - VAT must be exactly 7.5% of subtotal
    - If unsure about pricing, err on the lower side rather than overpricing`;

    console.log("ANTHROPIC_API_KEY exists:", !!process.env.ANTHROPIC_API_KEY);
    console.log("Sending enhanced prompt with pricing controls to Claude...");

    // Get Claude AI recommendations
    const completion = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 2000,
      temperature: 0.2, // Even lower temperature for more consistent pricing
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

      return res.status(503).json({
        success: false,
        message: "Unable to generate recommendations at this time",
        error: "AI service parsing error",
        suggestion: "Please try again in a few moments",
        canRetry: true,
      });
    }

    // NEW: Validate pricing before proceeding
    const pricingValidation = validatePricing(
      aiResponse.recommendation.pricing,
      totalWattage,
      dailyConsumption
    );

    if (!pricingValidation.valid) {
      console.error("❌ Pricing validation failed:", pricingValidation.issues);
      return res.status(422).json({
        success: false,
        message: "Generated recommendation has pricing issues",
        errors: pricingValidation.issues,
        suggestion:
          "Please try again - our AI will generate a new recommendation",
        canRetry: true,
      });
    }

    // NEW: Validate component sizing
    const componentValidation = validateRecommendation(
      aiResponse.recommendation,
      totalWattage,
      dailyConsumption
    );

    if (!componentValidation.valid) {
      console.error(
        "❌ Component validation failed:",
        componentValidation.issues
      );
      return res.status(422).json({
        success: false,
        message: "Generated recommendation has component sizing issues",
        errors: componentValidation.issues,
        suggestion:
          "Please try again - our AI will generate a new recommendation",
        canRetry: true,
      });
    }

    console.log("✅ All validations passed - proceeding with recommendation");

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
        validationsPassed: ["pricing", "components"],
        pricePerWatt: Math.round(
          aiResponse.recommendation.pricing.totalAmount / totalWattage
        ),
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
      pricePerWatt: recommendationData.metadata.pricePerWatt,
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

// NEW: Update user address endpoint
router.put("/user/address", verifyToken, async (req, res) => {
  try {
    const { address, coordinates } = req.body;

    // Validate required fields
    if (!address || !address.street || !address.city || !address.state) {
      return res.status(400).json({
        success: false,
        message: "Address must include street, city, and state",
        required: ["street", "city", "state"],
      });
    }

    // Find the user
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Build complete address object
    const userAddress = {
      street: address.street,
      neighbourhood: address.neighbourhood || null,
      city: address.city,
      state: address.state,
      country: address.country || "Nigeria",
      postcode: address.postcode || null,
      fullAddress: `${address.street}, ${address.city}, ${address.state}, ${
        address.country || "Nigeria"
      }`,
      coordinates: coordinates || null, // { lat, lon } if provided
      source: "user_input",
      accuracy: "exact",
      updatedAt: new Date(),
    };

    // If coordinates not provided, try to geocode the address
    if (!coordinates && userAddress.fullAddress) {
      try {
        const geocodeResult = await geocodeAddress(userAddress.fullAddress);
        if (geocodeResult.lat && geocodeResult.lon) {
          userAddress.coordinates = {
            lat: geocodeResult.lat,
            lon: geocodeResult.lon,
          };
          console.log(
            `✅ Geocoded user address: ${geocodeResult.lat}, ${geocodeResult.lon}`
          );
        }
      } catch (geocodeError) {
        console.log("⚠️ Geocoding user address failed:", geocodeError.message);
        // Continue without coordinates - not critical
      }
    }

    // Update user's address
    user.address = userAddress;
    await user.save();

    console.log(`📍 Address updated for user: ${user.username}`);

    res.status(200).json({
      success: true,
      message: "Address updated successfully",
      address: {
        street: userAddress.street,
        neighbourhood: userAddress.neighbourhood,
        city: userAddress.city,
        state: userAddress.state,
        country: userAddress.country,
        postcode: userAddress.postcode,
        fullAddress: userAddress.fullAddress,
        hasCoordinates: !!userAddress.coordinates,
        source: userAddress.source,
        accuracy: userAddress.accuracy,
      },
    });
  } catch (error) {
    console.error("Update address error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update address",
      error: error.message,
    });
  }
});

// NEW: Get user's current address
router.get("/user/address", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("address");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!user.address) {
      return res.status(200).json({
        success: true,
        message: "No address found",
        address: null,
        hasAddress: false,
      });
    }

    res.status(200).json({
      success: true,
      message: "Address retrieved successfully",
      address: {
        street: user.address.street,
        neighbourhood: user.address.neighbourhood,
        city: user.address.city,
        state: user.address.state,
        country: user.address.country,
        postcode: user.address.postcode,
        fullAddress: user.address.fullAddress,
        hasCoordinates: !!user.address.coordinates,
        source: user.address.source,
        accuracy: user.address.accuracy,
        updatedAt: user.address.updatedAt,
      },
      hasAddress: true,
    });
  } catch (error) {
    console.error("Get address error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve address",
      error: error.message,
    });
  }
});

// Helper function to geocode address string to coordinates
const geocodeAddress = async (addressString) => {
  try {
    const encodedAddress = encodeURIComponent(addressString);
    const nominatimAPI = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&countrycodes=ng&limit=1&addressdetails=1`;

    const response = await axios.get(nominatimAPI, {
      headers: {
        "User-Agent": "Boosty Solar App (contact@boosty.com)",
      },
      timeout: 8000,
    });

    if (response.data && response.data.length > 0) {
      const result = response.data[0];
      return {
        lat: parseFloat(result.lat),
        lon: parseFloat(result.lon),
        displayName: result.display_name,
        confidence: result.importance || 0.5,
      };
    } else {
      throw new Error("No geocoding results found");
    }
  } catch (error) {
    console.error("Geocoding failed:", error.message);
    throw error;
  }
};

// Debug route to check recommendations in database
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
