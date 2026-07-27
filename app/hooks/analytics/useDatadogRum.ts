import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import {
  syncDatadogRumConsent,
  trackDatadogView,
} from "@/app/lib/datadog.client";

export const useDatadogRum = (enabled: boolean = true) => {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  useEffect(() => {
    // Disabled inside partner iframes (/widget) — same rule as Mixpanel.
    if (!enabled) return;

    const handleConsentChange = () => {
      const trackingEnabled = syncDatadogRumConsent();
      // Late consent grant / re-grant: start the current SPA view immediately
      // (pathname effect alone won't rerun until the next navigation).
      if (trackingEnabled && pathnameRef.current) {
        trackDatadogView(pathnameRef.current);
      }
    };

    window.addEventListener("cookieConsentChange", handleConsentChange);
    window.addEventListener("cookieConsent", handleConsentChange);
    // Initial sync only — view tracking is owned by the pathname effect so we
    // don't double-start a view when consent is already present on mount.
    syncDatadogRumConsent();

    return () => {
      window.removeEventListener("cookieConsentChange", handleConsentChange);
      window.removeEventListener("cookieConsent", handleConsentChange);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !pathname) return;
    trackDatadogView(pathname);
  }, [enabled, pathname]);
};
