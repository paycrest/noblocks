import { useEffect } from "react";
import Hotjar from "@hotjar/browser";
import Cookies from "js-cookie";
import config from "@/app/lib/config";

export const useHotjar = () => {
  const { hotjarSiteId } = config;
  const hotjarVersion = 6;

  useEffect(() => {
    const handleConsentChange = () => {
      const consent = Cookies.get("cookieConsent");

      if (consent && JSON.parse(consent).analytics) {
        if (hotjarSiteId) {
          Hotjar.init(hotjarSiteId, hotjarVersion);
        } else {
          console.warn("Hotjar ID is not defined");
        }
      } else {
        console.warn("User has not consented to analytics cookies");
      }
    };

    window.addEventListener("cookieConsent", handleConsentChange);
    handleConsentChange();

    return () => {
      window.removeEventListener("cookieConsent", handleConsentChange);
    };
  }, [hotjarSiteId]);
};
