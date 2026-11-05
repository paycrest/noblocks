"use client";

import Image from "next/image";
import Link from "next/link";
import { getFeatureFlags } from "@/app/lib/flags";
import {
  shouldShowEarnExploreCard,
  shouldShowStocksExploreCard,
} from "@/app/lib/portfolio/home-visibility";
import {
  WALLET_HOME_EXPLORE,
  WALLET_HOME_MAX_EARN_APY_DISPLAY,
} from "@/app/lib/wallet-home-config";
import { classNames } from "@/app/utils";
import { isReferralEnabled } from "@/app/utils";
import { shellFocusRingClasses } from "../shellFocusStyles";

const EXPLORE_BANNERS = {
  stocks: "/images/wallet-home/explore-stocks-banner.png",
  earn: "/images/wallet-home/explore-earn-banner.png",
  invite: "/images/wallet-home/explore-invite-banner.png",
} as const;

type ExploreCardProps = {
  title: string;
  description: string;
  bannerSrc: string;
  onClick?: () => void;
  href?: string;
};

function ExploreCard({
  title,
  description,
  bannerSrc,
  onClick,
  href,
}: ExploreCardProps) {
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
    "flex min-w-[260px] flex-1 snap-start flex-col rounded-[20px] bg-accent-gray p-3 dark:bg-white/5",
    shellFocusRingClasses,
    "rounded-[20px]",
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

export function ExploreCards({ onInviteClick }: { onInviteClick?: () => void }) {
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
