"use client";

import { useEffect, useState } from "react";

export default function AutoConnect() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function connect() {
      let attempts = 0;
      while (typeof window.ethereum === "undefined" && attempts < 20) {
        await new Promise((res) => setTimeout(res, 250));
        attempts++;
      }

      if (!window.ethereum) {
        console.error("Ethereum provider not found");
        return;
      }

      try {
        console.log("Requesting wallet connection...");
        if (window.ethereum && typeof window.ethereum.request === "function") {
          await window.ethereum.request({ method: "eth_requestAccounts" });
          console.log("Wallet connected");
        } else {
          console.error("No Ethereum provider found");
        }

        console.log("Wallet connected");
      } catch (err) {
        console.error("Failed to connect wallet:", err);
      }

      setReady(true);
    }

    connect();
  }, []);

  if (!ready) return null;

  return null;
}
