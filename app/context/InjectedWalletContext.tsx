"use client";
import {
  ReactNode,
  createContext,
  useContext,
  useState,
  useEffect,
  Suspense,
} from "react";
import { createWalletClient, custom } from "viem";
import { toast } from "sonner";
import { useSearchParams } from "next/navigation";
import { shouldUseInjectedWallet } from "../utils";
import { sdk } from "@farcaster/miniapp-sdk";

interface InjectedWalletContextType {
  isInjectedWallet: boolean;
  injectedAddress: string | null;
  injectedProvider: any | null;
  injectedReady: boolean;
}

const InjectedWalletContext = createContext<InjectedWalletContextType>({
  isInjectedWallet: false,
  injectedAddress: null,
  injectedProvider: null,
  injectedReady: false,
});

function InjectedWalletProviderContent({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const [isInjectedWallet, setIsInjectedWallet] = useState(false);
  const [injectedAddress, setInjectedAddress] = useState<string | null>(null);
  const [injectedProvider, setInjectedProvider] = useState<any | null>(null);
  const [injectedReady, setInjectedReady] = useState(false);

  useEffect(() => {
    const initInjectedWallet = async () => {
      // Check if we should use the injected wallet
      const shouldUse = shouldUseInjectedWallet(searchParams);

      setIsInjectedWallet(shouldUse);

      if (shouldUse) {
        try {
          let ethereumProvider = window.ethereum;
          let client;

          // Try to use Farcaster SDK's Ethereum provider first
          try {
            const farcasterProvider = await sdk.wallet.getEthereumProvider();
            if (farcasterProvider) {
              ethereumProvider = farcasterProvider;
              console.log("Using Farcaster SDK Ethereum provider");
            }
          } catch (farcasterError) {
            console.warn(
              "Farcaster SDK provider not available, falling back to window.ethereum:",
              farcasterError,
            );
          }

          if (!ethereumProvider) {
            throw new Error("No Ethereum provider available");
          }

          client = createWalletClient({
            transport: custom(ethereumProvider as any),
          });

          // Add a small delay to ensure provider is ready
          await new Promise((resolve) => setTimeout(resolve, 100));

          await (ethereumProvider as any).request({
            method: "eth_requestAccounts",
          });
          const [address] = await client.getAddresses();

          if (address) {
            setInjectedProvider(ethereumProvider);
            setInjectedAddress(address);
            setInjectedReady(true);
            console.log("Successfully connected to wallet:", address);
          } else {
            console.warn("No address returned from injected wallet.");
            toast.error(
              "Couldn't connect to your wallet. Please check your wallet connection.",
            );
            setIsInjectedWallet(false);
          }
        } catch (error) {
          console.error("Failed to initialize injected wallet:", error);

          if ((error as any)?.code === 4001) {
            toast.error("Connection to wallet was rejected.", {
              description: "Proceeding without wallet connection.",
            });
            // Reset injected wallet state on rejection
            setIsInjectedWallet(false);
            setInjectedProvider(null);
            setInjectedAddress(null);
            setInjectedReady(false);
          } else if ((error as any)?.message?.includes("User rejected")) {
            toast.error("Wallet connection was cancelled by user.", {
              description: "You can try connecting again later.",
            });
            setIsInjectedWallet(false);
          } else {
            toast.error(
              "Failed to connect to wallet. Please refresh and try again.",
              {
                description: "If the problem persists, try restarting the app.",
              },
            );
            setIsInjectedWallet(false);
          }
        }
      }
    };

    // Add a small delay to ensure the page is fully loaded
    const timeoutId = setTimeout(initInjectedWallet, 200);

    return () => clearTimeout(timeoutId);
  }, [searchParams]);

  return (
    <InjectedWalletContext.Provider
      value={{
        isInjectedWallet,
        injectedAddress,
        injectedProvider,
        injectedReady,
      }}
    >
      {children}
    </InjectedWalletContext.Provider>
  );
}

export const InjectedWalletProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  return (
    <Suspense fallback={null}>
      <InjectedWalletProviderContent>{children}</InjectedWalletProviderContent>
    </Suspense>
  );
};

export const useInjectedWallet = () => useContext(InjectedWalletContext);
