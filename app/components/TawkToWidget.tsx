"use client";

import { useEffect } from "react";
import config from "../lib/config";

export function TawkToWidget() {
  useEffect(() => {
    if (typeof window !== "undefined" && config.tawkPropertyId) {
      const s1 = document.createElement("script");
      const s0 = document.getElementsByTagName("script")[0];

      s1.async = true;
      s1.src = `https://embed.tawk.to/${config.tawkPropertyId}`;
      s1.type = "text/javascript";
      s1.setAttribute("crossorigin", "*");

      if (s0?.parentNode) {
        s0.parentNode.insertBefore(s1, s0);
      }
    }
  }, []);

  return null;
}
