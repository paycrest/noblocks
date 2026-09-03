"use client";

import React, { useEffect, useRef } from "react";
import { useStep } from "../context/StepContext";

export default function PWAInstall() {
  const { isFormStep } = useStep();
  // True once this page has been controlled by a service worker. The first
  // controllerchange after an uncontrolled load is the initial install, not an
  // update — reloading there would loop on every first visit.
  const hadControllerRef = useRef(false);
  const updatePendingRef = useRef(false);

  useEffect(() => {
    // Register service worker
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((registration) => {
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
  // loaded. Build-time config (NEXT_PUBLIC_* keys) lives in that JS, so a
  // long-lived PWA tab keeps stamping stale values until it reloads. Reload as
  // soon as a new worker takes control, unless a transaction is on screen; in
  // that case wait until the user is back on the form.
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

  // This component doesn't render anything - it just sets up PWA functionality
  // The browser will show its native install prompt when appropriate
  return null;
}
