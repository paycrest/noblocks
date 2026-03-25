"use client";
import {
  ReactNode,
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  Suspense,
} from "react";
import { createWalletClient, custom } from "viem";
import { toast } from "sonner";
import { useSearchParams } from "next/navigation";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { shouldUseInjectedWallet } from "../utils";

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
  const { ready, user } = usePrivy();
  const { wallets } = useWallets();
  const [isInjectedWallet, setIsInjectedWallet] = useState(false);
  const [injectedAddress, setInjectedAddress] = useState<string | null>(null);
  const [injectedProvider, setInjectedProvider] = useState<any | null>(null);
  const [injectedReady, setInjectedReady] = useState(false);

  // Track whether the URL param flow is active so the Privy detection doesn't conflict
  const urlParamActive = useRef(false);

  // Flow 1: URL param ?injected=true (existing behavior)
  useEffect(() => {
    const initInjectedWallet = async () => {
      const shouldUse = shouldUseInjectedWallet(searchParams);

      urlParamActive.current = shouldUse;
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
            setIsInjectedWallet(false);
            setInjectedProvider(null);
            setInjectedAddress(null);
            setInjectedReady(false);
          } else {
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

  // Flow 2: Privy external-wallet-only users (no embedded wallet created)
  useEffect(() => {
    if (urlParamActive.current) return;

    // User logged out — reset state
    if (ready && !user) {
      setIsInjectedWallet(false);
      setInjectedAddress(null);
      setInjectedProvider(null);
      setInjectedReady(false);
      return;
    }

    if (!ready || !user || wallets.length === 0) return;

    const hasEmbeddedWallet = wallets.some(
      (wallet) => wallet.walletClientType === "privy",
    );
    const externalWallet = wallets.find(
      (wallet) => wallet.walletClientType !== "privy",
    );

    // Only activate if user has an external wallet but no embedded wallet
    if (hasEmbeddedWallet || !externalWallet) {
      return;
    }

    const initPrivyExternalWallet = async () => {
      try {
        const provider = await externalWallet.getEthereumProvider();
        setInjectedProvider(provider);
        setInjectedAddress(externalWallet.address);
        setIsInjectedWallet(true);
        setInjectedReady(true);
      } catch (error) {
        console.error("Failed to initialize Privy external wallet:", error);
        setIsInjectedWallet(false);
      }
    };

    initPrivyExternalWallet();
  }, [ready, user, wallets]);

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
