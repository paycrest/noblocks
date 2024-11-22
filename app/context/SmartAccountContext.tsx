import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { useWallets } from "@privy-io/react-auth";
import { createNexusClient, createBicoPaymasterClient } from "@biconomy/sdk";
import { http } from "viem";
import { base } from "viem/chains";
import config from "../lib/config";

type SmartAccountContextType = {
  smartWallet: any;
  isInitializing: boolean;
  error: Error | null;
};

const SmartAccountContext = createContext<SmartAccountContextType | undefined>(
  undefined,
);

export function SmartAccountProvider({ children }: { children: ReactNode }) {
  const [smartWallet, setSmartWallet] = useState<any>();
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const { wallets } = useWallets();
  const embeddedWallet = wallets.find(
    (wallet) => wallet.walletClientType === "privy",
  );

  const { bundlerUrl, paymasterUrl } = config;

  useEffect(() => {
    const initializeSmartAccount = async () => {
      if (!embeddedWallet) return;

      try {
        const provider = await embeddedWallet.getEthersProvider();
        const signer = provider?.getSigner() as any;

        if (!signer) {
          throw new Error("Signer is undefined");
        }

        const nexusClient = await createNexusClient({
          signer,
          chain: base,
          transport: http(),
          bundlerTransport: http(bundlerUrl),
          paymaster: createBicoPaymasterClient({ paymasterUrl }),
        });

        setSmartWallet(nexusClient.account);

        // TODO: remove console.log
        console.log("Smart account initialized: ", nexusClient.account);

        setError(null);
      } catch (err) {
        setError(
          err instanceof Error
            ? err
            : new Error("Failed to initialize smart account"),
        );
        console.error("Failed to initialize smart account: ", err);
      } finally {
        setIsInitializing(false);
      }
    };

    initializeSmartAccount();
  }, [embeddedWallet, bundlerUrl, paymasterUrl]);

  return (
    <SmartAccountContext.Provider
      value={{ smartWallet, isInitializing, error }}
    >
      {children}
    </SmartAccountContext.Provider>
  );
}

export function useSmartAccount() {
  const context = useContext(SmartAccountContext);
  if (context === undefined) {
    throw new Error(
      "useSmartAccount must be used within a SmartAccountProvider",
    );
  }
  return context;
}
