import React, { createContext, useState, useContext, ReactNode } from "react";
import { networks } from "../mocks";

type Network = {
  name: string;
  chainId: number;
  imageUrl: string;
};

type NetworkContextType = {
  selectedNetwork: Network;
  setSelectedNetwork: (network: Network) => void;
};

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

const defaultNetwork =
  networks.find((network) => network.name === "Base") || networks[0];

export const NetworkProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [selectedNetwork, setSelectedNetwork] = useState(defaultNetwork);

  return (
    <NetworkContext.Provider value={{ selectedNetwork, setSelectedNetwork }}>
      {children}
    </NetworkContext.Provider>
  );
};

export const useNetwork = () => {
  const context = useContext(NetworkContext);
  if (context === undefined) {
    throw new Error("useNetwork must be used within a NetworkProvider");
  }
  return context;
};
