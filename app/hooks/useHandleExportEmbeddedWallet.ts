"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useCallback } from "react";
import { toast } from "sonner";
import { useNetwork } from "../context/NetworksContext";
import { useWalletAddress } from "./useWalletAddress";

/**
 * Opens Privy's export modal for the embedded wallet that matches the selected network.
 * On Starknet, passes the Starknet embedded address so the modal does not default to HD index 0 (EVM).
 */
export function useHandleExportEmbeddedWallet() {
  const { exportWallet } = usePrivy();
  const { selectedNetwork } = useNetwork();
  const networkWalletAddress = useWalletAddress();

  return useCallback(async () => {
    const isStarknet = selectedNetwork?.chain?.name === "Starknet";

    if (isStarknet) {
      if (!networkWalletAddress) {
        toast.error("Starknet wallet not ready", {
          description:
            "Wait for your Starknet wallet to load, or try switching networks and back.",
        });
        return;
      }
      try {
        await exportWallet({ address: networkWalletAddress });
      } catch {
        toast.error("Could not open wallet export");
      }
      return;
    }

    try {
      await exportWallet();
    } catch {
      toast.error("Could not open wallet export");
    }
  }, [exportWallet, selectedNetwork?.chain?.name, networkWalletAddress]);
}
