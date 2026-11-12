"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Coins01Icon,
  Copy01Icon,
  MarketAnalysisIcon,
  Money03Icon,
} from "hugeicons-react";
import { PiCheck } from "react-icons/pi";
import { ActionDrawer } from "@/app/components/drawer";
import { DepositDrawer } from "@/app/components/deposit/DepositDrawer";
import { SwapForm } from "@/app/components/swap/SwapForm";
import { SWAP_COPY } from "@/app/components/swap/swapConfig";
import { ReferralHubView } from "@/app/components/wallet-mobile-modal/ReferralHubView";
import { CopyAddressWarningModal } from "@/app/components/CopyAddressWarningModal";
import { BalanceSkeleton } from "@/app/components/BalanceSkeleton";
import { getFeatureFlags } from "@/app/lib/flags";
import {
  bucketSubtitle,
  formatPortfolioUsd,
  isPortfolioEmpty,
} from "@/app/lib/portfolio/display";
import {
  isEarnBucketReadOnly,
  isStocksBucketReadOnly,
  shouldShowEarnBucketRow,
  shouldShowEarnExploreCard,
  shouldShowStocksBucketRow,
  shouldShowStocksExploreCard,
  type WalletHomeActionId,
} from "@/app/lib/portfolio/home-visibility";
import {
  WALLET_HOME_ADD_FUNDS_CARD,
  WALLET_HOME_EXPLORE,
  WALLET_HOME_MAX_EARN_APY_DISPLAY,
  WALLET_HOME_SUPPORTED_ASSET_COUNT,
  WALLET_HOME_SUPPORTED_NETWORK_COUNT,
} from "@/app/lib/wallet-home-config";
import { usePortfolio } from "@/app/hooks/usePortfolio";
import { useWalletAddress } from "@/app/hooks/useWalletAddress";
import { classNames, copyToClipboard, isReferralEnabled } from "@/app/utils";
import { shellFocusRingClasses } from "../shellFocusStyles";
import {
  AddFundsSplitButton,
  walletHomePrimaryOnlyButtonClasses,
} from "./AddFundsSplitButton";
import {
  AssetBucketListSkeleton,
  AssetBucketRow,
} from "./AssetBucketRow";

const EXPLORE_BANNERS = {
  stocks: "/images/wallet-home/explore-stocks-banner.png",
  earn: "/images/wallet-home/explore-earn-banner.png",
  invite: "/images/wallet-home/explore-invite-banner.png",
} as const;

const ACTION_TITLES: Record<WalletHomeActionId, string> = {
  buy: "Buy",
  sell: "Sell",
  receive: "Receive",
  transfer: "Transfer",
  swap: "Swap",
};

function BalanceHeader({
  isLoading,
  totalUsd,
  trailing,
}: {
  isLoading: boolean;
  totalUsd: string | null;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1">
        <p className="text-sm text-text-secondary dark:text-white/50">
          Your balances
        </p>
        {isLoading ? (
          <BalanceSkeleton className="h-10 w-36 rounded-lg" />
        ) : (
          <p className="text-[35px] font-semibold leading-9 tracking-[-1.05px] text-text-body dark:text-white">
            {totalUsd != null ? formatPortfolioUsd(totalUsd) : "—"}
          </p>
        )}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}

function HomePortfolioError({
  message = "We couldn't load your balances.",
  onRetry,
}: {
  message?: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-border-light bg-accent-gray/40 px-4 py-3 dark:border-white/10 dark:bg-white/5"
    >
      <p className="text-sm text-text-body dark:text-white">{message}</p>
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

const SUPPORT_ASSET_ICONS = [
  { src: "/images/wallet-home/support-usdc.svg", label: "USDC" },
  { src: "/images/wallet-home/support-btc.svg", label: "Bitcoin" },
  { src: "/images/wallet-home/support-eth.svg", label: "Ethereum" },
] as const;

function SupportAssetIconStack() {
  return (
    <div className="flex shrink-0 items-center" aria-hidden>
      {SUPPORT_ASSET_ICONS.map((icon, index) => (
        <Image
          key={icon.src}
          src={icon.src}
          alt=""
          width={18}
          height={18}
          className={classNames(
            "size-[18px]",
            index < SUPPORT_ASSET_ICONS.length - 1 && "-mr-1.5",
          )}
        />
      ))}
    </div>
  );
}

function AddFundsGetStartedCard({ onAddFunds }: { onAddFunds: () => void }) {
  return (
    <div className="flex flex-col gap-4 rounded-[20px] bg-accent-gray py-4 pl-[30px] pr-4 dark:bg-white/5 sm:h-[96px] sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-0">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold leading-none text-text-body dark:text-white">
          {WALLET_HOME_ADD_FUNDS_CARD.title}
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-text-secondary dark:text-white/50">
          <SupportAssetIconStack />
          <span>
            {WALLET_HOME_ADD_FUNDS_CARD.supportLine(
              WALLET_HOME_SUPPORTED_ASSET_COUNT,
              WALLET_HOME_SUPPORTED_NETWORK_COUNT,
            )}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={onAddFunds}
        className={walletHomePrimaryOnlyButtonClasses}
      >
        Add funds
      </button>
    </div>
  );
}

function ExploreCard({
  title,
  description,
  bannerSrc,
  onClick,
  href,
}: {
  title: string;
  description: string;
  bannerSrc: string;
  onClick?: () => void;
  href?: string;
}) {
  const content = (
    <div className="flex flex-col gap-4">
      <div className="relative h-[127px] overflow-hidden rounded-[10px]">
        <Image
          src={bannerSrc}
          alt=""
          fill
          className="object-cover"
          sizes="(max-width: 768px) 80vw, 320px"
          aria-hidden
        />
      </div>
      <div className="space-y-2.5">
        <h3 className="text-base font-semibold text-text-body dark:text-white">
          {title}
        </h3>
        <p className="text-sm font-medium leading-snug text-text-secondary dark:text-white/50">
          {description}
        </p>
      </div>
    </div>
  );

  const base = classNames(
    "flex h-[233px] min-w-[260px] flex-1 snap-start flex-col rounded-[20px] bg-accent-gray p-3 dark:bg-white/5",
    shellFocusRingClasses,
    (onClick || href) &&
      "cursor-pointer transition hover:bg-accent-gray/80 dark:hover:bg-white/[0.07]",
  );

  if (href) {
    return (
      <Link href={href} className={base}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={classNames(base, "text-left")}
    >
      {content}
    </button>
  );
}

function ExploreCards({ onInviteClick }: { onInviteClick?: () => void }) {
  const flags = getFeatureFlags();
  const showStocks = shouldShowStocksExploreCard(flags);
  const showEarn = shouldShowEarnExploreCard(flags);
  const showInvite = isReferralEnabled();

  const cards: React.ReactNode[] = [];

  if (showStocks) {
    cards.push(
      <ExploreCard
        key="stocks"
        href="/stocks"
        title={WALLET_HOME_EXPLORE.stocks.title}
        description={WALLET_HOME_EXPLORE.stocks.description}
        bannerSrc={EXPLORE_BANNERS.stocks}
      />,
    );
  }

  if (showEarn) {
    cards.push(
      <ExploreCard
        key="earn"
        href="/earn"
        title={WALLET_HOME_EXPLORE.earn.title(WALLET_HOME_MAX_EARN_APY_DISPLAY)}
        description={WALLET_HOME_EXPLORE.earn.description}
        bannerSrc={EXPLORE_BANNERS.earn}
      />,
    );
  }

  if (showInvite) {
    cards.push(
      <ExploreCard
        key="invite"
        title={WALLET_HOME_EXPLORE.invite.title}
        description={WALLET_HOME_EXPLORE.invite.description}
        bannerSrc={EXPLORE_BANNERS.invite}
        onClick={onInviteClick}
      />,
    );
  }

  if (cards.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-text-body dark:text-white">
        Explore
      </h2>
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 snap-x snap-mandatory">
        {cards}
      </div>
    </section>
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

function ReceiveDepositPanel({
  walletAddress,
  onCopyWarningOpen,
}: {
  walletAddress: string | undefined;
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
        copyFeedbackTimeoutRef.current = null;
      }
    };
  }, []);

  const handleCopyAddress = async () => {
    if (!walletAddress) return;
    const ok = await copyToClipboard(walletAddress, "Address");
    if (!isMountedRef.current || !ok) return;
    setIsAddressCopied(true);
    copyFeedbackTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setIsAddressCopied(false);
      }
    }, 2000);
    if (localStorage.getItem("hideAddressWarningModal") !== "true") {
      onCopyWarningOpen();
    }
  };

  if (!walletAddress) {
    return (
      <div
        role="alert"
        className="rounded-2xl border border-border-light bg-accent-gray/40 px-4 py-3 dark:border-white/10 dark:bg-white/5"
      >
        <p className="text-sm font-medium text-text-body dark:text-white">
          Wallet address unavailable
        </p>
        <p className="mt-1 text-sm text-text-secondary dark:text-white/60">
          We couldn&apos;t load your deposit address. Try again later or sign
          out and back in.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-secondary dark:text-white/60">
        Receive supported tokens to your Noblocks wallet address.
      </p>
      <div className="relative flex min-h-[80px] flex-col gap-3 rounded-2xl border border-border-light bg-white px-3 py-3 dark:border-white/10 dark:bg-surface-canvas">
        <div className="flex w-full items-start justify-between gap-4">
          <p className="min-w-0 flex-1 break-all text-base font-medium text-text-body dark:text-white/80">
            {walletAddress}
          </p>
          <button
            type="button"
            onClick={() => void handleCopyAddress()}
            title="Copy wallet address"
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

function WalletActionDrawerHost({
  activeAction,
  onClose,
}: {
  activeAction: WalletHomeActionId | null;
  onClose: () => void;
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
      case "buy":
        return <RampActionPlaceholder mode="buy" />;
      case "sell":
        return <RampActionPlaceholder mode="sell" />;
      case "receive":
        return (
          <ReceiveDepositPanel
            walletAddress={walletAddress}
            onCopyWarningOpen={() => setAddressWarningOpen(true)}
          />
        );
      case "swap":
        return (
          <SwapForm
            onClose={onClose}
            showNetworkPicker
            fromLabel={SWAP_COPY.from}
            toLabel={SWAP_COPY.to}
            ctaLabel={SWAP_COPY.reviewCta}
            confirmBeforeSubmit
            successPresentation="overlay"
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
        title={activeAction ? ACTION_TITLES[activeAction] : "Action"}
        subtitle={activeAction === "swap" ? SWAP_COPY.subtitle : undefined}
        onRequestClose={onClose}
        bodyAlign="start"
        showPoweredByFooter={activeAction !== "swap"}
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

export function WalletHomeContent() {
  const router = useRouter();
  const { ready, authenticated } = usePrivy();
  const authSettling = !ready || !authenticated;
  const flags = useMemo(() => getFeatureFlags(), []);
  const { data, isLoading, error, refetch } = usePortfolio({
    enabled: ready && authenticated,
  });
  const [activeAction, setActiveAction] = useState<WalletHomeActionId | null>(
    null,
  );
  const [depositOpen, setDepositOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const portfolioLoading =
    authSettling ||
    isLoading ||
    (ready && authenticated && data == null && error == null);
  const showError = !portfolioLoading && error != null;
  const showContent = !portfolioLoading && !error && data != null;

  const isEmpty = data != null && isPortfolioEmpty(data);

  const handleAction = (action: WalletHomeActionId) => {
    // Transfer is the Home full-page widget (KAN-973), not a drawer step.
    if (action === "transfer") {
      router.push("/transfer");
      return;
    }
    setDepositOpen(false);
    setActiveAction(action);
  };

  const openDepositDrawer = () => {
    setActiveAction(null);
    setDepositOpen(true);
  };

  const addFundsControl =
    showContent && !isEmpty ? (
      <AddFundsSplitButton
        onPrimaryClick={openDepositDrawer}
        onAction={handleAction}
        variant="split"
      />
    ) : null;

  return (
    <div className="mx-auto flex w-full max-w-[921px] flex-col gap-[49px] pb-8">
      <BalanceHeader
        isLoading={portfolioLoading}
        totalUsd={showError ? null : data?.totalUsd ?? null}
        trailing={addFundsControl}
      />

      {showError ? <HomePortfolioError onRetry={() => void refetch()} /> : null}

      {showContent && isEmpty ? (
        <AddFundsGetStartedCard onAddFunds={openDepositDrawer} />
      ) : null}

      {portfolioLoading || showContent ? (
      <div className="overflow-hidden rounded-[20px] border border-border-light bg-accent-gray dark:border-white/10 dark:bg-white/5">
        {portfolioLoading ? (
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

      <DepositDrawer
        isOpen={depositOpen}
        onRequestClose={() => setDepositOpen(false)}
      />
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

/** Exported for unit tests covering Explore card shell and banner art. */
export { ExploreCards };
