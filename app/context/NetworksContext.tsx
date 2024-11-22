import React, {
  createContext,
  useState,
  useContext,
  ReactNode,
  useEffect,
} from "react";
import { networks } from "../mocks";
import { useWallets } from "@privy-io/react-auth";
import config from "../lib/config";
import { createNexusClient, createBicoPaymasterClient } from "@biconomy/sdk";
import { http } from "viem";
import { base } from "viem/chains";

type Network = {
  name: string;
  chainId: number;
  imageUrl: string;
  address: string;
};

type NetworkContextType = {
  selectedNetwork: Network;
  setSelectedNetwork: (network: Network) => void;
  smartWallet: any;
};

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

const defaultNetwork =
  networks.find((network) => network.name === "Base") || networks[0];

export const NetworkProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [selectedNetwork, setSelectedNetwork] = useState(defaultNetwork);
  const [smartWallet, setSmartWallet] = useState<any>();

  const { wallets } = useWallets();
  const embeddedWallet = wallets.find(
    (wallet) => wallet.walletClientType === "privy",
  );

  const { bundlerUrl, paymasterUrl } = config;

  useEffect(() => {
    const initializeSmartAccount = async () => {
      const provider = await embeddedWallet?.getEthersProvider();
      const signer = provider?.getSigner() as any;

      if (signer) {
        try {
          const nexusClient = await createNexusClient({
            signer,
            chain: base,
            transport: http(),
            bundlerTransport: http(bundlerUrl),
            paymaster: createBicoPaymasterClient({ paymasterUrl }),
          });
          const smartAccount = nexusClient.account;
          setSmartWallet(smartAccount);
        } catch (error) {
          console.error("Failed to initialize smart account: ", error);
        }
      } else {
        console.error("Signer is undefined");
      }
    };

    if (embeddedWallet) {
      initializeSmartAccount();
    }
  }, [embeddedWallet, embeddedWallet?.getEthersProvider]);

  return (
    <NetworkContext.Provider
      value={{ selectedNetwork, setSelectedNetwork, smartWallet }}
    >
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
