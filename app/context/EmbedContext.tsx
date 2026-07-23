"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  Suspense,
  type ReactNode,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  hasEmbedNetworkLockParams,
  resolveNetworkFromEmbedParams,
} from "../lib/embed-network";

/**
 * Embed (widget) mode context.
 *
 * Active on the /widget route, which partners iframe from whitelisted origins
 * (see middleware.ts). Exposes a postMessage channel to the host page:
 *   noblocks:ready   - widget mounted
 *   noblocks:resize  - { height } content height changed
 *   noblocks:tx_status - { status, orderId } transaction progress
 *
 * Closing / dismissing the iframe is owned by the host page — the widget
 * does not emit a close event.
 *
 * Hosts can lock the widget to a network via `?chainId=` / `?network=`, or by
 * switching an injected/bridge wallet (chainChanged). See docs/embed-widget.md.
 *
 * The host origin is derived from document.referrer (the embedding page on an
 * iframe's first load). If the host strips its referrer entirely, events are
 * not sent — we never postMessage to "*" because payloads can include order
 * details. The wallet bridge (embed-bridge-provider.ts) shares parentOrigin.
 */

export const isEmbedPath = (pathname: string | null): boolean =>
  pathname === "/widget" || (pathname ?? "").startsWith("/widget/");

interface EmbedContextType {
  /** True when rendering the /widget embed route. */
  isEmbed: boolean;
  /** Origin of the embedding page, or null when unknown / not framed. */
  parentOrigin: string | null;
  /** Send an event to the host page. No-op outside an iframe. */
  postToHost: (event: string, payload?: unknown) => void;
  /**
   * True when the widget network picker is locked (URL `chainId`/`network`,
   * or a successful wallet-driven lock via chainChanged).
   */
  isNetworkLocked: boolean;
  /**
   * True when URL lock params were present but did not resolve to a supported
   * network — picker stays locked; widget keeps last valid / default network.
   */
  networkLockUnresolved: boolean;
  /** Mark the network as locked after a successful wallet chainChanged follow. */
  lockNetworkFromWallet: () => void;
}

const EmbedContext = createContext<EmbedContextType>({
  isEmbed: false,
  parentOrigin: null,
  postToHost: () => {},
  isNetworkLocked: false,
  networkLockUnresolved: false,
  lockNetworkFromWallet: () => {},
});

function EmbedProviderContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isEmbed = isEmbedPath(pathname);
  const [parentOrigin, setParentOrigin] = useState<string | null>(null);
  const [walletNetworkLocked, setWalletNetworkLocked] = useState(false);

  const urlLockRequested = isEmbed && hasEmbedNetworkLockParams(searchParams);
  const urlResolvedNetwork = useMemo(
    () =>
      isEmbed && urlLockRequested
        ? resolveNetworkFromEmbedParams(searchParams)
        : null,
    [isEmbed, urlLockRequested, searchParams],
  );

  const networkLockUnresolved =
    urlLockRequested && urlResolvedNetwork === null;
  const isNetworkLocked =
    isEmbed && (urlLockRequested || walletNetworkLocked);

  const lockNetworkFromWallet = useCallback(() => {
    if (!isEmbed) return;
    setWalletNetworkLocked(true);
  }, [isEmbed]);

  useEffect(() => {
    if (!isEmbed || window.self === window.top) return;
    try {
      const origin = new URL(document.referrer).origin;
      if (origin && origin !== "null") setParentOrigin(origin);
    } catch {
      // Host sends no referrer - stay silent rather than posting to "*".
    }
  }, [isEmbed]);

  const postToHost = useCallback(
    (event: string, payload?: unknown) => {
      if (!parentOrigin || window.self === window.top) return;
      window.parent.postMessage(
        { source: "noblocks", event, payload },
        parentOrigin,
      );
    },
    [parentOrigin],
  );

  useEffect(() => {
    if (!isEmbed || !parentOrigin) return;
    postToHost("noblocks:ready");

    const observer = new ResizeObserver(() => {
      postToHost("noblocks:resize", {
        height: document.documentElement.scrollHeight,
      });
    });
    observer.observe(document.body);
    return () => observer.disconnect();
  }, [isEmbed, parentOrigin, postToHost]);

  const value = useMemo(
    () => ({
      isEmbed,
      parentOrigin,
      postToHost,
      isNetworkLocked,
      networkLockUnresolved,
      lockNetworkFromWallet,
    }),
    [
      isEmbed,
      parentOrigin,
      postToHost,
      isNetworkLocked,
      networkLockUnresolved,
      lockNetworkFromWallet,
    ],
  );

  return (
    <EmbedContext.Provider value={value}>{children}</EmbedContext.Provider>
  );
}

export function EmbedProvider({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <EmbedProviderContent>{children}</EmbedProviderContent>
    </Suspense>
  );
}

export const useEmbed = () => useContext(EmbedContext);
