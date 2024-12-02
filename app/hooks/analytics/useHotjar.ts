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

    console.log("Hotjar initialized");
  }, [hotjarSiteId, env]);
};
