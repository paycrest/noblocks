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
import { createBridgeProvider } from "../lib/embed-bridge-provider";
import { useEmbed } from "./EmbedContext";

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
  const { parentOrigin } = useEmbed();
  const [isInjectedWallet, setIsInjectedWallet] = useState(false);
  const [injectedAddress, setInjectedAddress] = useState<string | null>(null);
  const [injectedProvider, setInjectedProvider] = useState<any | null>(null);
  const [injectedReady, setInjectedReady] = useState(false);

  useEffect(() => {
    const initInjectedWallet = async () => {
      // Check if we should use the injected wallet
      const useBridge = searchParams.get("injected") === "bridge";
      // Bridge mode needs the host origin (from the iframe referrer) before
      // it can talk to the host wallet; until then fall back to the regular
      // logged-out UI rather than blocking on the preloader.
      const shouldUse = useBridge
        ? Boolean(parentOrigin)
        : shouldUseInjectedWallet(searchParams);

      setIsInjectedWallet(shouldUse);

      const provider = useBridge
        ? parentOrigin
          ? createBridgeProvider(parentOrigin)
          : null
        : window.ethereum;

      if (shouldUse && provider) {
        try {
          const client = createWalletClient({
            transport: custom(provider as any),
          });

          await (provider as any).request({ method: "eth_requestAccounts" });
          const [address] = await client.getAddresses();

          if (address) {
            setInjectedProvider(provider);
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
  }, [searchParams, parentOrigin]);

  // Track host-side account switches (extension wallets and the embed bridge
  // both emit standard EIP-1193 events).
  useEffect(() => {
    if (!injectedProvider?.on) return;
    const handleAccountsChanged = (accounts: unknown) => {
      const [address] = (accounts as string[]) ?? [];
      if (address) {
        setInjectedAddress(address);
      } else {
        setInjectedAddress(null);
        setInjectedReady(false);
      }
    };
    injectedProvider.on("accountsChanged", handleAccountsChanged);
    return () => {
      injectedProvider.removeListener?.(
        "accountsChanged",
        handleAccountsChanged,
      );
    };
  }, [injectedProvider]);

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
