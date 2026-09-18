"use client";

import React, { useEffect, useRef } from "react";
import { useStep } from "../context/StepContext";

/** How often an open tab asks the browser to re-check sw.js for a new build. */
const SW_UPDATE_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Registers the PWA service worker and keeps open tabs on the current build:
 * when a new worker takes control it reloads the page — skipped on first
 * install, and deferred while a transaction step is on screen. Idle tabs are
 * nudged to look for a new worker on a timer and whenever they come back into
 * view, since browsers otherwise only re-check sw.js on navigation or roughly
 * once a day.
 */
export default function PWAInstall() {
  const { isFormStep } = useStep();
  // True once this page has been controlled by a service worker. The first
  // controllerchange after an uncontrolled load is the initial install, not an
  // update — reloading there would loop on every first visit.
  const hadControllerRef = useRef(false);
  const updatePendingRef = useRef(false);
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

  // sw.js calls skipWaiting() + clients.claim(), so a new worker takes over
  // open pages immediately — but each page keeps running the JS it already
  // loaded. Build-time config lives in that JS, so a long-lived PWA tab keeps
  // running stale code until it reloads. Reload as soon as a new worker takes
  // control, unless a transaction is on screen; in that case wait until the
  // user is back on the form.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const sw = navigator.serviceWorker;
    if (sw.controller) hadControllerRef.current = true;

    const reloadIfSafe = () => {
      if (!updatePendingRef.current || !isFormStep) return;
      updatePendingRef.current = false;
      window.location.reload();
    };

    const handleControllerChange = () => {
      if (!hadControllerRef.current) {
        hadControllerRef.current = true;
        return;
      }
      updatePendingRef.current = true;
      reloadIfSafe();
    };

    sw.addEventListener("controllerchange", handleControllerChange);
    // The step may have just returned to the form with an update pending.
    reloadIfSafe();

    return () => {
      sw.removeEventListener("controllerchange", handleControllerChange);
    };
  }, [isFormStep]);

  // Ask the browser to re-check sw.js when the tab comes back into view and on
  // a timer. When a new worker is found it installs, claims the page, and the
  // controllerchange effect above handles the reload.
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
