# 🌾 KrushiConnect 🚜

<p align="center">
  <strong>An Intelligent, AI-Driven Supply Chain and Advisory Platform for Farmers</strong>
</p>

<p align="center">
  <a href="https://krushi-connect-1.vercel.app/" target="_blank">
    <img src="https://img.shields.io/badge/Live%20Demo-Vercel-brightgreen?style=for-the-badge&logo=vercel" alt="Live Demo" />
  </a>
</p>

---

## 📌 Project Overview
**KrushiConnect** is a comprehensive digital ecosystem designed to bridge the gap between traditional agricultural practices and modern technology. By combining a robust mobile-friendly application framework with cutting-edge AI features, the platform empowers farmers with direct market access, real-time insights, and data-driven agricultural advisory tools.

### 🌟 Key Features
*   🤖 **AI Soil & Crop Advisory:** Integrated with Google Gemini to offer instant, context-aware advice on soil health and optimal crop cultivation.
*   📦 **Direct Supply Chain & Marketplace:** Eliminates intermediate channels, allowing farmers to list produce directly for fair pricing.
*   📊 **Smart Resource Management:** Tracks essential updates and provides automated quote/token allocations for agricultural tasks.
*   📱 **Offline-Ready Distribution:** Built-in compiled Android application package (`.apk`) for immediate download and deployment on mobile units.

---

## 🛠️ Architecture & Tech Stack

### 💻 Software Components
*   **Frontend:** React / Vite / HTML5 / TailwindCSS (Optimized for both mobile viewports and web access)
*   **Backend & Hosting:** Vercel (Production serverless environment)
*   **Database & Rules Configuration:** Firebase Firestore (Real-time NoSQL document store with strict secure indexing constraints)
*   **AI Integration:** Google Gemini API (Configured with dynamic quota management handles for robust data delivery)

### 🔌 Hardware & IoT Extension Potential (Future Framework)
To turn KrushiConnect into a full-scale automated farm intelligence tool, the software is designed to easily map data from the following field nodes:
*   **Microcontrollers:** ESP32 / Arduino Nano 33 IoT (For field telemetry capture and wireless data relay over Wi-Fi/LoRa)
*   **Sensors:** 
    *   *Capacitive Soil Moisture Sensors* (Real-time tracking of soil hydration levels)
    *   *DHT22 Sensors* (Ambient temperature and relative humidity tracking)
    *   *NPK Soil Sensors* (Measuring Nitrogen, Phosphorus, and Potassium nutrient concentration to supply the Gemini model with precise inputs)

---

## 📁 Repository Directory Structure
```text
├── apk/                  # Compiled Android Application Package files for mobile testing
├── public/               # Static assets, branding icons, and web manifests
├── src/                  # Main source logic (React components, Gemini client routing)
├── firestore.rules       # Security and validation rules for database entries
├── firebase-blueprint    # Schema maps for structural architecture
└── .env.example          # Sample environment variables configuration
