# Krushi Connect Mobile APK Files Guidance & Resources

This directory is designated for Android and mobile application resources.

## 📱 How to install Krushi Connect on your Phone (Android & iOS):

Krushi Connect is a fully certified **Progressive Web App (PWA)**, which can be installed instantly on any mobile phone as an App **without compiling risky third-party APKs**.

### 🌟 Standard Installation (Recommended):
1. Open Google Chrome on your Android phone.
2. Go to: `https://ais-pre-ivv2x43noinojz5nxa6hos-13798947353.asia-east1.run.app`
3. Click the notification banner **"Install Now"** or tap your browser menu button **(⋮) -> "Install App / Add to Home Screen"**.
4. Excellent! Android will dynamically compile and register a secure, local **WebAPK** package inside your system drawer instantly.

---

### 💻 How to compile your own offline installable .APK file:
If you need an actual physical `.apk` installer file to distribute or install via file manager, you can easily use Google's official **Bubblewrap** build utility in 3 simple commands:

1. Install Google Bubblewrap globally on your CLI:
   ```bash
   npm install -g @bubblewrap/cli
   ```
2. Initialize compilation pointing directly to our manifest configuration:
   ```bash
   bubblewrap init --manifest=https://ais-pre-ivv2x43noinojz5nxa6hos-13798947353.asia-east1.run.app/manifest.json
   ```
3. Compile the production package:
   ```bash
   bubblewrap build
   ```
This compiles a signed `app-release-signed.apk` directly on your platform!
