"use client";

import { useEffect, useState } from "react";

export default function AutoConnect() {
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
        const provider = window.ethereum as any;
        if (typeof provider.request !== "function") {
          console.error("Ethereum provider missing request()");
          return;
        }
        const accounts: string[] = await provider.request({
          method: "eth_accounts",
        });
        if (!accounts || accounts.length === 0) {
          await provider.request({ method: "eth_requestAccounts" });
        }
        console.log("Wallet connected");
      } catch (err) {
        console.error("Failed to connect wallet:", err);
      }
    }

    connect();
  }, []);

  return null;
}
