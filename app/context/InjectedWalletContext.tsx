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
import { reportClientError } from "../lib/sentry.client";

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

      if (shouldUse && window.ethereum) {
        try {
          const client = createWalletClient({
            transport: custom(window.ethereum as any),
          });

          await (window.ethereum as any).request({ method: "eth_requestAccounts" });
          const [address] = await client.getAddresses();

          if (address) {
            setInjectedProvider(window.ethereum);
            setInjectedAddress(address);
            setInjectedReady(true);
          } else {
            reportClientError(
              new Error("Injected wallet did not return an address"),
              {
                feature: "onboarding",
                flow: "wallet",
                step: "injected-wallet-init",
                networkError: false,
              },
            );
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
          } else {
            reportClientError(error, {
              feature: "onboarding",
              flow: "wallet",
              step: "injected-wallet-init",
              networkError: true,
              errorCode:
                typeof (error as { code?: unknown })?.code === "number"
                  ? (error as { code?: number }).code
                  : undefined,
            });
            toast.error(
              "Failed to connect to wallet. Please refresh and try again.",
            );
            setIsInjectedWallet(false);
          }
        }
      }
    };

    initInjectedWallet();
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
