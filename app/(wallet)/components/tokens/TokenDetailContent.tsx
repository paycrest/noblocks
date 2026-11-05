"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import Image from "next/image";
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
import {
  useTokenMarketHistory,
  useTokenMarketSnapshot,
} from "@/app/hooks/useTokenMarket";
import { formatPortfolioUsd } from "@/app/lib/portfolio/display";
import {
  aggregateTokenHoldings,
  findAggregatedHolding,
} from "@/app/lib/tokens/aggregate-holdings";
import {
  resolveMarketTokenId,
  TOKEN_HISTORY_RANGES,
  type TokenHistoryRange,
} from "@/app/lib/tokens/market-id";
import {
  computeTodaysPnlUsd,
  formatChangePctDisplay,
  formatSignedUsdPnl,
  changePctTone,
} from "@/app/lib/tokens/todays-pnl";
import {
  formatMarketPriceUsd,
  formatTokenDetailBalanceAmount,
  resolveTokenImageUrl,
} from "@/app/lib/tokens/token-display";
import { classNames } from "@/app/utils";
import {
  splitIconSegmentClasses,
  splitPrimarySegmentClasses,
} from "../home/AddFundsSplitButton";
import { ExploreCards } from "../home/WalletHomeContent";
import { shellFocusRingClasses } from "../shellFocusStyles";
import { PriceLineChart } from "./PriceLineChart";
import { TokenActionDrawerHost } from "./TokenPageShared";

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
          <div className="relative size-12 shrink-0 overflow-hidden rounded-full bg-white dark:bg-white/10">
            {imageUrl ? (
              <Image src={imageUrl} alt="" fill className="object-cover p-2" />
            ) : null}
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-sm text-text-secondary dark:text-white/50">
              Your {symbol} balance
            </p>
            {balanceLoading ? (
              <BalanceSkeleton className="h-10 w-40 rounded-lg" />
            ) : (
              <p
                className="text-[35px] font-semibold leading-9 tracking-[-1.05px] text-text-body dark:text-white"
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

      <section className="space-y-4 rounded-[20px] border border-border-light bg-accent-gray px-4 py-5 dark:border-white/10 dark:bg-white/5 sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-text-secondary dark:text-white/50">
              {symbol} price today
            </p>
            {snapshotLoading ? (
              <BalanceSkeleton className="mt-1 h-8 w-24 rounded-lg" />
            ) : (
              <p className="text-2xl font-semibold text-text-body dark:text-white">
                {priceUnavailable
                  ? "Unavailable"
                  : formatMarketPriceUsd(snapshot!.price)}
              </p>
            )}
          </div>
          <div className="text-sm">
            <p className="text-text-secondary dark:text-white/50">
              Today&apos;s PnL
            </p>
            {pnlUnavailable ? (
              <p
                className="font-medium text-text-secondary dark:text-white/50"
                data-testid="token-pnl-unavailable"
              >
                Unavailable
              </p>
            ) : (
              <p
                className={classNames(
                  "font-medium",
                  changePctTone(pnl.pct) === "up" &&
                    "text-green-600 dark:text-green-400",
                  changePctTone(pnl.pct) === "down" &&
                    "text-red-600 dark:text-red-400",
                )}
                data-testid="token-pnl-value"
              >
                {formatSignedUsdPnl(pnl.usd)} ({formatChangePctDisplay(pnl.pct)})
              </p>
            )}
          </div>
        </div>

        <PriceLineChart
          points={history?.points ?? []}
          isLoading={chartLoading}
          unavailable={chartUnavailable}
        />

        <div className="flex flex-wrap gap-2">
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

        <dl className="grid gap-4 border-t border-border-light pt-4 text-sm dark:border-white/10 sm:grid-cols-3">
          <div>
            <dt className="text-text-secondary dark:text-white/50">
              Market cap
            </dt>
            <dd className="font-medium text-text-body dark:text-white">
              {snapshot?.stats?.marketCap
                ? formatPortfolioUsd(snapshot.stats.marketCap)
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-text-secondary dark:text-white/50">
              24-hour volume
            </dt>
            <dd className="font-medium text-text-body dark:text-white">
              {snapshot?.stats?.volume24h
                ? formatPortfolioUsd(snapshot.stats.volume24h)
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-text-secondary dark:text-white/50">
              Circulating supply
            </dt>
            <dd className="font-medium text-text-body dark:text-white">
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
