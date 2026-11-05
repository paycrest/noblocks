"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Decimal from "decimal.js";
import { ActionDrawer } from "@/app/components/drawer";
import { ReferralHubView } from "@/app/components/wallet-mobile-modal/ReferralHubView";
import {
  Popover,
  PopoverButton,
  PopoverPanel,
  Transition,
} from "@headlessui/react";
import {
  ArrowDown01Icon,
  ArrowDownLeft01Icon,
  ArrowUpRight01Icon,
  CoinsSwapIcon,
} from "hugeicons-react";
import { usePrivy } from "@privy-io/react-auth";
import { BalanceSkeleton } from "@/app/components/BalanceSkeleton";
import { usePortfolio } from "@/app/hooks/usePortfolio";
import { formatPortfolioUsd } from "@/app/lib/portfolio/display";
import {
  TOKEN_HISTORY_RANGES,
  resolveMarketTokenId,
  type TokenHistoryRange,
} from "@/app/lib/tokens/market-id";
import { FALLBACK_TOKENS, classNames } from "@/app/utils";
import { canonicalTokenSymbol, tokensEqual } from "@/app/lib/token-symbol";
import { walletHomePrimaryGrayButtonClasses } from "../home/AddFundsSplitButton";
import { ExploreCards } from "../home/WalletHomeContent";
import {
  shellFocusRingClasses,
  shellMinHitTargetClasses,
} from "../shellFocusStyles";
import {
  TokenActionDrawerHost,
  aggregateTokenHoldings,
  changePctTone,
  computeTodaysPnlUsd,
  findAggregatedHolding,
  formatChangePctDisplay,
  formatSignedUsdPnl,
  useTokenMarketHistory,
  useTokenMarketSnapshot,
} from "./TokensPageContent";

const money = Decimal.clone({ precision: 40 });

const splitPrimarySegmentClasses = classNames(
  walletHomePrimaryGrayButtonClasses,
  "text-sm font-medium leading-5 tracking-[-0.01em]",
  "inline-flex h-9 w-[100px] shrink-0 items-center justify-center px-2 py-1.5",
  "rounded-tl-xl rounded-bl-xl rounded-tr-[2px] rounded-br-[2px]",
  shellMinHitTargetClasses,
  shellFocusRingClasses,
);

const splitIconSegmentClasses = classNames(
  walletHomePrimaryGrayButtonClasses,
  "inline-flex size-9 shrink-0 items-center justify-center p-0",
  "rounded-tr-xl rounded-br-xl rounded-tl-[2px] rounded-bl-[2px]",
  shellMinHitTargetClasses,
  shellFocusRingClasses,
);

function resolveTokenImageUrl(symbol: string): string | undefined {
  const canonical = canonicalTokenSymbol(symbol);
  for (const networkTokens of Object.values(FALLBACK_TOKENS)) {
    const match = networkTokens.find((t) => tokensEqual(t.symbol, canonical));
    if (match?.imageUrl) return match.imageUrl;
  }
  return undefined;
}

function formatTokenDetailBalanceAmount(amount: string): string {
  try {
    const value = money(amount.trim());
    if (value.isZero()) return "0";
    const maximumFractionDigits = value.abs().gte(1) ? 4 : 6;
    return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(
      value.toNumber(),
    );
  } catch {
    return "0";
  }
}

function formatMarketPriceUsd(price: string): string {
  return formatPortfolioUsd(price);
}

function buildPriceChartPath(
  values: number[],
  width: number,
  height: number,
  paddingY: number,
): string | null {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const innerHeight = height - paddingY * 2;

  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y =
        paddingY + innerHeight - ((value - min) / span) * innerHeight;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function PriceLineChart({
  points,
  className,
  unavailable,
  isLoading,
}: {
  points: Array<[number, string]>;
  className?: string;
  unavailable?: boolean;
  isLoading?: boolean;
}) {
  const width = 640;
  const height = 320;
  const paddingY = 12;

  const values = points
    .map(([, price]) => {
      try {
        return money(price.trim()).toNumber();
      } catch {
        return Number.NaN;
      }
    })
    .filter((n) => Number.isFinite(n));

  const path = buildPriceChartPath(values, width, height, paddingY);
  const areaPath =
    path != null ? `${path} L ${width} ${height} L 0 ${height} Z` : null;

  if (isLoading) {
    return (
      <div
        className={classNames(
          "flex h-[320px] items-center justify-center rounded-xl bg-accent-gray/30 dark:bg-white/5",
          className,
        )}
        aria-busy="true"
      >
        <span className="text-sm text-text-secondary dark:text-white/50">
          Loading chart…
        </span>
      </div>
    );
  }

  if (unavailable || !path) {
    return (
      <div
        className={classNames(
          "flex h-[320px] items-center justify-center rounded-xl bg-accent-gray/30 dark:bg-white/5",
          className,
        )}
        role="status"
      >
        <span className="text-sm text-text-secondary dark:text-white/50">
          Chart unavailable
        </span>
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={classNames("h-[320px] w-full", className)}
      role="img"
      aria-label="Price chart"
    >
      <defs>
        <linearGradient id="token-price-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(34, 197, 94)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="rgb(34, 197, 94)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {areaPath ? (
        <path d={areaPath} fill="url(#token-price-fill)" stroke="none" />
      ) : null}
      <path
        d={path}
        fill="none"
        stroke="rgb(34, 197, 94)"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
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

type TokenDetailContentProps = {
  symbol: string;
};

type DetailActionId = "receive" | "transfer" | "swap";

const DETAIL_MENU: Array<{
  id: DetailActionId;
  label: string;
  icon: React.ReactNode;
}> = [
  {
    id: "receive",
    label: "Receive",
    icon: <ArrowDownLeft01Icon className="size-[18px]" strokeWidth={1.5} />,
  },
  {
    id: "transfer",
    label: "Transfer",
    icon: <ArrowUpRight01Icon className="size-[18px]" strokeWidth={1.5} />,
  },
  {
    id: "swap",
    label: "Swap",
    icon: <CoinsSwapIcon className="size-[18px]" strokeWidth={1.5} />,
  },
];

function TokenDetailActionsMenu({
  onAction,
}: {
  onAction: (action: DetailActionId) => void;
}) {
  const closeRef = useRef<(() => void) | null>(null);

  return (
    <Popover className="relative inline-flex items-center gap-px rounded-xl">
      {({ close }) => {
        closeRef.current = close;
        return (
          <>
            <button
              type="button"
              className={splitPrimarySegmentClasses}
              onClick={() => onAction("receive")}
            >
              Add funds
            </button>
            <PopoverButton
              className={splitIconSegmentClasses}
              aria-label="Token actions"
            >
              <ArrowDown01Icon className="size-5 shrink-0" strokeWidth={1.5} />
            </PopoverButton>
            <Transition
              as={Fragment}
              enter="transition ease-out duration-100 motion-reduce:transition-none"
              enterFrom="opacity-0 translate-y-1 motion-reduce:translate-y-0"
              enterTo="opacity-100 translate-y-0"
              leave="transition ease-in duration-75 motion-reduce:transition-none"
              leaveFrom="opacity-100 translate-y-0"
              leaveTo="opacity-0 translate-y-1 motion-reduce:translate-y-0"
            >
              <PopoverPanel
                anchor="bottom end"
                className="z-50 mt-2 flex w-[155px] flex-col gap-1 rounded-xl border border-border-light bg-white py-2 shadow-[0px_10px_27px_0px_rgba(0,0,0,0.35)] dark:border-white/10 dark:bg-surface-overlay"
              >
                <ul>
                  {DETAIL_MENU.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => {
                          closeRef.current?.();
                          onAction(item.id);
                        }}
                        className={classNames(
                          "flex h-9 w-full items-center gap-2 px-3 text-left text-sm font-medium text-text-body hover:bg-accent-gray dark:text-white dark:hover:bg-white/10",
                          shellFocusRingClasses,
                        )}
                      >
                        <span className="text-icon-outline-secondary dark:text-white/80">
                          {item.icon}
                        </span>
                        {item.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </PopoverPanel>
            </Transition>
          </>
        );
      }}
    </Popover>
  );
}

function PnlTrendCaret({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      width={12}
      height={6}
      viewBox="0 0 12 6"
      className="shrink-0"
      aria-hidden
    >
      {direction === "up" ? (
        <path d="M6 0 12 6H0Z" fill="currentColor" />
      ) : (
        <path d="M0 0h12L6 6Z" fill="currentColor" />
      )}
    </svg>
  );
}

function formatSupplyLabel(value: string | null, symbol: string): string {
  if (!value) return "—";
  return `${value} ${symbol}`;
}

export function TokenDetailContent({ symbol }: TokenDetailContentProps) {
  const { ready, authenticated } = usePrivy();
  const { data, isLoading } = usePortfolio({
    enabled: ready && authenticated,
  });
  const [range, setRange] = useState<TokenHistoryRange>("1D");
  const [activeAction, setActiveAction] = useState<DetailActionId | null>(
    null,
  );
  const [inviteOpen, setInviteOpen] = useState(false);

  const marketId = resolveMarketTokenId(symbol);
  const holding = useMemo(() => {
    if (!data) return null;
    const rows = aggregateTokenHoldings(data.buckets.tokens.holdings);
    return findAggregatedHolding(rows, symbol);
  }, [data, symbol]);

  const balanceLoading = !ready || !authenticated || isLoading;

  const {
    data: snapshot,
    isLoading: snapshotLoading,
    unavailable: snapshotUnavailable,
    error: snapshotError,
  } = useTokenMarketSnapshot(marketId, { enabled: Boolean(marketId) });

  const {
    data: history,
    isLoading: historyLoading,
    unavailable: historyUnavailable,
  } = useTokenMarketHistory(marketId, range, { enabled: Boolean(marketId) });

  const priceUnavailable =
    !marketId || snapshotUnavailable || snapshotError || !snapshot;
  const chartUnavailable =
    priceUnavailable || historyUnavailable || history?.unavailable;
  const chartLoading = snapshotLoading || historyLoading;

  const pnl = computeTodaysPnlUsd(
    holding?.amount ?? "0",
    snapshot?.change24h ?? null,
  );
  const pnlUnavailable = priceUnavailable || pnl.status === "unavailable";

  const imageUrl = resolveTokenImageUrl(symbol);

  return (
    <div className="mx-auto flex w-full max-w-[921px] flex-col gap-[49px] pb-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div className="relative size-14 shrink-0 overflow-hidden rounded-full bg-white dark:bg-white/10">
            {imageUrl ? (
              <Image src={imageUrl} alt="" fill className="object-cover p-2" />
            ) : null}
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-sm text-text-secondary dark:text-white/50">
              Your {symbol} balance
            </p>
            {balanceLoading ? (
              <BalanceSkeleton className="h-7 w-40 rounded-lg" />
            ) : (
              <p
                className="text-[26px] font-medium leading-6 text-text-body dark:text-white"
                data-testid="token-balance-amount"
              >
                {holding
                  ? formatTokenDetailBalanceAmount(holding.amount)
                  : "0"}
              </p>
            )}
          </div>
        </div>
        <TokenDetailActionsMenu onAction={setActiveAction} />
      </div>

      <section className="overflow-hidden rounded-[24px] border border-border-light bg-accent-gray dark:border-white/10 dark:bg-white/5">
        <div
          className="flex flex-col gap-0.5 px-5 pt-4 pb-4"
          data-testid="token-price-header"
        >
          <p className="text-sm font-medium text-text-secondary dark:text-white/50">
            {symbol} price today
          </p>
          {snapshotLoading ? (
            <BalanceSkeleton className="h-6 w-24 rounded-lg" />
          ) : (
            <p className="text-[17px] font-medium leading-6 text-text-body dark:text-white">
              {priceUnavailable
                ? "Unavailable"
                : formatMarketPriceUsd(snapshot!.price)}
            </p>
          )}
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="text-text-secondary dark:text-white/50">
              Today&apos;s PnL
            </span>
            {pnlUnavailable ? (
              <span
                className="text-text-secondary dark:text-white/50"
                data-testid="token-pnl-unavailable"
              >
                Unavailable
              </span>
            ) : (
              <span
                className={classNames(
                  "inline-flex items-center gap-1",
                  changePctTone(pnl.pct) === "up" &&
                    "text-[#227738] dark:text-[#39c65d]",
                  changePctTone(pnl.pct) === "down" &&
                    "text-text-accent-red dark:text-accent-red",
                )}
                data-testid="token-pnl-value"
              >
                {changePctTone(pnl.pct) === "up" ? (
                  <PnlTrendCaret direction="up" />
                ) : changePctTone(pnl.pct) === "down" ? (
                  <PnlTrendCaret direction="down" />
                ) : null}
                {formatSignedUsdPnl(pnl.usd)} ({formatChangePctDisplay(pnl.pct)})
              </span>
            )}
          </div>
        </div>

        <div className="h-[320px] w-full" data-testid="token-price-chart">
          <PriceLineChart
            points={history?.points ?? []}
            isLoading={chartLoading}
            unavailable={chartUnavailable}
            className="h-full w-full"
          />
        </div>

        <div className="flex flex-wrap gap-2 px-4 pb-4">
          {TOKEN_HISTORY_RANGES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setRange(item)}
              className={classNames(
                "rounded-full px-3 py-1 text-xs font-medium transition",
                item === range
                  ? "bg-text-body text-white dark:bg-white dark:text-text-body"
                  : "bg-white text-text-secondary hover:bg-accent-gray dark:bg-white/10 dark:text-white/60",
                shellFocusRingClasses,
              )}
            >
              {item === "ALL" ? "All time" : item}
            </button>
          ))}
        </div>

        <dl
          className="flex flex-wrap items-start gap-x-[95px] gap-y-4 border-t border-border-light px-4 pt-5 pb-2.5 text-xs dark:border-white/10"
          data-testid="token-market-legend"
        >
          <div className="flex flex-col gap-0.5">
            <dt className="font-medium leading-5 text-text-secondary dark:text-white/50">
              Market cap
            </dt>
            <dd className="font-medium leading-6 text-text-body dark:text-white">
              {snapshot?.stats?.marketCap
                ? formatPortfolioUsd(snapshot.stats.marketCap)
                : "—"}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="font-medium leading-5 text-text-secondary dark:text-white/50">
              24-hour volume
            </dt>
            <dd className="font-medium leading-6 text-text-body dark:text-white">
              {snapshot?.stats?.volume24h
                ? formatPortfolioUsd(snapshot.stats.volume24h)
                : "—"}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="font-medium leading-5 text-text-secondary dark:text-white/50">
              Circulating supply
            </dt>
            <dd className="font-medium leading-6 text-text-body dark:text-white">
              {formatSupplyLabel(
                snapshot?.stats?.circulatingSupply ?? null,
                symbol,
              )}
            </dd>
          </div>
        </dl>
      </section>

      <ExploreCards onInviteClick={() => setInviteOpen(true)} />

      <TokenActionDrawerHost
        activeAction={activeAction}
        preferredTokenSymbol={symbol}
        onClose={() => setActiveAction(null)}
      />

      <InviteFriendsDrawer
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
      />
    </div>
  );
}
