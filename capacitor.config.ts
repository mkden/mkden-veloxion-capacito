import type { CapacitorConfig } from "@capacitor/cli";
import regions from "./app-regions.json";

const regionName = process.env.VELOXION_APP_REGION || "rus";
if (regionName !== "rus" && regionName !== "euro") {
  throw new Error("VELOXION_APP_REGION must be rus or euro");
}
const region = regions[regionName];

const config: CapacitorConfig = {
  appId: region.appId,
  appName: region.appName,
  webDir: "www",
  server: {
    url: region.url,
    errorPath: "index.html",
    cleartext: false,
    allowNavigation: region.allowNavigation
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#edf5f9"
  },
  ios: {
    appendUserAgent: "VeloxionApp/iOS",
    backgroundColor: "#edf5f9",
    contentInset: "never",
    preferredContentMode: "mobile"
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1200,
      backgroundColor: "#edf5f9",
      showSpinner: false,
      androidScaleType: "CENTER_INSIDE",
      splashFullScreen: false,
      splashImmersive: false
    },
    StatusBar: {
      overlaysWebView: false,
      style: "DARK",
      backgroundColor: "#edf5f9"
    },
    Keyboard: {
      resize: "native",
      resizeOnFullScreen: false,
      style: "LIGHT"
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"]
    }
  }
};

export default config;
