"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import Image from "next/image";
import Decimal from "decimal.js";
import { ActionDrawer } from "@/app/components/drawer";
import { DepositDrawer } from "@/app/components/deposit/DepositDrawer";
import { TransferForm } from "@/app/components/TransferForm";
import { BridgeForm } from "@/app/components/bridge/BridgeForm";
import { CopyAddressWarningModal } from "@/app/components/CopyAddressWarningModal";
import { ReferralHubView } from "@/app/components/wallet-mobile-modal/ReferralHubView";
import { BalanceSkeleton } from "@/app/components/BalanceSkeleton";
import { TokenListSkeleton } from "@/app/(wallet)/components/WalletPageSkeletons";
import { usePortfolio } from "@/app/hooks/usePortfolio";
import {
  useBridgeStatusTracker,
  type BridgeSubmitInfo,
} from "@/app/hooks/useBridgeStatusTracker";
import { useWalletAddress } from "@/app/hooks/useWalletAddress";
import { formatPortfolioUsd } from "@/app/lib/portfolio/display";
import type { WalletHomeActionId } from "@/app/lib/portfolio/home-visibility";
import { isZeroDecimalString } from "@/app/lib/portfolio/money";
import type { PortfolioHolding } from "@/app/lib/portfolio/types";
import { resolveMarketTokenId } from "@/app/lib/tokens/market-id";
import type { TokenHistoryRange } from "@/app/lib/tokens/market-id";
import { canonicalTokenSymbol, tokensEqual } from "@/app/lib/token-symbol";
import {
  isAllowedWalletTokenSymbol,
  resolveWalletTokenMeta,
} from "@/app/lib/wallet-token-allowlist";
import { FALLBACK_TOKENS, classNames, copyToClipboard } from "@/app/utils";
import { Copy01Icon } from "hugeicons-react";
import { PiCheck } from "react-icons/pi";
import { ExploreCards } from "../home/WalletHomeContent";
import { AddFundsSplitButton } from "../home/AddFundsSplitButton";
import { shellFocusRingClasses } from "../shellFocusStyles";

const money = Decimal.clone({ precision: 40 });

// --- Today's PnL + change display (exported for detail route + tests) ---

type Change24h = { pct: string; abs: string };

function resolveSignedUnitPriceChange(
  change24h: Change24h,
): InstanceType<typeof money> {
  const unitDelta = money(change24h.abs.trim());
  const pct = money(change24h.pct.trim());

  if (unitDelta.isZero() || pct.isZero()) {
    return unitDelta;
  }

  const deltaNegative = unitDelta.isNegative();
  const pctNegative = pct.isNegative();

  if (deltaNegative === pctNegative) {
    return unitDelta;
  }

  return unitDelta.abs().mul(pctNegative ? -1 : 1);
}

export function computeTodaysPnlUsd(
  balanceAmount: string,
  change24h: Change24h | null | undefined,
) {
  if (!change24h) {
    return { status: "unavailable" as const };
  }
  try {
    const amount = money(balanceAmount.trim());
    const pct = change24h.pct.trim();
    if (!pct) {
      return { status: "unavailable" as const };
    }
    const signedUnit = resolveSignedUnitPriceChange(change24h);
    const usd = amount.mul(signedUnit);
    return { status: "ok" as const, usd: usd.toFixed(), pct };
  } catch {
    return { status: "unavailable" as const };
  }
}

export function formatSignedUsdPnl(usd: string): string {
  try {
    const value = money(usd.trim());
    const rounded = value.abs().toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
    const formatted = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(rounded.toNumber());
    if (value.isNegative()) {
      return `-${formatted}`;
    }
    if (value.isPositive()) {
      return `+${formatted}`;
    }
    return formatted;
  } catch {
    return "—";
  }
}

export function formatChangePctDisplay(pct: string): string {
  try {
    const value = money(pct.trim());
    const rounded = value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const num = rounded.toNumber();
    if (num > 0) return `+${num.toFixed(2)}%`;
    if (num < 0) return `${num.toFixed(2)}%`;
    return "0.00%";
  } catch {
    return "—";
  }
}

export function changePctTone(pct: string): "up" | "down" | "flat" {
  try {
    const value = money(pct.trim());
    if (value.isPositive()) return "up";
    if (value.isNegative()) return "down";
    return "flat";
  } catch {
    return "flat";
  }
}

// --- Holdings aggregation (exported for detail route + tests) ---

export type AggregatedTokenHolding = {
  symbol: string;
  name: string;
  amount: string;
  usd: string | null;
  priceUnavailable: boolean;
};

export function tokenDetailHref(symbol: string): string {
  const canonical = canonicalTokenSymbol(symbol) ?? symbol;
  return `/tokens/${encodeURIComponent(canonical)}`;
}

export function aggregateTokenHoldings(
  holdings: PortfolioHolding[],
): AggregatedTokenHolding[] {
  const bySymbol = new Map<
    string,
    {
      amount: InstanceType<typeof money>;
      usdParts: string[];
      priceUnavailable: boolean;
    }
  >();

  for (const row of holdings) {
    if (isZeroDecimalString(row.amount)) continue;
    const symbol = canonicalTokenSymbol(row.symbol) ?? row.symbol;
    let entry = bySymbol.get(symbol);
    if (!entry) {
      entry = {
        amount: money(0),
        usdParts: [],
        priceUnavailable: false,
      };
      bySymbol.set(symbol, entry);
    }
    entry.amount = entry.amount.plus(row.amount.trim());
    if (row.usd != null && !isZeroDecimalString(row.usd)) {
      entry.usdParts.push(row.usd.trim());
    }
    if (row.priceUnavailable) {
      entry.priceUnavailable = true;
    }
  }

  const rows: AggregatedTokenHolding[] = [];
  for (const [symbol, entry] of bySymbol) {
    const meta = resolveWalletTokenMeta(symbol);
    rows.push({
      symbol,
      name: meta?.name ?? symbol,
      amount: entry.amount.toFixed(),
      usd:
        entry.usdParts.length > 0
          ? entry.usdParts
              .reduce((acc, part) => acc.plus(part), money(0))
              .toFixed()
          : null,
      priceUnavailable: entry.priceUnavailable,
    });
  }

  return sortTokenHoldingsByUsd(rows);
}

export function sortTokenHoldingsByUsd(
  rows: AggregatedTokenHolding[],
): AggregatedTokenHolding[] {
  return [...rows].sort((a, b) => {
    const rank = (usd: string | null) => {
      if (usd == null) return money(-1);
      try {
        return money(usd.trim());
      } catch {
        return money(-1);
      }
    };
    return rank(b.usd).comparedTo(rank(a.usd));
  });
}

export function findAggregatedHolding(
  rows: AggregatedTokenHolding[],
  symbol: string,
): AggregatedTokenHolding | null {
  return rows.find((row) => tokensEqual(row.symbol, symbol)) ?? null;
}

function resolveTokenImageUrl(symbol: string): string | undefined {
  const canonical = canonicalTokenSymbol(symbol);
  for (const networkTokens of Object.values(FALLBACK_TOKENS)) {
    const match = networkTokens.find((t) => tokensEqual(t.symbol, canonical));
    if (match?.imageUrl) return match.imageUrl;
  }
  return undefined;
}

function formatTokenBalanceAmount(amount: string): string {
  try {
    const value = money(amount.trim());
    if (value.isZero()) return "0";
    const abs = value.abs();
    const maximumFractionDigits = abs.gte(1000) ? 2 : abs.gte(1) ? 4 : 6;
    return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(
      value.toNumber(),
    );
  } catch {
    return "0";
  }
}

function formatTokenRowUsd(usd: string | null): string {
  if (usd == null) return "—";
  return formatPortfolioUsd(usd);
}

// --- Client market fetch hooks (detail + list) ---

type ClientTokenMarketSnapshot = {
  id: string;
  price: string;
  change24h: { pct: string; abs: string } | null;
  asOf: string;
  stale: boolean;
  stats: {
    volume24h: string | null;
    marketCap: string | null;
    circulatingSupply: string | null;
  } | null;
};

type ClientTokenHistoryResponse = {
  id: string;
  range: TokenHistoryRange;
  points: Array<[number, string]>;
  stale: boolean;
  unavailable?: boolean;
  partial?: boolean;
};

export function useTokenMarketSnapshot(
  marketId: string | null,
  options?: { enabled?: boolean },
) {
  const enabled = (options?.enabled ?? true) && Boolean(marketId);
  const [data, setData] = useState<ClientTokenMarketSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const requestIdRef = useRef(0);

  const refetch = useCallback(async () => {
    if (!marketId || !enabled) return;
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(false);
    setUnavailable(false);

    try {
      const response = await fetch(`/api/market/tokens/${marketId}`, {
        credentials: "same-origin",
      });
      if (requestId !== requestIdRef.current) return;

      if (response.status === 503) {
        setData(null);
        setUnavailable(true);
        return;
      }

      if (!response.ok) {
        setData(null);
        setError(true);
        return;
      }

      const body = (await response.json()) as {
        success: boolean;
        data?: ClientTokenMarketSnapshot;
      };
      if (!body.success || !body.data) {
        setData(null);
        setError(true);
        return;
      }
      setData(body.data);
    } catch {
      if (requestId !== requestIdRef.current) return;
      setData(null);
      setError(true);
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [enabled, marketId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, isLoading, error, unavailable, refetch };
}

export function useTokenMarketHistory(
  marketId: string | null,
  range: TokenHistoryRange,
  options?: { enabled?: boolean },
) {
  const enabled = (options?.enabled ?? true) && Boolean(marketId);
  const [data, setData] = useState<ClientTokenHistoryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const requestIdRef = useRef(0);

  const refetch = useCallback(async () => {
    if (!marketId || !enabled) return;
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(false);
    setUnavailable(false);

    try {
      const response = await fetch(
        `/api/market/tokens/${marketId}/history?range=${range}`,
        { credentials: "same-origin" },
      );
      if (requestId !== requestIdRef.current) return;

      if (response.status === 503) {
        const body = (await response.json()) as {
          data?: ClientTokenHistoryResponse;
        };
        setData(body.data ?? null);
        setUnavailable(true);
        return;
      }

      if (!response.ok) {
        setData(null);
        setError(true);
        return;
      }

      const body = (await response.json()) as {
        success: boolean;
        data?: ClientTokenHistoryResponse;
      };
      if (!body.success || !body.data) {
        setData(null);
        setError(true);
        return;
      }
      setData(body.data);
      if (body.data.unavailable || body.data.points.length === 0) {
        setUnavailable(true);
      }
    } catch {
      if (requestId !== requestIdRef.current) return;
      setData(null);
      setError(true);
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [enabled, marketId, range]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, isLoading, error, unavailable, refetch };
}

export function useTokenMarketQuotes(
  marketIds: string[],
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled ?? true;
  const [quotesById, setQuotesById] = useState<
    Record<string, { pct: string | null; unavailable: boolean }>
  >({});
  const [isLoading, setIsLoading] = useState(enabled && marketIds.length > 0);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!enabled || marketIds.length === 0) {
      setQuotesById({});
      setIsLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setIsLoading(true);

    void (async () => {
      const entries = await Promise.all(
        marketIds.map(async (id) => {
          try {
            const response = await fetch(`/api/market/tokens/${id}`, {
              credentials: "same-origin",
            });
            if (!response.ok) {
              return [id, { pct: null, unavailable: true }] as const;
            }
            const body = (await response.json()) as {
              success: boolean;
              data?: ClientTokenMarketSnapshot;
            };
            if (!body.success || !body.data?.change24h) {
              return [id, { pct: null, unavailable: true }] as const;
            }
            return [
              id,
              {
                pct: body.data.change24h.pct,
                unavailable: false,
              },
            ] as const;
          } catch {
            return [id, { pct: null, unavailable: true }] as const;
          }
        }),
      );

      if (requestId !== requestIdRef.current) return;
      setQuotesById(Object.fromEntries(entries));
      setIsLoading(false);
    })();
  }, [enabled, marketIds.join(",")]);

  return { quotesById, isLoading };
}

// --- Shared token action drawers (list + detail) ---

const TOKEN_ACTION_TITLES: Record<"receive" | "transfer" | "swap", string> = {
  receive: "Receive",
  transfer: "Transfer",
  swap: "Swap",
};

type TokenActionId = "receive" | "transfer" | "swap";

function ReceiveDepositPanel({
  walletAddress,
  preferredTokenSymbol,
  onCopyWarningOpen,
}: {
  walletAddress: string | undefined;
  preferredTokenSymbol?: string;
  onCopyWarningOpen: () => void;
}) {
  const [isAddressCopied, setIsAddressCopied] = useState(false);
  const isMountedRef = useRef(true);
  const copyFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (copyFeedbackTimeoutRef.current) {
        clearTimeout(copyFeedbackTimeoutRef.current);
      }
    };
  }, []);

  const handleCopyAddress = async () => {
    if (!walletAddress) return;
    const ok = await copyToClipboard(walletAddress, "Address");
    if (!isMountedRef.current || !ok) return;
    setIsAddressCopied(true);
    copyFeedbackTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) setIsAddressCopied(false);
    }, 2000);
    if (localStorage.getItem("hideAddressWarningModal") !== "true") {
      onCopyWarningOpen();
    }
  };

  const tokenLabel = preferredTokenSymbol
    ? canonicalTokenSymbol(preferredTokenSymbol)
    : null;

  if (!walletAddress) {
    return (
      <div
        role="alert"
        className="rounded-2xl border border-border-light px-4 py-3"
      >
        <p className="text-sm font-medium text-text-body dark:text-white">
          Wallet address unavailable
        </p>
      </div>
    );
  }

  return (
    <div
      className="space-y-3"
      data-testid="receive-deposit-panel"
      data-preferred-token={tokenLabel ?? undefined}
    >
      <p className="text-sm text-text-secondary dark:text-white/60">
        {tokenLabel
          ? `Receive ${tokenLabel} to your Noblocks wallet address.`
          : "Receive supported tokens to your Noblocks wallet address."}
      </p>
      <div className="relative flex min-h-[80px] flex-col gap-3 rounded-2xl border border-border-light bg-white px-3 py-3 dark:border-white/10 dark:bg-surface-canvas">
        <div className="flex w-full items-start justify-between gap-4">
          <p className="min-w-0 flex-1 break-all text-base font-medium text-text-body dark:text-white/80">
            {walletAddress}
          </p>
          <button
            type="button"
            onClick={() => void handleCopyAddress()}
            aria-label="Copy wallet address"
            className={classNames(
              "shrink-0 rounded-lg p-1 transition-colors hover:bg-accent-gray dark:hover:bg-white/10",
              shellFocusRingClasses,
            )}
          >
            {isAddressCopied ? (
              <PiCheck className="size-5 text-green-900 dark:text-green-500" />
            ) : (
              <Copy01Icon
                className="size-5 text-icon-outline-secondary dark:text-white/50"
                strokeWidth={2}
              />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export function TokenActionDrawerHost({
  activeAction,
  preferredTokenSymbol,
  onClose,
  onBridgeSubmit,
}: {
  activeAction: TokenActionId | null;
  preferredTokenSymbol?: string;
  onClose: () => void;
  onBridgeSubmit: (info: BridgeSubmitInfo) => void;
}) {
  const walletAddress = useWalletAddress();
  const [addressWarningOpen, setAddressWarningOpen] = useState(false);

  useEffect(() => {
    if (activeAction !== "receive") {
      setAddressWarningOpen(false);
    }
  }, [activeAction]);

  const renderBody = () => {
    if (!activeAction) return null;
    switch (activeAction) {
      case "receive":
        return (
          <ReceiveDepositPanel
            walletAddress={walletAddress}
            preferredTokenSymbol={preferredTokenSymbol}
            onCopyWarningOpen={() => setAddressWarningOpen(true)}
          />
        );
      case "transfer":
        return (
          <TransferForm
            onClose={onClose}
            preferredTokenSymbol={preferredTokenSymbol}
            variant="v2"
          />
        );
      case "swap":
        return (
          <BridgeForm
            onClose={onClose}
            onBridgeSubmit={onBridgeSubmit}
            preferredTokenSymbol={preferredTokenSymbol}
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
      <ActionDrawer
        isOpen={activeAction != null}
        title={
          activeAction === "transfer"
            ? preferredTokenSymbol
              ? `Transfer ${canonicalTokenSymbol(preferredTokenSymbol)}`
              : "Transfer funds"
            : activeAction
              ? TOKEN_ACTION_TITLES[activeAction]
              : ("Action" as const)
        }
        onRequestClose={onClose}
        bodyAlign="start"
        showPoweredByFooter={activeAction !== "transfer"}
      >
        {renderBody()}
      </ActionDrawer>
      {walletAddress ? (
        <CopyAddressWarningModal
          isOpen={addressWarningOpen}
          onClose={() => setAddressWarningOpen(false)}
          address={walletAddress}
        />
      ) : null}
    </>
  );
}

const TOKEN_CHANGE_UP_CLASSES = "text-[#227738] dark:text-[#39c65d]";
const TOKEN_CHANGE_DOWN_CLASSES = "text-text-accent-red dark:text-accent-red";

const tokensEmptySecondaryButtonClasses = classNames(
  "inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-medium text-text-body transition hover:opacity-90",
  "bg-accent-gray dark:bg-white/10 dark:text-white",
  shellFocusRingClasses,
);

function TokensEmptyState({ onAddFunds }: { onAddFunds: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-[24px] border border-border-light bg-accent-gray px-6 py-12 text-center dark:border-white/10 dark:bg-white/5 sm:px-12">
      <h2 className="text-[15px] font-semibold leading-5 text-text-body dark:text-white">
        No tokens yet
      </h2>
      <p className="max-w-sm text-sm text-text-secondary dark:text-white/50">
        Add your first token to start trading, converting, or earning.
      </p>
      <button
        type="button"
        onClick={onAddFunds}
        className={tokensEmptySecondaryButtonClasses}
      >
        Add funds
      </button>
    </div>
  );
}

function TokenRowLink({
  symbol,
  name,
  amountLabel,
  usdLabel,
  changePct,
  imageUrl,
  href,
}: {
  symbol: string;
  name: string;
  amountLabel: string;
  usdLabel: string;
  changePct: string | null;
  imageUrl?: string;
  href?: string;
}) {
  const tone =
    changePct == null
      ? "muted"
      : changePct.startsWith("-")
        ? "down"
        : changePct.startsWith("+") || Number.parseFloat(changePct) > 0
          ? "up"
          : "flat";

  const rowClasses = classNames(
    "flex min-h-16 items-center justify-between gap-4 px-6 py-2",
    href &&
      "transition hover:bg-white/40 dark:hover:bg-white/5",
    href && shellFocusRingClasses,
  );

  const inner = (
    <>
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative size-11 shrink-0 overflow-hidden rounded-full bg-white dark:bg-white/10">
          {imageUrl ? (
            <Image src={imageUrl} alt="" fill className="object-cover p-1.5" />
          ) : null}
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-medium text-text-body dark:text-white">
            {name}
          </p>
          <p className="truncate text-sm text-text-secondary dark:text-white/50">
            {amountLabel} {symbol}
          </p>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-base font-medium text-text-body dark:text-white">
          {usdLabel}
        </p>
        <p
          className={classNames(
            "text-xs font-medium",
            tone === "up" && TOKEN_CHANGE_UP_CLASSES,
            tone === "down" && TOKEN_CHANGE_DOWN_CLASSES,
            tone === "muted" && "text-text-secondary dark:text-white/40",
            tone === "flat" && "text-text-secondary dark:text-white/50",
          )}
        >
          {changePct ?? "—"}
        </p>
      </div>
    </>
  );

  if (!href) {
    return <div className={rowClasses}>{inner}</div>;
  }

  return (
    <Link href={href} className={rowClasses}>
      {inner}
    </Link>
  );
}

// --- Tokens list page ---

const ACTION_TITLES: Record<WalletHomeActionId, string> = {
  buy: "Buy",
  sell: "Sell",
  receive: "Receive",
  transfer: "Transfer",
  swap: "Swap",
};

export function PortfolioError({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-border-light bg-accent-gray/40 px-4 py-3 dark:border-white/10 dark:bg-white/5"
    >
      <p className="text-sm text-text-body dark:text-white">
        We couldn&apos;t load your token balances.
      </p>
      <button
        type="button"
        onClick={() => void onRetry()}
        className={classNames(
          "mt-2 text-sm font-semibold underline-offset-2 hover:underline",
          "text-[#0065F5] dark:text-lavender-500",
          shellFocusRingClasses,
          "rounded-md",
        )}
      >
        Try again
      </button>
    </div>
  );
}

function RampActionPlaceholder({ mode }: { mode: "buy" | "sell" }) {
  return (
    <p className="px-1 text-sm leading-relaxed text-text-secondary dark:text-white/60">
      {mode === "buy"
        ? "Buy stablecoins with local currency. Full onramp steps will appear here."
        : "Sell crypto to your bank or mobile money. Full offramp steps will appear here."}
    </p>
  );
}

function TokensFundsDrawerHost({
  activeAction,
  onClose,
  onBridgeSubmit,
}: {
  activeAction: WalletHomeActionId | null;
  onClose: () => void;
  onBridgeSubmit: (info: BridgeSubmitInfo) => void;
}) {
  if (
    activeAction === "receive" ||
    activeAction === "transfer" ||
    activeAction === "swap"
  ) {
    return (
      <TokenActionDrawerHost
        activeAction={activeAction}
        onClose={onClose}
        onBridgeSubmit={onBridgeSubmit}
      />
    );
  }

  return (
    <ActionDrawer
      isOpen={activeAction === "buy" || activeAction === "sell"}
      title={activeAction ? ACTION_TITLES[activeAction] : "Action"}
      onRequestClose={onClose}
      bodyAlign="start"
    >
      {activeAction === "buy" || activeAction === "sell" ? (
        <RampActionPlaceholder mode={activeAction} />
      ) : null}
    </ActionDrawer>
  );
}

function InviteFriendsDrawer({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  return (
    <ActionDrawer
      isOpen={isOpen}
      title="Invite friends"
      onRequestClose={onClose}
      bodyAlign="start"
      showPoweredByFooter={false}
    >
      <ReferralHubView onBack={onClose} onClose={onClose} />
    </ActionDrawer>
  );
}

export function TokensPageContent() {
  const { ready, authenticated } = usePrivy();
  const { trackBridge } = useBridgeStatusTracker();
  const { data, isLoading, error, refetch } = usePortfolio({
    enabled: ready && authenticated,
  });
  const [activeAction, setActiveAction] = useState<WalletHomeActionId | null>(
    null,
  );
  const [depositOpen, setDepositOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const portfolioLoading =
    !ready ||
    !authenticated ||
    isLoading ||
    (ready && authenticated && data == null && error == null);

  const rows = useMemo(
    () => (data ? aggregateTokenHoldings(data.buckets.tokens.holdings) : []),
    [data],
  );

  const marketIds = useMemo(
    () =>
      [
        ...new Set(
          rows
            .map((row) => resolveMarketTokenId(row.symbol))
            .filter((id): id is string => Boolean(id)),
        ),
      ],
    [rows],
  );

  const { quotesById } = useTokenMarketQuotes(marketIds, {
    enabled: !portfolioLoading && rows.length > 0,
  });

  const showError = !portfolioLoading && error != null;
  const showContent = !portfolioLoading && !error && data != null;
  const isEmpty = showContent && rows.length === 0;

  return (
    <div className="mx-auto flex w-full max-w-[921px] flex-col gap-[49px] pb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm text-text-secondary dark:text-white/50">
            Total token balance
          </p>
          {portfolioLoading ? (
            <BalanceSkeleton className="h-10 w-36 rounded-lg" />
          ) : (
            <p className="text-[35px] font-semibold leading-9 tracking-[-1.05px] text-text-body dark:text-white">
              {showContent && data
                ? formatPortfolioUsd(data.buckets.tokens.totalUsd)
                : "—"}
            </p>
          )}
        </div>
        {showContent && !isEmpty ? (
          <AddFundsSplitButton
            onPrimaryClick={() => {
              setActiveAction(null);
              setDepositOpen(true);
            }}
            onAction={(action) => {
              setDepositOpen(false);
              setActiveAction(action);
            }}
            variant="split"
          />
        ) : null}
      </div>

      {showError ? <PortfolioError onRetry={() => void refetch()} /> : null}

      {portfolioLoading ? (
        <div className="overflow-hidden rounded-[24px] border border-border-light bg-accent-gray dark:border-white/10 dark:bg-white/5">
          <TokenListSkeleton />
        </div>
      ) : null}

      {isEmpty ? (
        <TokensEmptyState
          onAddFunds={() => {
            setActiveAction(null);
            setDepositOpen(true);
          }}
        />
      ) : null}

      {showContent && !isEmpty ? (
        <section className="overflow-hidden rounded-[24px] border border-border-light bg-accent-gray dark:border-white/10 dark:bg-white/5">
          <h2 className="px-6 pb-2 pt-4 text-base font-medium text-text-secondary dark:text-white/50">
            All your available tokens
          </h2>
          <div className="divide-y divide-border-light dark:divide-white/10">
            {rows.map((row) => {
              const marketId = resolveMarketTokenId(row.symbol);
              const quote = marketId ? quotesById[marketId] : undefined;
              const changePct =
                quote?.pct != null ? formatChangePctDisplay(quote.pct) : null;
              return (
                <TokenRowLink
                  key={row.symbol}
                  symbol={row.symbol}
                  name={row.name}
                  amountLabel={formatTokenBalanceAmount(row.amount)}
                  usdLabel={formatTokenRowUsd(row.usd)}
                  changePct={changePct}
                  imageUrl={resolveTokenImageUrl(row.symbol)}
                  href={
                    isAllowedWalletTokenSymbol(row.symbol)
                      ? tokenDetailHref(row.symbol)
                      : undefined
                  }
                />
              );
            })}
          </div>
        </section>
      ) : null}

      {showContent ? (
        <ExploreCards onInviteClick={() => setInviteOpen(true)} />
      ) : null}

      <DepositDrawer
        isOpen={depositOpen}
        onRequestClose={() => setDepositOpen(false)}
      />
      <TokensFundsDrawerHost
        activeAction={activeAction}
        onClose={() => setActiveAction(null)}
        onBridgeSubmit={trackBridge}
      />
      <InviteFriendsDrawer
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
      />
    </div>
  );
}
