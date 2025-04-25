import React, { createContext, useState, useContext, useEffect } from "react";
import { networks } from "../mocks";
import type { Network } from "../types";
import { useInjectedWallet } from "./InjectedWalletContext";

type NetworkContextType = {
  selectedNetwork: Network;
  setSelectedNetwork: (network: Network) => void;
};

const STORAGE_KEY = "selectedNetwork";

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

const getStoredNetwork = (): Network => {
  const storedNetworkName = localStorage.getItem(STORAGE_KEY);
  if (storedNetworkName) {
    const network = networks.find((n) => n.chain.name === storedNetworkName);
    if (network) return network;
  }
  return networks[0];
};

const setStoredNetwork = (network: Network) => {
  localStorage.setItem(STORAGE_KEY, network.chain.name);
};

const switchNetwork = async (network: Network) => {
  if (typeof window.ethereum !== "undefined") {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${network.chain.id.toString(16)}` }],
      });
      return true;
    } catch (error) {
      console.error("Failed to switch network:", error);
      return false;
    }
  }
  return false;
};

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [selectedNetwork, setSelectedNetwork] = useState<Network>(networks[0]);
  const { isInjectedWallet, injectedReady } = useInjectedWallet();

  const handleNetworkChange = async (network: Network) => {
    if (isInjectedWallet && injectedReady) {
      const switched = await switchNetwork(network);
      if (switched) {
        setSelectedNetwork(network);
        setStoredNetwork(network);
      }
    } else {
      setSelectedNetwork(network);
      setStoredNetwork(network);
    }
  };

  useEffect(() => {
    const initNetwork = async () => {
      const preferredNetwork = getStoredNetwork();
      await handleNetworkChange(preferredNetwork);
    };

    if (injectedReady || !isInjectedWallet) {
      initNetwork();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInjectedWallet, injectedReady]);

  // cross-tab synchronization
  const onStorageUpdate = () => {
    const storedNetwork = getStoredNetwork();
    handleNetworkChange(storedNetwork);
  };

  useEffect(() => {
    window.addEventListener("storage", onStorageUpdate);
    return () => {
      window.removeEventListener("storage", onStorageUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <NetworkContext.Provider
      value={{ selectedNetwork, setSelectedNetwork: handleNetworkChange }}
    >
      {children}
    </NetworkContext.Provider>
  );
}

export const useNetwork = () => {
  const context = useContext(NetworkContext);
  if (context === undefined) {
    throw new Error("useNetwork must be used within a NetworkProvider");
  }
  return context;
};
