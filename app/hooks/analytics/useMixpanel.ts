import { useEffect } from "react";
import config from "@/app/lib/config";
import mixpanel, { type Dict } from "mixpanel-browser";
import Cookies from "js-cookie";

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

export const identifyUser = (
  address: string,
  properties: {
    login_method: string | null;
    isNewUser: boolean;
    createdAt: Date | string;
    email?: { address: string } | null;
  },
) => {
  if (!initialized) {
    console.warn("Mixpanel not initialized");
    return;
  }

  const consent = Cookies.get("cookieConsent");
  if (!consent || !JSON.parse(consent).analytics) {
    return;
  }

  mixpanel.identify(address);
  mixpanel.people.set({
    login_method: properties.login_method || "unknown",
    $last_login: new Date(),
    $signup_date: properties.createdAt,
    $email: properties.email?.address,
    isNewUser: properties.isNewUser,
  });
};

export const trackEvent = (
  eventName: string,
  properties?: Dict | undefined,
) => {
  if (!initialized) {
    console.warn("Mixpanel not initialized");
    return;
  }
  mixpanel.track(eventName, { app: "Noblocks", ...properties });
};
