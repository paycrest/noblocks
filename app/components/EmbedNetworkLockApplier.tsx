"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useEmbed } from "../context/EmbedContext";
import { useInjectedWallet } from "../context/InjectedWalletContext";
import { useNetwork } from "../context/NetworksContext";
import {
  isNetworkInAllowlist,
  resolveNetworkByChainId,
} from "../lib/embed-network";

/**
 * Applies embed URL network defaults/allowlists on mount, follows EIP-1193
 * `chainChanged` from injected/bridge wallets, and handles host
 * `noblocks:set_config`. Must render under NetworkProvider and InjectedWalletProvider.
 */
export function EmbedNetworkLockApplier() {
  const {
    isEmbed,
    networkAllowlist,
    defaultNetwork,
    networkLockUnresolved,
    lockNetworkFromWallet,
    parentOrigin,
    applyHostConfig,
  } = useEmbed();
  const { setDisplayedNetwork } = useNetwork();
  const { injectedProvider } = useInjectedWallet();
  const appliedRef = useRef(false);
  const urlToastRef = useRef(false);
  const unsupportedChainToastRef = useRef(false);

  // URL default / allowlist → set displayed network once.
  useEffect(() => {
    if (!isEmbed) return;
    if (appliedRef.current) return;

    const hasNetworkConstraint =
      networkAllowlist != null ||
      defaultNetwork != null ||
      networkLockUnresolved;
    if (!hasNetworkConstraint) return;

    appliedRef.current = true;

    if (defaultNetwork) {
      setDisplayedNetwork(defaultNetwork);
      return;
    }

    if (networkLockUnresolved && !urlToastRef.current) {
      urlToastRef.current = true;
      toast.error("Unsupported network", {
        description:
          "The network from the embed URL is not supported. Keeping the default network.",
      });
    }
  }, [
    isEmbed,
    networkAllowlist,
    defaultNetwork,
    networkLockUnresolved,
    setDisplayedNetwork,
  ]);

  // Host → widget live config updates.
  useEffect(() => {
    if (!isEmbed || !parentOrigin) return;

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== parentOrigin) return;
      if (event.source !== window.parent) return;
      const data = event.data;
      if (!data || data.source !== "noblocks-host") return;
      if (data.event !== "noblocks:set_config") return;

      const payload =
        data.payload && typeof data.payload === "object" ? data.payload : {};
      const result = applyHostConfig(payload);

      if (result.network) {
        setDisplayedNetwork(result.network);
      }

      if (result.rejected.length > 0) {
        toast.error("Unsupported configuration", {
          description: `Host update ignored for: ${result.rejected.join(", ")}.`,
        });
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [isEmbed, parentOrigin, applyHostConfig, setDisplayedNetwork]);

  // Injected / bridge wallet chain switches → update + keep locked (within allowlist).
  useEffect(() => {
    if (!isEmbed || !injectedProvider?.on) return;

    const handleChainChanged = (chainId: unknown) => {
      const network = resolveNetworkByChainId(
        typeof chainId === "string" || typeof chainId === "number"
          ? chainId
          : String(chainId ?? ""),
      );
      if (network && isNetworkInAllowlist(network, networkAllowlist)) {
        setDisplayedNetwork(network);
        lockNetworkFromWallet();
        unsupportedChainToastRef.current = false;
        return;
      }

      if (!unsupportedChainToastRef.current) {
        unsupportedChainToastRef.current = true;
        toast.error("Unsupported network", {
          description: network
            ? "Your wallet switched to a network outside this embed’s allowlist."
            : "Your wallet switched to a network Noblocks does not support yet.",
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
    networkAllowlist,
  ]);

  return null;
}
