"use client";

import React, { useEffect, useRef } from "react";

/** How often an open tab asks the browser to re-check sw.js for a new build. */
const SW_UPDATE_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Registers the PWA service worker and nudges idle tabs to re-check for a new
 * worker on a timer and when the tab becomes visible. Service-worker updates and
 * deploy detection ({@link useAppUpdatePrompt}) are independent; this component
 * never reloads the page automatically.
 */
export default function PWAInstall() {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    // Register service worker
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((registration) => {
            registrationRef.current = registration;
            console.log("SW registered: ", registration);
          })
          .catch((registrationError) => {
            console.log("SW registration failed: ", registrationError);
          });
      });
    }

    // Let the browser handle the beforeinstallprompt event naturally
    // No custom UI, no event prevention - just pure native behavior
    const handleAppInstalled = () => {
      console.log("PWA was installed");
    };

    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  // Ask the browser to re-check sw.js when the tab comes back into view and on
  // a timer so installable/offline assets stay fresh; page reload is user-driven.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const sw = navigator.serviceWorker;
    let cancelled = false;

    const checkForUpdate = async () => {
      try {
        const registration =
          registrationRef.current ?? (await sw.getRegistration?.()) ?? null;
        if (cancelled || !registration) return;
        await registration.update();
      } catch {
        // Transient network failures are expected here; the next tick retries.
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void checkForUpdate();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    const timer = window.setInterval(
      () => void checkForUpdate(),
      SW_UPDATE_INTERVAL_MS,
    );

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(timer);
    };
  }, []);

  // This component doesn't render anything - it just sets up PWA functionality
  // The browser will show its native install prompt when appropriate
  return null;
}
