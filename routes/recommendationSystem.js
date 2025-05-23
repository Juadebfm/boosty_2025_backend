const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");
const axios = require("axios");

const router = express.Router();

// Initialize Anthropic (Claude)
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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

// Test route to verify Claude API is working
router.get("/test", async (req, res) => {
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
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      type: error.constructor.name,
    });
  }
});

// AI-powered recommendation route
router.post("/", async (req, res) => {
  let items; // Declare items in the outer scope
  try {
    items = req.body.items; // Assign here

    // Validate input
    if (!items || (Array.isArray(items) && items.length === 0)) {
      return res.status(400).json({ message: "Items are required" });
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

    // Create Claude AI prompt
    const prompt = `You are an expert solar energy consultant for Nigeria with deep knowledge of solar installations in Nigeria and West Africa. Always return valid JSON.

    Based on the following information, provide exactly 3 solar system recommendations:

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

    Please provide exactly 3 recommendations (Basic, Standard, Premium) in this exact JSON format:
    {
      "recommendations": [
        {
          "option": "Basic Package",
          "panel": "450w monocrystalline solar panel",
          "panelQuantity": 4,
          "panelImage": "https://images.pexels.com/photos/159243/solar-solar-cells-photovoltaic-environmentally-friendly-159243.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
          "generator": "2.5kva pure sine wave solar generator",
          "generatorQuantity": 1,
          "generatorWarranty": "2 years warranty",
          "battery": "2.56kw lithium battery",
          "batteryQuantity": 1,
          "batteryImage": "https://media.istockphoto.com/id/1620576275/photo/close-up-view-of-home-battery-storage-system-on-building-facade.jpg?b=1&s=612x612&w=0&k=20&c=L5C8M4hfXLt_OscTaK_KnhY_GHXrIGGVvkMB3D6KS04=",
          "batteryWarranty": "10 years warranty",
          "amount": 3108000,
          "vat": 233100,
          "totalAmount": 3341100,
          "dailyConsumption": "${dailyConsumption} kWh"
        }
      ]
    }

    Adjust quantities, capacities, and prices based on the power requirements and location factors like humidity and cloud cover in ${
      location.city
    }.`;

    // Get Claude AI recommendations
    const completion = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 2000,
      temperature: 0.7,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    // Parse Claude response
    const aiResponse = JSON.parse(completion.content[0].text);

    // Enhance with additional data
    const result = {
      userProfile: {
        location: location,
        solarConditions: solarData,
        powerRequirements: {
          totalWattage,
          dailyConsumption: dailyConsumption + " kWh",
          appliances: items,
        },
      },
      recommendations: aiResponse.recommendations,
      metadata: {
        generatedAt: new Date(),
        aiModel: "claude-3-5-sonnet",
        confidence: "high",
      },
    };

    res.status(200).json(result);
  } catch (error) {
    console.error("AI recommendation error:", error);

    // Fallback to hardcoded system
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

    const fallbackRecommendations = generateFallbackRecommendations(
      totalWattage,
      totalDayHours,
      totalNightHours
    );

    res.status(200).json({
      recommendations: fallbackRecommendations,
      note: "Using fallback recommendations. AI system temporarily unavailable.",
      totalWattage,
    });
  }
});

// Fallback recommendation system (your original logic)
const generateFallbackRecommendations = (
  totalWattage,
  totalDayHours,
  totalNightHours
) => {
  const recommendations = [];

  if (totalWattage >= 0 && totalWattage <= 3125) {
    recommendations.push({
      option: "Basic Package",
      panel: "450w monocrystalline solar panel",
      panelQuantity: 4,
      panelImage:
        "https://images.pexels.com/photos/159243/solar-solar-cells-photovoltaic-environmentally-friendly-159243.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
      generator: "2.5kva pure sine wave solar generator",
      generatorQuantity: 1,
      generatorWarranty: "2 years warranty",
      battery: "2.56kw lithium battery",
      batteryQuantity: 1,
      batteryImage:
        "https://media.istockphoto.com/id/1620576275/photo/close-up-view-of-home-battery-storage-system-on-building-facade.jpg?b=1&s=612x612&w=0&k=20&c=L5C8M4hfXLt_OscTaK_KnhY_GHXrIGGVvkMB3D6KS04=",
      batteryWarranty: "10 years warranty",
      amount: 3108000,
      vat: 233100,
      totalAmount: 3341100,
      dailyConsumption:
        ((totalWattage * (totalDayHours + totalNightHours)) / 1000).toFixed(2) +
        " kWh",
    });
  }

  if (totalWattage >= 3126 && totalWattage <= 3750) {
    recommendations.push({
      option: "Standard Package",
      panel: "450w monocrystalline solar panel",
      panelQuantity: 8,
      panelImage:
        "https://images.pexels.com/photos/159243/solar-solar-cells-photovoltaic-environmentally-friendly-159243.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
      inverter: "3kva pure sine wave hybrid inverter",
      inverterQuantity: 1,
      inverterWarranty: "2 years warranty",
      battery: "5kw lithium battery",
      batteryQuantity: 1,
      batteryImage:
        "https://media.istockphoto.com/id/1620576275/photo/close-up-view-of-home-battery-storage-system-on-building-facade.jpg?b=1&s=612x612&w=0&k=20&c=L5C8M4hfXLt_OscTaK_KnhY_GHXrIGGVvkMB3D6KS04=",
      batteryWarranty: "10 years warranty",
      amount: 5352000,
      vat: 401400,
      totalAmount: 5753400,
      dailyConsumption:
        ((totalWattage * (totalDayHours + totalNightHours)) / 1000).toFixed(2) +
        " kWh",
    });
  }

  if (totalWattage >= 3751 && totalWattage <= 6250) {
    recommendations.push({
      option: "Premium Package",
      panel: "450w monocrystalline solar panel",
      panelQuantity: 10,
      panelImage:
        "https://images.pexels.com/photos/159243/solar-solar-cells-photovoltaic-environmentally-friendly-159243.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
      inverter: "5kva pure sine wave hybrid inverter",
      inverterQuantity: 1,
      inverterWarranty: "2 years warranty",
      battery: "5kw lithium battery",
      batteryQuantity: 1,
      batteryImage:
        "https://media.istockphoto.com/id/1620576275/photo/close-up-view-of-home-battery-storage-system-on-building-facade.jpg?b=1&s=612x612&w=0&k=20&c=L5C8M4hfXLt_OscTaK_KnhY_GHXrIGGVvkMB3D6KS04=",
      batteryWarranty: "10 years warranty",
      amount: 6180000,
      vat: 463500,
      totalAmount: 6643500,
      dailyConsumption:
        ((totalWattage * (totalDayHours + totalNightHours)) / 1000).toFixed(2) +
        " kWh",
    });
  }

  if (totalWattage >= 6251 && totalWattage <= 12500) {
    recommendations.push({
      option: "Enterprise Package",
      panel: "450w monocrystalline solar panel",
      panelQuantity: 20,
      panelImage:
        "https://images.pexels.com/photos/159243/solar-solar-cells-photovoltaic-environmentally-friendly-159243.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1",
      inverter: "10kva pure sine wave hybrid inverter",
      inverterQuantity: 1,
      inverterWarranty: "2 years warranty",
      battery: "16kw lithium battery",
      batteryQuantity: 1,
      batteryImage:
        "https://media.istockphoto.com/id/1620576275/photo/close-up-view-of-home-battery-storage-system-on-building-facade.jpg?b=1&s=612x612&w=0&k=20&c=L5C8M4hfXLt_OscTaK_KnhY_GHXrIGGVvkMB3D6KS04=",
      batteryWarranty: "10 years warranty",
      amount: 13980000,
      vat: 1048500,
      totalAmount: 15028500,
      dailyConsumption:
        ((totalWattage * (totalDayHours + totalNightHours)) / 1000).toFixed(2) +
        " kWh",
    });
  }

  return recommendations;
};

module.exports = router;
