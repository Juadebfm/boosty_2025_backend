// Updated tts.js with voice availability check:

const express = require("express");
const router = express.Router();
const textToSpeech = require("@google-cloud/text-to-speech");
const googleTTSClient = new textToSpeech.TextToSpeechClient();

// Get available voices (call this once to see what's available)
const getAvailableVoices = async () => {
  try {
    const [result] = await googleTTSClient.listVoices({});
    const voices = result.voices;

    // Filter for English voices
    const englishVoices = voices.filter((voice) =>
      voice.languageCodes.some((code) => code.startsWith("en"))
    );

    console.log("Available English voices:");
    englishVoices.forEach((voice) => {
      console.log(
        `- ${voice.name} (${voice.languageCodes.join(", ")}) - ${
          voice.ssmlGender
        }`
      );
    });

    return englishVoices;
  } catch (error) {
    console.error("Error listing voices:", error);
    return [];
  }
};

const getGoogleVoice = (voiceType, gender) => {
  if (voiceType === "Nigeria") {
    // Use British English (closest to Nigerian English) with modifications
    const languageCode = "en-GB";
    const voiceName = gender === "male" ? "en-GB-Neural2-B" : "en-GB-Neural2-A";
    return { languageCode, voiceName };
  } else {
    // American English voices
    const languageCode = "en-US";
    const voiceName = gender === "male" ? "en-US-Neural2-D" : "en-US-Neural2-C";
    return { languageCode, voiceName };
  }
};

const speakWithSpeechify = async (text, gender, language) => {
  try {
    console.log("🎙️ Trying Speechify TTS (Nigerian)...");

    const voiceId = gender === "male" ? "elijah" : "tasha";
    console.log(`Using voice: ${voiceId} (${gender})`);

    const response = await fetch(
      "https://api.sws.speechify.com/v1/audio/speech",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.SPEECHIFY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: text,
          voice_id: voiceId,
          audio_format: "mp3", // Back to MP3 since WAV didn't work
          sample_rate: 22050,
        }),
      }
    );

    console.log("Speechify response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.log("Speechify error response:", errorText);
      throw new Error(`Speechify API error: ${response.status} - ${errorText}`);
    }

    // ✅ THE FIX: Parse JSON response to get Base64 audio data
    const responseData = await response.json();
    console.log("Speechify response keys:", Object.keys(responseData));

    if (!responseData.audio_data) {
      throw new Error("No audio_data in Speechify response");
    }

    // ✅ Decode Base64 audio data to get actual audio bytes
    const audioBuffer = Buffer.from(responseData.audio_data, "base64");

    console.log("✅ Speechify TTS successful!");
    console.log("Base64 audio data length:", responseData.audio_data.length);
    console.log("Decoded audio buffer size:", audioBuffer.length);
    console.log("Audio format from response:", responseData.audio_format);

    return audioBuffer;
  } catch (error) {
    console.log("❌ Speechify TTS failed:", error.message);
    throw error;
  }
};

// Also update your /speak route to handle WAV format:

router.post("/speak", async (req, res) => {
  try {
    const {
      text,
      voiceType = "American",
      gender = "male",
      language = "English",
    } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: "Text is required" });
    }

    let audioBuffer;
    let contentType = "audio/mpeg"; // Default for Google TTS

    if (voiceType === "Nigeria") {
      // Use Speechify for Nigerian voices (now WAV format)
      audioBuffer = await speakWithSpeechify(text, gender, language);
      contentType = "audio/wav"; // ✅ Update content type for WAV
    } else {
      // Use Google TTS for American voices (MP3)
      const { languageCode, voiceName } = getGoogleVoice(voiceType, gender);

      const request = {
        input: { text },
        voice: {
          languageCode,
          name: voiceName,
          ssmlGender: gender === "male" ? "MALE" : "FEMALE",
        },
        audioConfig: { audioEncoding: "MP3", speakingRate: 0.9, pitch: 0.0 },
      };

      const [response] = await googleTTSClient.synthesizeSpeech(request);
      audioBuffer = response.audioContent;
      contentType = "audio/mpeg"; // Keep MP3 for Google TTS
    }

    res.set({
      "Content-Type": contentType, // ✅ Dynamic content type
      "Content-Length": audioBuffer.length,
      "Cache-Control": "public, max-age=3600",
    });

    res.send(audioBuffer);
  } catch (error) {
    console.error("❌ TTS error:", error);
    res.status(500).json({
      error: "TTS generation failed",
      message: error.message,
    });
  }
});

// Add this endpoint to check available voices
router.get("/voices", async (req, res) => {
  try {
    const voices = await getAvailableVoices();
    res.json(voices);
  } catch (error) {
    res.status(500).json({ error: "Failed to list voices" });
  }
});

const testSpeechifyAPI = async () => {
  try {
    console.log("🔍 Testing Speechify API...");
    console.log(
      "API Key:",
      process.env.SPEECHIFY_API_KEY ? "✅ Present" : "❌ Missing"
    );

    // Test 1: Get available voices
    const response = await fetch("https://api.sws.speechify.com/v1/voices", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${process.env.SPEECHIFY_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    console.log("Response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.log("❌ Error response:", errorText);
      return;
    }

    const voices = await response.json();
    console.log("✅ API call successful!");
    console.log("Total voices available:", voices.length);

    // Look for African/Nigerian voices
    console.log("\n🔍 Looking for African/Nigerian voices...");
    const africanVoices = voices.filter(
      (voice) =>
        voice.locale?.toLowerCase().includes("ng") ||
        voice.locale?.toLowerCase().includes("nigeria") ||
        voice.display_name?.toLowerCase().includes("nigeria") ||
        voice.display_name?.toLowerCase().includes("african") ||
        voice.tags?.some(
          (tag) =>
            tag.toLowerCase().includes("nigeria") ||
            tag.toLowerCase().includes("african")
        )
    );

    if (africanVoices.length > 0) {
      console.log("Found African/Nigerian voices:");
      africanVoices.forEach((voice) => {
        console.log(`- ID: ${voice.id}`);
        console.log(`  Name: ${voice.display_name}`);
        console.log(`  Gender: ${voice.gender}`);
        console.log(`  Locale: ${voice.locale}`);
        console.log(`  Tags: ${voice.tags?.join(", ")}`);
        console.log("  ---");
      });
    } else {
      console.log("❌ No Nigerian voices found. Available voices:");
      voices.slice(0, 10).forEach((voice) => {
        console.log(
          `- ID: ${voice.id}, Name: ${voice.display_name}, Gender: ${voice.gender}, Locale: ${voice.locale}`
        );
      });
    }
  } catch (error) {
    console.error("❌ Speechify test failed:", error.message);
  }
};

// Add this to your router temporarily
router.get("/test-speechify", async (req, res) => {
  await testSpeechifyAPI();
  res.json({ message: "Check console for results" });
});

// ALSO: Check if your API key is set
console.log(
  "Speechify API Key check:",
  process.env.SPEECHIFY_API_KEY ? "✅ Set" : "❌ Not set"
);

module.exports = router;
