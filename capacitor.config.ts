import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "io.veloxion.app",
  appName: "Veloxion AI",
  webDir: "www",
  server: {
    url: "https://veloxion.io/lk",
    cleartext: false,
    allowNavigation: ["veloxion.io", "*.veloxion.io", "api.veloxion.io", "*.api.veloxion.io"]
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#edf5f9"
  },
  ios: {
    backgroundColor: "#edf5f9",
    contentInset: "automatic",
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
