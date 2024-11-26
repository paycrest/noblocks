import mixpanel from "mixpanel-browser";
import { useEffect } from "react";
import config from "../lib/config";

const { env, mixpanelToken } = config;

if (mixpanelToken) {
  mixpanel.init(mixpanelToken, {
    debug: env === "development",
    track_pageview: true,
    persistence: "localStorage",
    ignore_dnt: true,
    verbose: true,
  });
} else {
  console.warn("Mixpanel token is not defined");
}

export const trackEvent = (
  eventName: string,
  properties?: Record<string, unknown>
) => {
  if (mixpanelToken) {
    mixpanel.track(eventName, properties);
  }
};

export const useMixpanelPageView = (pageName: string) => {
  useEffect(() => {
    trackEvent("Page View", { page: pageName });
  }, [pageName]);
};

export const trackFormSubmission = (
  formName: string,
  formData: Record<string, unknown>
) => {
  trackEvent("Form Submission", {
    form: formName,
    ...formData,
  });
};
