export async function getCropAdvice(sensorData: any, currentCrop?: string) {
  try {
    const response = await fetch('/api/crop-advice', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sensorData, currentCrop })
    });
    const data = await response.json();
    return data.advice || "I'm sorry, I couldn't generate advice right now.";
  } catch (error) {
    console.error("Client Crop Advice Fetch Error:", error);
    return "I'm sorry, I couldn't generate advice right now. Please check your connection.";
  }
}

export async function getMarketForecast() {
  try {
    const response = await fetch('/api/market-forecast');
    const data = await response.json();
    return data.forecast || "Market forecast currently unavailable.";
  } catch (error) {
    console.error("Client Market Forecast Fetch Error:", error);
    return "Market forecast currently unavailable. Please try again later.";
  }
}
