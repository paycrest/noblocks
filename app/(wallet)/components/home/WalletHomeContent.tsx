"use client";

import { useMemo, useState } from "react";
import {
  Coins01Icon,
  MarketAnalysisIcon,
  Money03Icon,
} from "hugeicons-react";
import { getFeatureFlags } from "@/app/lib/flags";
import {
  bucketSubtitle,
  isPortfolioEmpty,
} from "@/app/lib/portfolio/display";
import {
  isEarnBucketReadOnly,
  isStocksBucketReadOnly,
  shouldShowEarnBucketRow,
  shouldShowStocksBucketRow,
  type WalletHomeActionId,
} from "@/app/lib/portfolio/home-visibility";
import { WALLET_HOME_MAX_EARN_APY_DISPLAY } from "@/app/lib/wallet-home-config";
import { usePortfolio } from "@/app/hooks/usePortfolio";
import { AddFundsGetStartedCard } from "./AddFundsGetStartedCard";
import { AddFundsSplitButton } from "./AddFundsSplitButton";
import {
  AssetBucketListSkeleton,
  AssetBucketRow,
} from "./AssetBucketRow";
import { BalanceHeader } from "./BalanceHeader";
import { ExploreCards } from "./ExploreCards";
import { HomePortfolioError } from "./HomePortfolioError";
import {
  InviteFriendsDrawer,
  WalletActionDrawerHost,
} from "./WalletActionDrawerHost";

export function WalletHomeContent() {
  const flags = useMemo(() => getFeatureFlags(), []);
  const { data, isLoading, error, refetch } = usePortfolio();
  const [activeAction, setActiveAction] = useState<WalletHomeActionId | null>(
    null,
  );
  const [inviteOpen, setInviteOpen] = useState(false);

  const showError = !isLoading && error != null;
  const showContent = !isLoading && !error && data != null;

  const isEmpty = data != null && isPortfolioEmpty(data);

  const handleAction = (action: WalletHomeActionId) => {
    setActiveAction(action);
  };

  const addFundsControl =
    showContent && !isEmpty ? (
      <AddFundsSplitButton onAction={handleAction} variant="split" />
    ) : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 pb-8">
      <BalanceHeader
        isLoading={isLoading}
        totalUsd={showError ? null : data?.totalUsd ?? null}
        trailing={addFundsControl}
      />

      {showError ? <HomePortfolioError onRetry={() => void refetch()} /> : null}

      {showContent && isEmpty ? (
        <AddFundsGetStartedCard onAddFunds={() => handleAction("buy")} />
      ) : null}

      {isLoading || showContent ? (
      <div className="overflow-hidden rounded-[20px] border border-border-light bg-accent-gray dark:border-white/10 dark:bg-white/5">
        {isLoading ? (
          <AssetBucketListSkeleton />
        ) : showContent && data ? (
          <div className="divide-y divide-border-light dark:divide-white/10">
            <AssetBucketRow
              title="My tokens"
              subtitle={bucketSubtitle(
                "tokens",
                data.buckets.tokens,
                WALLET_HOME_MAX_EARN_APY_DISPLAY,
              )}
              totalUsd={data.buckets.tokens.totalUsd}
              icon={<Coins01Icon className="size-5" />}
              href="/tokens"
            />
            {shouldShowEarnBucketRow() ? (
              <AssetBucketRow
                title="Earn positions"
                subtitle={bucketSubtitle(
                  "earn",
                  data.buckets.earn,
                  WALLET_HOME_MAX_EARN_APY_DISPLAY,
                )}
                totalUsd={data.buckets.earn.totalUsd}
                icon={<Money03Icon className="size-5" />}
                href={
                  isEarnBucketReadOnly(flags) ? undefined : "/earn"
                }
                readOnly={isEarnBucketReadOnly(flags)}
              />
            ) : null}
            {shouldShowStocksBucketRow(flags, data.buckets.stocks) ? (
              <AssetBucketRow
                title="My stocks"
                subtitle={bucketSubtitle(
                  "stocks",
                  data.buckets.stocks,
                  WALLET_HOME_MAX_EARN_APY_DISPLAY,
                )}
                totalUsd={data.buckets.stocks.totalUsd}
                icon={<MarketAnalysisIcon className="size-5" />}
                href={
                  isStocksBucketReadOnly(flags) ? undefined : "/stocks"
                }
                readOnly={isStocksBucketReadOnly(flags)}
              />
            ) : null}
          </div>
        ) : null}
      </div>
      ) : null}

      {showContent ? (
        <ExploreCards onInviteClick={() => setInviteOpen(true)} />
      ) : null}

      <WalletActionDrawerHost
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
