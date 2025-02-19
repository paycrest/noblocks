import React, { createContext, useState, useContext, useEffect } from "react";
import { networks } from "../mocks";

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

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [selectedNetwork, setSelectedNetwork] = useState(networks[0]);

  const handleNetworkChange = (network: Network) => {
    setSelectedNetwork(network);
    setStoredNetwork(network);
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
