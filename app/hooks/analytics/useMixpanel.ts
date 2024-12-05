import Cookies from "js-cookie";
import { useEffect } from "react";
import mixpanel, { type Dict } from "mixpanel-browser";
import config from "../../lib/config";

const { mixpanelToken } = config;

let initialized = false;

export const initMixpanel = () => {
  if (initialized) return;

  const consent = Cookies.get("cookieConsent");
  if (!consent || !JSON.parse(consent).analytics) {
    console.warn("User has not consented to analytics cookies");
    return;
  }

  if (mixpanelToken) {
    mixpanel.init(mixpanelToken, {
      track_pageview: true,
      persistence: "localStorage",
      ignore_dnt: true,
    });

    initialized = true;
  } else {
    console.warn("Mixpanel token is not defined");
  }
};

export const useMixpanel = () => {
  useEffect(() => {
    const handleConsentChange = () => {
      const consent = Cookies.get("cookieConsent");
      if (consent && JSON.parse(consent).analytics) {
        initMixpanel();
      }
    };

    window.addEventListener("cookieConsent", handleConsentChange);
    handleConsentChange();

    return () => {
      window.removeEventListener("cookieConsent", handleConsentChange);
    };
  }, []);
};

export const trackEvent = (
  eventName: string,
  properties?: Dict | undefined
) => {
  if (!initialized) {
    console.warn("Mixpanel not initialized");
    return;
  }
  mixpanel.track(eventName, properties);
};
