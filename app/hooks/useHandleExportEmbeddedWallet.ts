"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useCallback } from "react";
import { toast } from "sonner";
import { useStarknetExportModal } from "../context/StarknetExportModalContext";
import { useNetwork } from "../context/NetworksContext";
import { useStarknet } from "../context/StarknetContext";
import { useWalletAddress } from "./useWalletAddress";

/**
 * EVM: Privy’s built-in export modal (`exportWallet()`).
 * Starknet: custom modal + server-proxied HPKE export (Privy REST); `exportWallet({ address })` is invalid for Starknet addresses (viem).
 */
export function useHandleExportEmbeddedWallet() {
  const { exportWallet } = usePrivy();
  const { selectedNetwork } = useNetwork();
  const networkWalletAddress = useWalletAddress();
  const { walletId } = useStarknet();
  const { openStarknetExport } = useStarknetExportModal();

  return useCallback(async () => {
    const isStarknet = selectedNetwork?.chain?.name === "Starknet";

    if (isStarknet) {
      if (!networkWalletAddress || !walletId) {
        toast.error("Starknet wallet not ready", {
          description:
            "Wait for your Starknet wallet to load, or try switching networks and back.",
        });
        return;
      }
      openStarknetExport();
      return;
    }

    try {
      await exportWallet();
    } catch {
      toast.error("Could not open wallet export");
    }
  }, [
    exportWallet,
    selectedNetwork?.chain?.name,
    networkWalletAddress,
    walletId,
    openStarknetExport,
  ]);
}
