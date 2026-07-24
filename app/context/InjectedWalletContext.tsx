"use client";
import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useState,
  useEffect,
  useRef,
  Suspense,
} from "react";
import { createWalletClient, custom, toHex } from "viem";
import { createSiweMessage, generateSiweNonce } from "viem/siwe";
import { toast } from "sonner";
import { useSearchParams } from "next/navigation";
import { shouldUseInjectedWallet } from "../utils";
import {
  createBridgeProvider,
  BRIDGE_UNAVAILABLE_CODE,
} from "../lib/embed-bridge-provider";
import { useEmbed } from "./EmbedContext";

export interface InjectedTokenOptions {
  /**
   * When true, a missing/expired session triggers the SIWE sign-in flow (one
   * wallet signature popup). Default false: background fetches get null and
   * skip silently, so popups only ever fire from explicit user actions.
   */
  interactive?: boolean;
}

interface InjectedWalletContextType {
  isInjectedWallet: boolean;
  injectedAddress: string | null;
  injectedProvider: any | null;
  injectedReady: boolean;
  /**
   * Session JWT for authenticating API requests (middleware `x-injected-token`).
   * A connected wallet alone does NOT authenticate API calls — the wallet must
   * sign a SIWE challenge once, exchanged server-side for this token. Returns
   * null when unauthenticated (and non-interactive, or the user rejected).
   */
  getInjectedToken: (opts?: InjectedTokenOptions) => Promise<string | null>;
  /** Convenience: `{ "x-injected-token": <jwt> }` or null. */
  getInjectedAuthHeaders: (
    opts?: InjectedTokenOptions,
  ) => Promise<Record<string, string> | null>;
}

const InjectedWalletContext = createContext<InjectedWalletContextType>({
  isInjectedWallet: false,
  injectedAddress: null,
  injectedProvider: null,
  injectedReady: false,
  getInjectedToken: async () => null,
  getInjectedAuthHeaders: async () => null,
});

function InjectedWalletProviderContent({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const { parentOrigin } = useEmbed();
  const [isInjectedWallet, setIsInjectedWallet] = useState(false);
  const [injectedAddress, setInjectedAddress] = useState<string | null>(null);
  const [injectedProvider, setInjectedProvider] = useState<any | null>(null);
  const [injectedReady, setInjectedReady] = useState(false);

  // SIWE session (memory only — a refresh costs one re-sign; nothing persisted
  // for theft). Refs, not state: the token is read via the async getter, and
  // storing it in state would re-render the whole provider tree on sign-in.
  const sessionRef = useRef<{ token: string; expiresAt: number } | null>(null);
  const signInFlightRef = useRef<Promise<string | null> | null>(null);

  /** Run the SIWE challenge: build message, personal_sign, exchange for a JWT. */
  const performSiweSignIn = useCallback(async (): Promise<string | null> => {
    try {
      const address = injectedAddress as `0x${string}`;
      const chainIdHex = await injectedProvider.request({
        method: "eth_chainId",
      });
      const chainId = Number(chainIdHex);
      if (!Number.isInteger(chainId) || chainId <= 0) {
        throw new Error("Could not determine the wallet's network");
      }

      // In embed-bridge mode the HOST page's wallet signs, and honest wallets
      // (e.g. MetaMask's SIWE parser) compare the message domain against the
      // page the user is on — so the domain must be the partner origin, which
      // the server checks against the same allowlist that gates iframing.
      const domain =
        injectedProvider.isNoblocksBridge && parentOrigin
          ? new URL(parentOrigin).host
          : window.location.host;

      const message = createSiweMessage({
        address,
        chainId,
        domain,
        nonce: generateSiweNonce(),
        uri: window.location.origin,
        version: "1",
        statement:
          "Sign in to Noblocks with your wallet. This request will not trigger a blockchain transaction or cost any gas.",
      });

      const signature = await injectedProvider.request({
        method: "personal_sign",
        params: [toHex(message), address],
      });

      const res = await fetch("/api/auth/injected/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, signature }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.token) {
        toast.error("Wallet sign-in failed", {
          description: data?.error || "Please try again.",
        });
        return null;
      }

      sessionRef.current = { token: data.token, expiresAt: data.expiresAt };
      return data.token;
    } catch (error) {
      if ((error as any)?.code === 4001) {
        toast.error("Signature request was rejected.", {
          description: "Sign the message in your wallet to continue.",
        });
      } else {
        console.error("Injected wallet sign-in failed:", error);
        toast.error("Wallet sign-in failed. Please try again.");
      }
      return null;
    }
  }, [injectedAddress, injectedProvider, parentOrigin]);

  const getInjectedToken = useCallback(
    async (opts?: InjectedTokenOptions): Promise<string | null> => {
      if (
        !isInjectedWallet ||
        !injectedReady ||
        !injectedAddress ||
        !injectedProvider
      ) {
        return null;
      }
      // Treat as expired 60s early so a token can't lapse mid-request.
      const session = sessionRef.current;
      if (session && Date.now() < session.expiresAt - 60_000) {
        return session.token;
      }
      if (!opts?.interactive) return null;
      // Single-flight: concurrent interactive callers share one wallet popup.
      if (!signInFlightRef.current) {
        signInFlightRef.current = performSiweSignIn().finally(() => {
          signInFlightRef.current = null;
        });
      }
      return signInFlightRef.current;
    },
    [
      isInjectedWallet,
      injectedReady,
      injectedAddress,
      injectedProvider,
      performSiweSignIn,
    ],
  );

  const getInjectedAuthHeaders = useCallback(
    async (opts?: InjectedTokenOptions) => {
      const token = await getInjectedToken(opts);
      return token ? { "x-injected-token": token } : null;
    },
    [getInjectedToken],
  );

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
            console.warn("No address returned from injected wallet.");
            toast.error(
              "Couldn't connect to your wallet. Please check your wallet connection.",
            );
            setIsInjectedWallet(false);
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
      // Any account change invalidates the SIWE session — the token asserts
      // the OLD address's identity. The next authed action re-prompts.
      sessionRef.current = null;
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
        getInjectedToken,
        getInjectedAuthHeaders,
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
