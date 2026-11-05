"use client";

import { useMemo, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { ActionDrawer } from "@/app/components/drawer";
import { ReferralHubView } from "@/app/components/wallet-mobile-modal/ReferralHubView";
import { BalanceSkeleton } from "@/app/components/BalanceSkeleton";
import { usePortfolio } from "@/app/hooks/usePortfolio";
import { useTokenMarketQuotes } from "@/app/hooks/useTokenMarket";
import {
  aggregateTokenHoldings,
  tokenDetailHref,
} from "@/app/lib/tokens/aggregate-holdings";
import { resolveMarketTokenId } from "@/app/lib/tokens/market-id";
import { formatChangePctDisplay } from "@/app/lib/tokens/todays-pnl";
import {
  formatTokenBalanceAmount,
  formatTokenRowUsd,
  resolveTokenImageUrl,
} from "@/app/lib/tokens/token-display";
import { formatPortfolioUsd } from "@/app/lib/portfolio/display";
import type { WalletHomeActionId } from "@/app/lib/portfolio/home-visibility";
import { classNames } from "@/app/utils";
import { ExploreCards } from "../home/WalletHomeContent";
import { AddFundsSplitButton } from "../home/AddFundsSplitButton";
import { shellFocusRingClasses } from "../shellFocusStyles";
import {
  TokenActionDrawerHost,
  TokenListSkeleton,
  TokenRowLink,
  TokensEmptyState,
} from "./TokenPageShared";

const ACTION_TITLES: Record<WalletHomeActionId, string> = {
  buy: "Buy",
  sell: "Sell",
  receive: "Receive",
  transfer: "Transfer",
  swap: "Swap",
};

function PortfolioError({ onRetry }: { onRetry: () => void }) {
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
}: {
  activeAction: WalletHomeActionId | null;
  onClose: () => void;
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
  const { data, isLoading, error, refetch } = usePortfolio({
    enabled: ready && authenticated,
  });
  const [activeAction, setActiveAction] = useState<WalletHomeActionId | null>(
    null,
  );
  const [inviteOpen, setInviteOpen] = useState(false);

  const portfolioLoading =
    !ready ||
    !authenticated ||
    isLoading ||
    (ready && authenticated && data == null && error == null);

  const rows = useMemo(
    () =>
      data ? aggregateTokenHoldings(data.buckets.tokens.holdings) : [],
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
            onAction={(action) => setActiveAction(action)}
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
        <TokensEmptyState onAddFunds={() => setActiveAction("buy")} />
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
                  href={tokenDetailHref(row.symbol)}
                />
              );
            })}
          </div>
        </section>
      ) : null}

      {showContent ? (
        <ExploreCards onInviteClick={() => setInviteOpen(true)} />
      ) : null}

      <TokensFundsDrawerHost
        activeAction={activeAction}
        onClose={() => setActiveAction(null)}
      />
      <InviteFriendsDrawer
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
      />
    </div>
  );
}
