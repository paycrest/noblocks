"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useEmbed } from "../context/EmbedContext";
import { useInjectedWallet } from "../context/InjectedWalletContext";
import { useNetwork } from "../context/NetworksContext";
import {
  hasEmbedNetworkLockParams,
  resolveNetworkByChainId,
  resolveNetworkFromEmbedParams,
} from "../lib/embed-network";

/**
 * Applies host `?chainId=` / `?network=` on mount, and follows EIP-1193
 * `chainChanged` from injected/bridge wallets while in embed mode.
 * Must render under NetworkProvider and InjectedWalletProvider.
 */
export function EmbedNetworkLockApplier() {
  const { isEmbed, isNetworkLocked, lockNetworkFromWallet } = useEmbed();
  const { setDisplayedNetwork } = useNetwork();
  const { injectedProvider } = useInjectedWallet();
  const searchParams = useSearchParams();
  const appliedRef = useRef(false);
  const urlToastRef = useRef(false);
  const unsupportedChainToastRef = useRef(false);

  // URL lock → set displayed network once.
  useEffect(() => {
    if (!isEmbed || !isNetworkLocked) return;
    if (!hasEmbedNetworkLockParams(searchParams)) return;
    if (appliedRef.current) return;

    appliedRef.current = true;
    const network = resolveNetworkFromEmbedParams(searchParams);
    if (network) {
      setDisplayedNetwork(network);
      return;
    }

    if (!urlToastRef.current) {
      urlToastRef.current = true;
      toast.error("Unsupported network", {
        description:
          "The network from the embed URL is not supported. Keeping the default network.",
      });
    }
  }, [isEmbed, isNetworkLocked, searchParams, setDisplayedNetwork]);

  // Injected / bridge wallet chain switches → update + keep locked.
  useEffect(() => {
    if (!isEmbed || !injectedProvider?.on) return;

    const handleChainChanged = (chainId: unknown) => {
      const network = resolveNetworkByChainId(
        typeof chainId === "string" || typeof chainId === "number"
          ? chainId
          : String(chainId ?? ""),
      );
      if (network) {
        setDisplayedNetwork(network);
        lockNetworkFromWallet();
        unsupportedChainToastRef.current = false;
        return;
      }

      if (!unsupportedChainToastRef.current) {
        unsupportedChainToastRef.current = true;
        toast.error("Unsupported network", {
          description:
            "Your wallet switched to a network Noblocks does not support yet.",
        });
      }
    };

    injectedProvider.on("chainChanged", handleChainChanged);
    return () => {
      injectedProvider.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [
    isEmbed,
    injectedProvider,
    setDisplayedNetwork,
    lockNetworkFromWallet,
  ]);

  return null;
}
