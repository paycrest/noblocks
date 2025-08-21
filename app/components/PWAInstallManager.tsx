"use client";

import React, { useEffect } from "react";

export default function PWAInstall() {
  useEffect(() => {
    // Register service worker
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((registration) => {
            // Service worker registered successfully
          })
          .catch((registrationError) => {
            console.error("SW registration failed: ", registrationError);
          });
      });
    }

    // Let the browser handle the beforeinstallprompt event naturally
    // No custom UI, no event prevention - just pure native behavior
    const handleAppInstalled = () => {
      // PWA was installed successfully
    };

    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  // This component doesn't render anything - it just sets up PWA functionality
  // The browser will show its native install prompt when appropriate
  return null;
}
