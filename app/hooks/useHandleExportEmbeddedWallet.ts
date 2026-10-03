"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useExportWallet as useExportExtendedWallet } from "@privy-io/react-auth/extended-chains";
import { useCallback } from "react";
import { toast } from "sonner";
import { useStarknetExportModal } from "../context/StarknetExportModalContext";
import { useNetwork } from "../context/NetworksContext";
import { useStarknet } from "../context/StarknetContext";
import { isTronChain } from "../utils";
import { useWalletAddress } from "./useWalletAddress";

/**
 * EVM: Privy’s built-in export modal (`exportWallet()`).
 * Starknet: custom modal + server-proxied HPKE export (Privy REST); `exportWallet({ address })` is invalid for Starknet addresses (viem).
 * Tron: Privy extended-chains `exportWallet({ address })` — bare `exportWallet()` always opens the EVM key.
 */
export function useHandleExportEmbeddedWallet() {
  const { exportWallet } = usePrivy();
  const { exportWallet: exportExtendedWallet } = useExportExtendedWallet();
  const { selectedNetwork } = useNetwork();
  const networkWalletAddress = useWalletAddress();
  const { walletId } = useStarknet();
  const { openStarknetExport } = useStarknetExportModal();

  return useCallback(async () => {
    const chain = selectedNetwork?.chain;
    const isStarknet = chain?.name === "Starknet";
    const isTron = isTronChain(chain);

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

    if (isTron) {
      if (!networkWalletAddress) {
        toast.error("Tron wallet not ready", {
          description:
            "Wait for your Tron wallet to load, or try switching networks and back.",
        });
        return;
      }
      try {
        await exportExtendedWallet({ address: networkWalletAddress });
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
  }, [
    exportWallet,
    exportExtendedWallet,
    selectedNetwork?.chain,
    networkWalletAddress,
    walletId,
    openStarknetExport,
  ]);
}
