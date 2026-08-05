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
import type { Network } from "../types";
import {
  parseEmbedConfig,
  isTokenInAllowlist,
  isCurrencyInAllowlist,
  type HostSetConfigPayload,
} from "../lib/embed-config";
import {
  isNetworkInAllowlist,
  resolveNetworkBySlug,
} from "../lib/embed-network";
import {
  canonicalTokenSymbol,
  tokensEqual,
} from "../lib/token-symbol";
import { swapModeFromSideParam } from "../utils";
import { computeEmbedCode } from "../lib/embedCode";

/**
 * Embed (widget) mode context.
 *
 * Active on the /widget route, which partners iframe from whitelisted origins
 * (see middleware.ts). Exposes a postMessage channel to the host page:
 *   noblocks:ready   - widget mounted
 *   noblocks:resize  - { height } content height changed
 *   noblocks:tx_status - { status, orderId } transaction progress
 *
 * Hosts can constrain token/currency/network via URL allowlists, hide the
 * Buy/Sell chrome, and push live updates with `noblocks:set_config`.
 * See docs/embed-widget.md.
 *
 * The host origin is derived from document.referrer (the embedding page on an
 * iframe's first load). If the host strips its referrer entirely, events are
 * not sent — we never postMessage to "*" because payloads can include order
 * details. The wallet bridge (embed-bridge-provider.ts) shares parentOrigin.
 */

export const isEmbedPath = (pathname: string | null): boolean =>
  pathname === "/widget" || (pathname ?? "").startsWith("/widget/");

/** Live overrides from host `noblocks:set_config` (and version for effect deps). */
export type EmbedHostFormConfig = {
  token?: string;
  currency?: string;
  side?: "buy" | "sell";
  version: number;
};

export type ApplyHostConfigResult = {
  network: Network | null;
  applied: Partial<{
    token: string;
    currency: string;
    side: "buy" | "sell";
    network: string;
  }>;
  rejected: string[];
};

interface EmbedContextType {
  /** True when rendering the /widget embed route. */
  isEmbed: boolean;
  /** Origin of the embedding page, or null when unknown / not framed. */
  parentOrigin: string | null;
  /**
   * True once the referrer has been read on mount. Lets consumers tell "host
   * origin not known yet" from "host sends no referrer" — the injected wallet
   * bridge must not give up before this flips.
   */
  parentOriginResolved: boolean;
  /**
   * Deterministic embed code derived from parentOrigin (e_ + 8 hex chars).
   * Null when not in embed mode, parentOrigin is missing, or origin is not
   * allowlisted. Used for onchain attribution in transaction calldata.
   */
  embedCode: string | null;
  /** Send an event to the host page. No-op outside an iframe. */
  postToHost: (event: string, payload?: unknown) => void;
  /**
   * True when the widget network picker is locked (single allowlist entry,
   * legacy URL lock, or a successful wallet-driven lock via chainChanged).
   */
  isNetworkLocked: boolean;
  /**
   * True when URL lock/allowlist params did not resolve to a supported
   * network — picker stays locked; widget keeps last valid / default network.
   */
  networkLockUnresolved: boolean;
  /** Mark the network as locked after a successful wallet chainChanged follow. */
  lockNetworkFromWallet: () => void;
  /** null = unrestricted; otherwise only these tokens in swap selectors. */
  tokenAllowlist: string[] | null;
  currencyAllowlist: string[] | null;
  /** null = unrestricted; otherwise only these networks in the switcher. */
  networkAllowlist: Network[] | null;
  isTokenLocked: boolean;
  isCurrencyLocked: boolean;
  hideSideToggle: boolean;
  /** Host asked us to hide the in-widget support chat (`?hideSupport=1`). */
  hideSupport: boolean;
  /** Side fixed via URL `side=` or host set_config. */
  isSideLocked: boolean;
  defaultToken: string | null;
  defaultCurrency: string | null;
  defaultNetwork: Network | null;
  /** Live host overrides for token/currency/side. */
  hostFormConfig: EmbedHostFormConfig;
  /**
   * Validate host set_config payload against allowlists.
   * Updates form overrides; returns network for the applier to set.
   */
  applyHostConfig: (payload: HostSetConfigPayload) => ApplyHostConfigResult;
}

const defaultHostFormConfig: EmbedHostFormConfig = { version: 0 };

const EmbedContext = createContext<EmbedContextType>({
  isEmbed: false,
  parentOrigin: null,
  parentOriginResolved: false,
  embedCode: null,
  postToHost: () => {},
  isNetworkLocked: false,
  networkLockUnresolved: false,
  lockNetworkFromWallet: () => {},
  tokenAllowlist: null,
  currencyAllowlist: null,
  networkAllowlist: null,
  isTokenLocked: false,
  isCurrencyLocked: false,
  hideSideToggle: false,
  hideSupport: false,
  isSideLocked: false,
  defaultToken: null,
  defaultCurrency: null,
  defaultNetwork: null,
  hostFormConfig: defaultHostFormConfig,
  applyHostConfig: () => ({ network: null, applied: {}, rejected: [] }),
});

function EmbedProviderContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isEmbed = isEmbedPath(pathname);
  const [parentOrigin, setParentOrigin] = useState<string | null>(null);
  const [parentOriginResolved, setParentOriginResolved] = useState(false);
  const [embedCode, setEmbedCode] = useState<string | null>(null);
  const [walletNetworkLocked, setWalletNetworkLocked] = useState(false);
  const [hostFormConfig, setHostFormConfig] =
    useState<EmbedHostFormConfig>(defaultHostFormConfig);
  const [hostSideLocked, setHostSideLocked] = useState(false);

  const parsed = useMemo(
    () => (isEmbed ? parseEmbedConfig(searchParams) : null),
    [isEmbed, searchParams],
  );

  const tokenAllowlist = parsed?.tokenAllowlist ?? null;
  const currencyAllowlist = parsed?.currencyAllowlist ?? null;
  const networkAllowlist = parsed?.networkConfig.allowlist ?? null;
  const networkLockUnresolved = Boolean(parsed?.networkConfig.unresolved);
  const urlNetworkLocked = Boolean(parsed?.networkConfig.isLocked);
  const isNetworkLocked =
    isEmbed &&
    (urlNetworkLocked ||
      walletNetworkLocked ||
      networkLockUnresolved ||
      (networkAllowlist != null && networkAllowlist.length === 1));

  const isTokenLocked = Boolean(
    tokenAllowlist != null && tokenAllowlist.length === 1,
  );
  const isCurrencyLocked = Boolean(
    currencyAllowlist != null && currencyAllowlist.length === 1,
  );
  const hideSideToggle = Boolean(parsed?.hideSideToggle);
  const hideSupport = Boolean(parsed?.hideSupport);
  const isSideLocked =
    Boolean(parsed?.sideLockedFromUrl) || hostSideLocked || hideSideToggle;

  const lockNetworkFromWallet = useCallback(() => {
    if (!isEmbed) return;
    setWalletNetworkLocked(true);
  }, [isEmbed]);

  const applyHostConfig = useCallback(
    (payload: HostSetConfigPayload): ApplyHostConfigResult => {
      const rejected: string[] = [];
      const applied: ApplyHostConfigResult["applied"] = {};
      let network: Network | null = null;

      if (payload.network != null && String(payload.network).trim() !== "") {
        const resolved = resolveNetworkBySlug(String(payload.network));
        if (
          !resolved ||
          !isNetworkInAllowlist(resolved, networkAllowlist)
        ) {
          rejected.push("network");
        } else {
          network = resolved;
          applied.network = resolved.chain.name;
        }
      }

      let nextToken: string | undefined;
      if (payload.token != null && String(payload.token).trim() !== "") {
        const token = canonicalTokenSymbol(String(payload.token));
        if (!isTokenInAllowlist(token, tokenAllowlist)) {
          rejected.push("token");
        } else {
          nextToken = token;
          applied.token = token;
        }
      }

      let nextCurrency: string | undefined;
      if (payload.currency != null && String(payload.currency).trim() !== "") {
        const currency = String(payload.currency).trim().toUpperCase();
        if (!isCurrencyInAllowlist(currency, currencyAllowlist)) {
          rejected.push("currency");
        } else {
          nextCurrency = currency;
          applied.currency = currency;
        }
      }

      let nextSide: "buy" | "sell" | undefined;
      if (payload.side != null && String(payload.side).trim() !== "") {
        const mode = swapModeFromSideParam(String(payload.side));
        if (!mode) {
          rejected.push("side");
        } else {
          nextSide = mode === "onramp" ? "buy" : "sell";
          applied.side = nextSide;
          setHostSideLocked(true);
        }
      }

      if (nextToken || nextCurrency || nextSide) {
        setHostFormConfig((prev) => ({
          version: prev.version + 1,
          token: nextToken ?? prev.token,
          currency: nextCurrency ?? prev.currency,
          side: nextSide ?? prev.side,
        }));
      }

      return { network, applied, rejected };
    },
    [networkAllowlist, tokenAllowlist, currencyAllowlist],
  );

  useEffect(() => {
    if (isEmbed && window.self !== window.top) {
      try {
        const origin = new URL(document.referrer).origin;
        if (origin && origin !== "null") setParentOrigin(origin);
      } catch {
        // Host sends no referrer - stay silent rather than posting to "*".
      }
    }
    // Resolved on every path, including "not framed": consumers waiting on the
    // host origin need to know the answer is final, not merely still null.
    setParentOriginResolved(true);
  }, [isEmbed]);

  // Compute embed code once parentOrigin is known.
  // The embed code is a deterministic hash of the origin for onchain attribution.
  // We don't check the allowlist here because the middleware already blocks
  // non-allowlisted origins from framing /widget. If parentOrigin is set, it's
  // allowlisted by definition.
  //
  // Gated on isEmbed as well as parentOrigin: this provider stays mounted across
  // route changes, and parentOrigin is only ever set (never cleared), so without
  // the isEmbed check a transaction on a non-embed route would keep appending the
  // previous partner's attribution code.
  useEffect(() => {
    if (!isEmbed || !parentOrigin) {
      setEmbedCode(null);
      return;
    }
    // Ignore a resolution that lands after the origin changed or embed mode ended.
    let active = true;
    computeEmbedCode(parentOrigin).then((code) => {
      if (active) setEmbedCode(code);
    });
    return () => {
      active = false;
    };
  }, [isEmbed, parentOrigin]);

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
      parentOriginResolved,
      embedCode,
      postToHost,
      isNetworkLocked,
      networkLockUnresolved,
      lockNetworkFromWallet,
      tokenAllowlist,
      currencyAllowlist,
      networkAllowlist,
      isTokenLocked,
      isCurrencyLocked,
      hideSideToggle,
      hideSupport,
      isSideLocked,
      defaultToken: parsed?.defaultToken ?? null,
      defaultCurrency: parsed?.defaultCurrency ?? null,
      defaultNetwork: parsed?.networkConfig.defaultNetwork ?? null,
      hostFormConfig,
      applyHostConfig,
    }),
    [
      isEmbed,
      parentOrigin,
      parentOriginResolved,
      embedCode,
      postToHost,
      isNetworkLocked,
      networkLockUnresolved,
      lockNetworkFromWallet,
      tokenAllowlist,
      currencyAllowlist,
      networkAllowlist,
      isTokenLocked,
      isCurrencyLocked,
      hideSideToggle,
      hideSupport,
      isSideLocked,
      parsed?.defaultToken,
      parsed?.defaultCurrency,
      parsed?.networkConfig.defaultNetwork,
      hostFormConfig,
      applyHostConfig,
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
