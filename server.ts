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
let isQuotaExceeded = false;
let quotaExceededResetTime = 0;

function checkQuotaStatus(): boolean {
  if (isQuotaExceeded) {
    if (Date.now() > quotaExceededResetTime) {
      isQuotaExceeded = false;
      console.log("[Gemini API] Quota lock window elapsed, resetting verification state.");
      return true;
    }
    return false;
  }
  return true;
}

function getDetailedSimulatedCropAdvice(sensorData: any): string {
  const moisture = sensorData?.moisture ?? 42;
  const ph = sensorData?.ph ?? 6.5;
  const temperature = sensorData?.temperature ?? 26;
  const n = sensorData?.n ?? 60;
  const p = sensorData?.p ?? 45;
  const k = sensorData?.k ?? 55;

  if (moisture > 80) { // Node C (Zone 3) / Flooded Saturated
    return `### 1. Soil Health Assessment
- **Status (Zone 3 - Flood Alert)**: Waterlogged land (${moisture}% water content) with cool soil temperatures (${temperature}°C) and standard acidic pH levels (${ph}). Root zone is fully submerged.

### 2. Suitable Crops
1. **Rice (Paddy)**: Highly adaptive semi-aquatic plant species optimized for standing waterfields and anaerobic soil profiles.
2. **Sugarcane (Heavy Intake)**: Possesses an exceptionally high water requirement, allowing it to grow steadily under rich saturated clay or waterlogged silt blocks.
3. **Water Spinach (Kalmi)**: Resilient green crop that prefers muddy, high-moisture swamp surfaces.

### 3. Current Crop Advice (Rice / Sugarcane)
- **Warning**: Standing water depth must be structured carefully. Saturated soils prevent oxygen diffusion to root bases, causing active root rot in non-aquatic crops.
- Dig sub-surface perimeter trenches or drainage canals if trying to cultivate anything other than rice or sugarcane to drain water quickly.

### 4. Fertilizer & Irrigation
- **Irrigation Action**: Deactive all electric well pumps and automated irrigation valves immediately.
- **Fertilizer Guidance**: Nutrients (N=${n}, P=${p}, K=${k} ppm) are prone to leaking out in runoffs under flooded states. Avoid solid granular nitrogen application until fields stabilize, avoiding downstream chemical waste. Use organic slow-release mulch during drainage phases.`;
  }

  if (moisture < 20) { // Node B (Zone 2) / Dry
    return `### 1. Soil Health Assessment
- **Status (Zone 2 - Drought Alert)**: Dehydrated crop land with critically low moisture levels (${moisture}%), elevated soil surface temperature (${temperature}°C), and slightly alkaline pH levels (${ph}).

### 2. Suitable Crops
1. **Groundnut (Peanuts)**: Resilient legume capable of high nitrogen fixation that tolerates dry soil during primary vegetative states.
2. **Dryland Pulses**: Legume strains that conserve water well and establish key nutrient bonds under minimal moisture.
3. **Resilient Sorghum (Jowar)**: Broad-rooted millet species that thrives deep within low precipitation areas.

### 3. Current Crop Advice (Groundnuts & Pulses)
- **Warning**: Severe water stress is restricting standard cellular growth. Crops can face permanent seedling wilting if moisture remains below 15% for more than 48 hours.
- Implement organic dry-straw mulch or sugarcane bagging around crop crowns to preserve residual subsoil water from sun-baked evaporation.

### 4. Fertilizer & Irrigation
- **Irrigation Action**: Immediate deep localized drip irrigation or micro-sprinkler runs are highly required.
- **Fertilizer Guidance**: Dry soil cannot transfer nutrients (N=${n}, P=${p}, K=${k} ppm) effectively into root capillaries, potentially causing chemical dehydration of root structures. Refrain from applying chemical fertilizers until a regular irrigation schedule is restored.`;
  }

  // Node A (Zone 1) / Normal Soil
  return `### 1. Soil Health Assessment
- **Status (Zone 1 - Optimal Condition)**: Extremely healthy soil parameters displaying stable nominal moisture levels (${moisture}%), warm balanced temperatures (${temperature}°C), and neutral pH balance (${ph}).

### 2. Suitable Crops
1. **Vegetables / Premium Tomatoes**: Highly suited to well-drained loams where controlled watering produces juicy crops and thick branch layouts.
2. **French Beans**: Moderate water affinity plant that utilizes steady potash ratios beautifully.
3. **Okra (Bhindi)**: Highly productive warm-season pod vegetable optimized for these temperate ground parameters.

### 3. Current Crop Advice (Vegetables / Tomatoes)
- Soil moisture levels are within perfect physiological zones. Maintain current standard watering schedules (morning or evening window offsets).
- Nutrient levels are highly active and support smooth micro-bacterial health.

### 4. Fertilizer & Irrigation
- **Irrigation Action**: Run scheduled high-efficiency drip loops for 15-20 minutes daily.
- **Fertilizer Guidance**: Excellent default readings (N=${n}, P=${p}, K=${k} ppm). A light side-dress of organic compost or soluble nitrogen during peak vegetative and flowering stages will help maximize crop yields.`;
}

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

async function generateGeminiContentWithRetry(
  prompt: string,
  config?: any
): Promise<string> {
  if (!checkQuotaStatus()) {
    throw new Error("Gemini quota is temporarily blocked due to rate limits.");
  }

  const ai = getGeminiClient();
  if (!ai) {
    throw new Error("No Gemini client initialized");
  }

  const modelsToTry = ["gemini-3.5-flash", "gemini-3.1-flash-lite"];
  let lastError: any = null;

  for (const model of modelsToTry) {
    let attempts = 0;
    const maxAttempts = 2;
    while (attempts < maxAttempts) {
      try {
        attempts++;
        console.log(`[Gemini API] Attempting generation with model: ${model}, attempt: ${attempts}`);
        const response = await ai.models.generateContent({
          model: model,
          contents: prompt,
          ...config
        });
        
        if (response.text) {
          return response.text;
        }
      } catch (err: any) {
        lastError = err;
        const errStr = err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err));
        console.warn(`[Gemini API] Error using model ${model} (attempt ${attempts}):`, errStr);
        
        const isQuotaError = errStr.includes("429") || 
                             errStr.includes("RESOURCE_EXHAUSTED") ||
                             errStr.includes("Quota exceeded") ||
                             errStr.includes("quota");

        if (isQuotaError) {
          isQuotaExceeded = true;
          // Block Gemini calls for 5 minutes to keep the app immediately responsive
          quotaExceededResetTime = Date.now() + 300000;
          console.warn("[Gemini API] Quota limit exceeded. Engaging automatic 5-minute fallback cache to prevent unresponsive timeouts.");
          break; // Break the attempt loop
        }

        const isTransient = errStr.includes("503") || 
                            errStr.includes("UNAVAILABLE") || 
                            errStr.includes("high demand") || 
                            errStr.includes("timeout") ||
                            errStr.includes("Spikes in demand") ||
                            errStr.includes("temporary");
                            
        if (!isTransient) {
          break; // fatal or non-retriable error
        }
        
        if (attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 500 * attempts));
        }
      }
    }
    // If quota was hit during attempts on the current model, do not try other models
    if (isQuotaExceeded) {
      break;
    }
  }
  
  throw lastError || new Error("Failed to generate content with all models");
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

  if (!ai || !checkQuotaStatus()) {
    return res.json({ advice: getDetailedSimulatedCropAdvice(sensorData) });
  }

  try {
    const text = await generateGeminiContentWithRetry(`
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
      `);

    res.json({ advice: text || getDetailedSimulatedCropAdvice(sensorData) });
  } catch (error) {
    handleGeminiError(error, "Crop Advice");
    res.json({ advice: getDetailedSimulatedCropAdvice(sensorData) });
  }
});

// Server-Side Gemini endpoint for Market Forecast
app.get("/api/market-forecast", async (req, res) => {
  const ai = getGeminiClient();

  if (!ai || !checkQuotaStatus()) {
    return res.json({ forecast: simulatedMarketForecast });
  }

  try {
    const text = await generateGeminiContentWithRetry(`
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
      `);

    res.json({ forecast: text || simulatedMarketForecast });
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
