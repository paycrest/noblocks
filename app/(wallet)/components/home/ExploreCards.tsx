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

type ExploreCardProps = {
  title: string;
  description: string;
  className: string;
  illustration: React.ReactNode;
  onClick?: () => void;
  href?: string;
};

function ExploreCard({
  title,
  description,
  className,
  illustration,
  onClick,
  href,
}: ExploreCardProps) {
  const content = (
    <>
      <div className="relative z-[1] max-w-[58%] space-y-2">
        <h3 className="text-base font-semibold leading-snug text-white">
          {title}
        </h3>
        <p className="text-sm leading-snug text-white/80">{description}</p>
      </div>
      <div className="pointer-events-none absolute bottom-0 right-0 top-0 w-[42%]">
        {illustration}
      </div>
    </>
  );

  const base = classNames(
    "relative flex min-h-[140px] min-w-[260px] flex-1 snap-start overflow-hidden rounded-2xl p-4",
    className,
    (onClick || href) && "cursor-pointer transition hover:brightness-105",
  );

  if (href) {
    return (
      <Link href={href} className={base}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={classNames(base, "text-left")}>
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
        className="bg-[#2F6BFF]"
        illustration={
          <div className="flex h-full items-end justify-end gap-2 p-3 opacity-95">
            {["/images/play-promo/hero-player-1.png", "/images/play-promo/hero-player-3.png"].map(
              (src) => (
                <Image
                  key={src}
                  src={src}
                  alt=""
                  width={48}
                  height={48}
                  className="size-12 rounded-full border-2 border-white/30 object-cover"
                  aria-hidden
                />
              ),
            )}
          </div>
        }
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
        className="bg-[#E85D4C]"
        illustration={
          <Image
            src="/images/rates-graph-mobile.svg"
            alt=""
            width={120}
            height={80}
            className="absolute bottom-2 right-2 h-20 w-auto opacity-90 dark:invert"
            aria-hidden
          />
        }
      />,
    );
  }

  if (showInvite) {
    cards.push(
      <ExploreCard
        key="invite"
        title={WALLET_HOME_EXPLORE.invite.title}
        description={WALLET_HOME_EXPLORE.invite.description}
        className="bg-[#F5B800]"
        onClick={onInviteClick}
        illustration={
          <Image
            src="/images/referral-graphic.png"
            alt=""
            width={140}
            height={120}
            className="absolute bottom-0 right-0 h-full w-auto max-w-none object-contain object-bottom"
            aria-hidden
          />
        }
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
