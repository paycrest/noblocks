import React, { createContext, useState, useContext, useEffect } from "react";
import { networks } from "../mocks";
import { trackEvent } from "../hooks/analytics";

type Network = {
  chain: any;
  imageUrl: string;
};

type NetworkContextType = {
  selectedNetwork: Network;
  setSelectedNetwork: (network: Network) => void;
};

const STORAGE_KEY = "selectedNetwork";

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

const defaultNetwork =
  networks.find((network) => network.chain.name === "Base") || networks[0];

const getStoredNetwork = (): Network => {
  const storedNetworkName = localStorage.getItem(STORAGE_KEY);
  if (storedNetworkName) {
    const network = networks.find((n) => n.chain.name === storedNetworkName);
    if (network) return network;
  }
  return defaultNetwork;
};

const setStoredNetwork = (network: Network) => {
  localStorage.setItem(STORAGE_KEY, network.chain.name);
};

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [selectedNetwork, setSelectedNetwork] = useState(defaultNetwork);

  const handleNetworkChange = (network: Network) => {
    setSelectedNetwork(network);
    setStoredNetwork(network);
    trackEvent("network_switched", { network: network.chain.name });
  };

  useEffect(() => {
    const preferredNetwork = getStoredNetwork();
    setSelectedNetwork(preferredNetwork);
  }, []);

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
