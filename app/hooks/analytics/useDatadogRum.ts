import { useEffect } from "react";
import { usePathname } from "next/navigation";

import {
  initDatadogRum,
  isDatadogRumInitialized,
  trackDatadogView,
} from "@/app/lib/datadog.client";

export const useDatadogRum = (enabled: boolean = true) => {
  const pathname = usePathname();

  useEffect(() => {
    // Disabled inside partner iframes (/widget) — same rule as Mixpanel.
    if (!enabled) return;

    const handleConsentChange = () => {
      initDatadogRum();
    };

    window.addEventListener("cookieConsentChange", handleConsentChange);
    window.addEventListener("cookieConsent", handleConsentChange);
    handleConsentChange();

    return () => {
      window.removeEventListener("cookieConsentChange", handleConsentChange);
      window.removeEventListener("cookieConsent", handleConsentChange);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !pathname) return;
    if (!isDatadogRumInitialized()) return;
    trackDatadogView(pathname);
  }, [enabled, pathname]);
};
