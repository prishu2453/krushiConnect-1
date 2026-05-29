# APK & Mobile App Installation Guide | मोबाइल ऐप इंस्टॉलेशन गाइड

This folder contains resources and complete instructions for installing **Krushi Connect** directly onto your Android device as a mobile application.

इस फ़ोल्डर में **कृषि कनेक्ट (Krushi Connect)** को आपके एंड्रॉइड डिवाइस पर सीधे मोबाइल एप्लिकेशन के रूप में इंस्टॉल करने के बारे में पूरी जानकारी है।

---

## Method 1: Instant Installation (Highly Recommended) / त्वरित इंस्टॉलेशन (अत्यधिक अनुशंसित)

Our platform is a fully-compliant **Progressive Web App (PWA)**. When you install it, Android automatically compiles a safe, secure, Google-signed **WebAPK** specifically for your phone.

हमारा प्लेटफ़ॉर्म पूरी तरह से अनुकूल **प्रोग्रेसिव वेब ऐप (PWA)** है। जब आप इसे इंस्टॉल करते हैं, तो एंड्रॉइड स्वचालित रूप से आपके फोन के लिए एक सुरक्षित और गूगल द्वारा प्रमाणित **WebAPK** संकलित करता है।

### 📱 How to Install:
1. Open this website in **Google Chrome** on your Android phone:
   `https://ais-pre-ivv2x43noinojz5nxa6hos-13798947353.asia-east1.run.app`
2. Tap the **"Add Krushi Connect to Home Screen"** banner at the bottom of the screen.
3. If you don't see the banner, tap the **Three Dots Menu (⋮)** in the top-right corner of Chrome.
4. Select **"Install App"** or **"Add to Home Screen"** (होम स्क्रीन पर जोड़ें / ऐप इंस्टॉल करें).
5. Click **Add / Install**. 
6. Within a few seconds, the app will appear in your mobile's regular app drawers alongside all other apps!

---

## Method 2: Sideloading via Custom Built Native APK (For advanced users/Offline share)

If you need a physical `.apk` file for offline sharing (e.g. via SHAREit/Bluetooth) or posting to Google Play Store, you can package this web app instantly into a native APK using Google's **Bubblewrap CLI** or **TWA (Trusted Web Activity)**.

यदि आपको ऑफ़लाइन साझा करने (जैसे SHAREit/ब्लूटूथ) या गूगल प्ले स्टोर पर पोस्ट करने के लिए एक वास्तविक `.apk` फ़ाइल की आवश्यकता है, तो आप इसे गूगल के **Bubblewrap** या **Capacitor** का उपयोग करके आसानी से एक नेटिव APK में बदल सकते हैं।

### 🛠️ How to Compile a Standalone APK yourself:
1. Ensure you have **Node.js** and **Java JDK 17** installed on your computer.
2. Install the Google Bubblewrap package builder:
   ```bash
   npm i -g @bubblewrap/cli
   ```
3. Initialize the compilation setup pointing to your deployed site manifest:
   ```bash
   bubblewrap init --manifest=https://ais-pre-ivv2x43noinojz5nxa6hos-13798947353.asia-east1.run.app/manifest.json
   ```
4. Follow the interactive CLI prompts to configure your app launcher key, package name, and icons.
5. Compile and build the signed APK:
   ```bash
   bubblewrap build
   ```
6. This will output an **`app-release-signed.apk`** which you can copy to any phone and install instantly!

---

## PWA Asset Configurations in this workspace:
- **Manifest Setup:** `/public/manifest.json` (defines custom colors, app name, and launcher splash pictures)
- **Service Worker Engine:** `/public/service-worker.js` (enables offline caching of farm records and live data)
