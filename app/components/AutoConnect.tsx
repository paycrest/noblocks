"use client";

import { useEffect } from "react";

import { useInjectedWallet } from "../context/InjectedWalletContext";

export default function AutoConnect() {
  const { injectedReady } = useInjectedWallet();

  // The InjectedWalletContext already handles the connection flow
  // This component can be simplified to just monitor the state

  useEffect(() => {
    if (injectedReady) {
      console.log("Wallet connected");
    }
  }, [injectedReady]);

  return null;
}
