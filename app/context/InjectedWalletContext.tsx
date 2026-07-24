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
import {
  createBridgeProvider,
  BRIDGE_UNAVAILABLE_CODE,
} from "../lib/embed-bridge-provider";
import { useEmbed } from "./EmbedContext";

/**
 * "pending" covers the whole connect handshake (bridge origin resolution, the
 * host ACK wait, eth_requestAccounts). "unavailable" means the connection was
 * requested but definitively failed — only then should the widget offer its
 * own login as a fallback.
 */
export type InjectedWalletStatus =
  | "idle"
  | "pending"
  | "connected"
  | "unavailable";

interface InjectedWalletContextType {
  isInjectedWallet: boolean;
  injectedAddress: string | null;
  injectedProvider: any | null;
  injectedReady: boolean;
  /** Synchronous: the URL asked for an injected wallet (?injected=true|bridge). */
  injectedRequested: boolean;
  injectedStatus: InjectedWalletStatus;
}

const InjectedWalletContext = createContext<InjectedWalletContextType>({
  isInjectedWallet: false,
  injectedAddress: null,
  injectedProvider: null,
  injectedReady: false,
  injectedRequested: false,
  injectedStatus: "idle",
});

function InjectedWalletProviderContent({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const { parentOrigin, parentOriginResolved } = useEmbed();
  const [isInjectedWallet, setIsInjectedWallet] = useState(false);
  const [injectedAddress, setInjectedAddress] = useState<string | null>(null);
  const [injectedProvider, setInjectedProvider] = useState<any | null>(null);
  const [injectedReady, setInjectedReady] = useState(false);
  const [injectedStatus, setInjectedStatus] =
    useState<InjectedWalletStatus>("idle");

  const injectedParam = searchParams.get("injected");
  const injectedRequested =
    injectedParam === "true" || injectedParam === "bridge";

  useEffect(() => {
    const initInjectedWallet = async () => {
      if (!injectedRequested) {
        setInjectedStatus("idle");
        return;
      }

      const useBridge = injectedParam === "bridge";

      // Bridge mode needs the host origin (from the iframe referrer) before it
      // can talk to the host wallet. Stay pending until the referrer has been
      // read — this effect runs before EmbedContext's mount effect, so a null
      // origin here is "not yet", not "never".
      if (useBridge && !parentOriginResolved) {
        setInjectedStatus("pending");
        return;
      }
      if (useBridge && !parentOrigin) {
        // Host stripped its referrer, or the widget isn't framed at all: the
        // bridge can never be reached, so offer the standard login instead.
        setIsInjectedWallet(false);
        setInjectedStatus("unavailable");
        return;
      }

      const provider = useBridge
        ? createBridgeProvider(parentOrigin as string)
        : window.ethereum;

      if (!useBridge && !shouldUseInjectedWallet(searchParams)) {
        // ?injected=true with no extension wallet present.
        setIsInjectedWallet(false);
        setInjectedStatus("unavailable");
        return;
      }

      setIsInjectedWallet(true);
      setInjectedStatus("pending");

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
          setInjectedStatus("connected");
        } else {
          console.warn("No address returned from injected wallet.");
          toast.error(
            "Couldn't connect to your wallet. Please check your wallet connection.",
          );
          setIsInjectedWallet(false);
          setInjectedStatus("unavailable");
        }
      } catch (error) {
        if ((error as any)?.code === BRIDGE_UNAVAILABLE_CODE) {
          // ?injected=bridge but no host bridge answered (plain iframe
          // embed without embed.js/bindWallet). Quietly fall back to the
          // standard login flow — no error toast, this is a supported
          // partner misconfiguration/choice, not a user-facing failure.
          console.warn(
            "No host wallet bridge detected; falling back to standard login.",
          );
          setIsInjectedWallet(false);
          setInjectedProvider(null);
          setInjectedAddress(null);
          setInjectedReady(false);
          setInjectedStatus("unavailable");
          return;
        }

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
          toast.error(
            "Failed to connect to wallet. Please refresh and try again.",
          );
          setIsInjectedWallet(false);
        }
        setInjectedStatus("unavailable");
      }
    };

    initInjectedWallet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, parentOrigin, parentOriginResolved]);

  // Track host-side account switches (extension wallets and the embed bridge
  // both emit standard EIP-1193 events).
  useEffect(() => {
    if (!injectedProvider?.on) return;
    const handleAccountsChanged = (accounts: unknown) => {
      const [address] = (accounts as string[]) ?? [];
      if (address) {
        setInjectedAddress(address);
        setInjectedStatus("connected");
      } else {
        setInjectedAddress(null);
        setInjectedReady(false);
        // Host disconnected the wallet — let the widget offer its own login.
        setInjectedStatus("unavailable");
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
        injectedRequested,
        injectedStatus,
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
