import config from "@/app/lib/config";
import Hotjar from "@hotjar/browser";
import { useEffect } from "react";

export const useHotjar = () => {
  const { hotjarSiteId, env } = config;
  const hotjarVersion = 6;

  useEffect(() => {
    if (hotjarSiteId) {
      Hotjar.init(hotjarSiteId, hotjarVersion, {
        debug: env === "development",
      });
    } else {
      console.warn("Hotjar ID is not defined");
    }
  }, [hotjarSiteId, env]);
};

export const identifyHotjarUser = (
  userId: string,
  userProperties?: Record<string, string | number | boolean>
) => {
  if (userProperties) {
    Hotjar.identify(userId, userProperties);
  } else {
    Hotjar.identify(userId, {});
  }
};

export const triggerHotjarEvent = (eventName: string) => {
  Hotjar.event(eventName);
};

export const updateHotjarState = (newPath: string) => {
  Hotjar.stateChange(newPath);
};
