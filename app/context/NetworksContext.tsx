import React, { createContext, useState, useContext } from "react";
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

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

const defaultNetwork =
  networks.find((network) => network.chain.name === "Base") || networks[0];

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [selectedNetwork, setSelectedNetwork] = useState(defaultNetwork);

  const handleNetworkChange = (network: Network) => {
    setSelectedNetwork(network);
    trackEvent("network_switched", { network: network.chain.name });
  };

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
