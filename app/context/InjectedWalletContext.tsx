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
import type { EIP1193Provider } from "viem";

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
  const [injectedProvider, setInjectedProvider] =
    useState<EIP1193Provider | null>(null);

  const [injectedReady, setInjectedReady] = useState(false);

  useEffect(() => {
    let checkProvider: ReturnType<typeof setInterval> | null = null;

    const initInjectedWallet = async () => {
      const shouldUse = shouldUseInjectedWallet(searchParams);
      setIsInjectedWallet(shouldUse);

      if (!shouldUse) return;

      let attempts = 0;
      const maxAttempts = 10;

      checkProvider = setInterval(async () => {
        attempts;

        if (window.ethereum) {
          if (checkProvider) clearInterval(checkProvider);

          try {
            const client = createWalletClient({
              transport: custom(window.ethereum as any),
            });

            await (window.ethereum as any).request({
              method: "eth_requestAccounts",
            });
            const [address] = await client.getAddresses();

            if (address) {
              //@ts-ignore
              setInjectedProvider(window.ethereum);
              setInjectedAddress(address);
              setInjectedReady(true);
            } else {
              console.warn("No address returned from injected wallet.");
              toast.error("Couldn't connect to your wallet.");
              setIsInjectedWallet(false);
            }
          } catch (error) {
            console.error("Failed to initialize injected wallet:", error);
            toast.error("Failed to connect to wallet. Please refresh.");
            setIsInjectedWallet(false);
          }
        }

        if (attempts >= maxAttempts) {
          if (checkProvider) {
            clearInterval(checkProvider);
          }

          console.error("⏳ Wallet provider not found after retries.");
          toast.error("Wallet provider not found.");
        }
      }, 500); // retry every 0.5s
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
