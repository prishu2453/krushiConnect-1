import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = 3000;

// JSON parsing for API requests
app.use(express.json());

// Lazy-initialized Gemini Client
let aiInstance: GoogleGenAI | null = null;
let lastInitializedKey: string | undefined = undefined;
let isApiKeyInvalid = false;

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
    return null;
  }

  // If the key has changed, reset the invalid flag and client instance
  if (apiKey !== lastInitializedKey) {
    aiInstance = null;
    isApiKeyInvalid = false;
    lastInitializedKey = apiKey;
  }

  if (isApiKeyInvalid) {
    return null;
  }

  if (!aiInstance) {
    aiInstance = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiInstance;
}

function handleGeminiError(error: any, endpointName: string): void {
  const errString = error ? (typeof error === 'object' ? JSON.stringify(error) : String(error)) : "";
  console.error(`Gemini Error on ${endpointName}:`, error);

  if (
    errString.includes("API key not valid") ||
    errString.includes("API_KEY_INVALID") ||
    errString.includes("API key is invalid")
  ) {
    isApiKeyInvalid = true;
    console.warn(`[getGeminiClient] Detected invalid GEMINI_API_KEY during ${endpointName} request. Falling back to simulated mode dynamically.`);
  }
}

// Simulated Fallbacks for offline / missing key situations
const simulatedCropAdvice = `
### 1. Soil Health Assessment
**Good (Offline/Simulated Mode)** - The soil parameters show adequate levels for crop cultivation. However, the nitrogen and potassium levels can be optimized.

### 2. Suitable Crops
1. **Wheat (Rabi Season)**: Highly compatible with current temperature readings (20-25°C) and neutral pH.
2. **Gram/Chickpea**: Excellent nitrogen-fixing legume that thrives under moderate moisture levels.
3. **Mustard**: Robust crop requiring lower moisture content, fitting well for the current agricultural timeline.

### 3. Current Crop Advice (Wheat)
- Monitor soil moisture level frequently; ensure uniform watering during the early vegetative phase.
- Maintain soil pH around neutral to maximize natural nutrient absorption capacity.

### 4. Fertilizer & Irrigation
- Apply nitrogen-rich organic fertilizers or urea at 120 kg/hectare in split doses.
- Schedule light drip or sprinkler irrigation to avoid waterlogging while maintaining moisture.
`;

const simulatedMarketForecast = `
### AI Market Predictions (Offline/Simulated Mode)
Here is the commodity price forecast for the next 3 months:

1. **Wheat**: Expected **+12%** increase. Driven by steady procurement demand and increased local consumption. Recommend holding some stock.
2. **Chickpea (Chana)**: Expected **+8%** increase. Supported by stable festive market demand. Recommend gradual marketing.
3. **Mustard Seed**: Expected **+5%** change. Supported by steady edible oil extraction demand.

*Disclaimer: These are general predictions based on seasonal simulated trends. Cross-verify with live local Mandi rates before making final business decisions.*
`;

// API Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Proxy for Mandi Data
app.get("/api/mandi-prices", async (req, res) => {
  res.json([
    { crop: "Rice", price: 2183, unit: "Quintal", trend: "up", mandi: "Nagpur" },
    { crop: "Wheat", price: 2275, unit: "Quintal", trend: "stable", mandi: "Indore" },
    { crop: "Tomato", price: 1500, unit: "Quintal", trend: "down", mandi: "Azadpur" },
    { crop: "Onion", price: 1800, unit: "Quintal", trend: "up", mandi: "Lasalgaon" },
  ]);
});

// Server-Side Gemini endpoint for Crop Advice
app.post("/api/crop-advice", async (req, res) => {
  const { sensorData, currentCrop } = req.body;
  const ai = getGeminiClient();

  if (!ai) {
    return res.json({ advice: simulatedCropAdvice });
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `
        You are an expert Indian agricultural advisor. 
        Analyze the following soil sensor data:
        - Moisture: ${sensorData?.moisture ?? 45}%
        - Temperature: ${sensorData?.temperature ?? 24}°C
        - pH: ${sensorData?.ph ?? 6.8}
        - NPK: N=${sensorData?.n ?? 40}, P=${sensorData?.p ?? 50}, K=${sensorData?.k ?? 50}
        
        ${currentCrop ? `The farmer is currently growing: ${currentCrop}.` : "The farmer hasn't planted anything yet."}
        
        Provide the response in the following structured format using Markdown:
        
        ### 1. Soil Health Assessment
        (Good/Alert/Critical) - Brief explanation.
        
        ### 2. Suitable Crops
        List 3-5 crops that would thrive in these specific soil conditions. Explain WHY for each.
        
        ### 3. Current Crop Advice (${currentCrop || 'N/A'})
        Specific recommendations for the current crop or general soil improvement.
        
        ### 4. Fertilizer & Irrigation
        Precise advice on what to add and how much to water.
        
        Keep the response professional, actionable, and empathetic. Do not use complex jargon.
      `,
    });

    res.json({ advice: response.text || simulatedCropAdvice });
  } catch (error) {
    handleGeminiError(error, "Crop Advice");
    res.json({ advice: simulatedCropAdvice });
  }
});

// Server-Side Gemini endpoint for Market Forecast
app.get("/api/market-forecast", async (req, res) => {
  const ai = getGeminiClient();

  if (!ai) {
    return res.json({ forecast: simulatedMarketForecast });
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `
        You are a commodity market analyst specializing in Indian Agriculture.
        Based on seasonal trends, current monsoon reports (hypothetical for May 2026), and common market dynamics in India:
        
        Predict 3-4 crops whose prices are likely to increase in the next 3 months.
        
        For each crop, provide:
        1. Crop Name
        2. Expected % Increase
        3. Reason (e.g., lower supply, festive demand, exports)
        4. Recommendation for farmers (e.g., hold stock, prepare seeds)
        
        Keep the response concise and formatted as a clean markdown list.
        Include a disclaimer that these are predictions based on AI analysis.
      `,
    });

    res.json({ forecast: response.text || simulatedMarketForecast });
  } catch (error) {
    handleGeminiError(error, "Market Forecast");
    res.json({ forecast: simulatedMarketForecast });
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Krushi Connect server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
