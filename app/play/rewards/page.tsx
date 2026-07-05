"use client";

/**
 * /play/rewards — referral link card (existing referral system's code),
 * qualification progress, giveaway opt-in toggle and the share-rank card.
 */

import Link from "next/link";
import { useLogin, usePrivy } from "@privy-io/react-auth";
import { toast } from "sonner";
import { ChampionIcon, Copy01Icon, Share08Icon } from "hugeicons-react";
import { trackEvent } from "@/app/hooks/analytics/client";
import { PlayApiError } from "@/app/components/play/api";
import { RewardsProgress } from "@/app/components/play/RewardsProgress";
import { ShareRankCard } from "@/app/components/play/ShareRankCard";
import {
  useCopyToClipboard,
  useGiveawayOptIn,
  useLeaderboard,
  useReferralData,
  useRewards,
} from "@/app/components/play/hooks";
import {
  EmptyState,
  ErrorState,
  PlayCard,
  Skeleton,
  primaryButtonClasses,
  secondaryButtonClasses,
} from "@/app/components/play/ui";

const RewardsSkeleton = () => (
  <div className="space-y-4">
    <Skeleton className="h-8 w-40" />
    <Skeleton className="h-36 w-full rounded-2xl" />
    <Skeleton className="h-64 w-full rounded-2xl" />
    <Skeleton className="h-24 w-full rounded-2xl" />
  </div>
);

const ReferralLinkCard = () => {
  const referralData = useReferralData();
  const copy = useCopyToClipboard();

  if (referralData.isPending) {
    return <Skeleton className="h-36 w-full rounded-2xl" />;
  }

  const code = referralData.data?.referral_code;
  if (!code) {
    return (
      <PlayCard>
        <p className="text-sm text-text-secondary dark:text-white/50">
          Couldn&apos;t load your referral code.{" "}
          <button
            type="button"
            onClick={() => referralData.refetch()}
            className="font-medium text-lavender-500 hover:text-lavender-600"
          >
            Try again
          </button>
        </p>
      </PlayCard>
    );
  }

  const link = `https://noblocks.xyz?ref=${code}`;

  const handleCopy = async () => {
    const ok = await copy(link);
    if (ok) {
      toast.success("Referral link copied");
      trackEvent("referral_link_copied", { code });
    } else {
      toast.error("Couldn't copy the link");
    }
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Join me on Noblocks Play",
          text: "Join my World Cup fantasy league on Noblocks:",
          url: link,
        });
        trackEvent("referral_link_shared", { code, source: "rewards" });
      } else {
        await handleCopy();
        trackEvent("referral_link_shared", {
          code,
          source: "rewards_clipboard_fallback",
        });
      }
    } catch {
      // user dismissed the share sheet
    }
  };

  return (
    <PlayCard className="space-y-3">
      <h2 className="text-base font-semibold text-text-body dark:text-white">
        Your referral link
      </h2>
      <p className="truncate rounded-xl bg-background-neutral px-4 py-3 font-mono text-sm text-text-body dark:bg-white/5 dark:text-white">
        {link}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className={`${primaryButtonClasses} inline-flex items-center gap-2`}
        >
          <Copy01Icon className="size-4" />
          Copy link
        </button>
        <button
          type="button"
          onClick={handleShare}
          className={`${secondaryButtonClasses} inline-flex items-center gap-2`}
        >
          <Share08Icon className="size-4" />
          Share
        </button>
      </div>
    </PlayCard>
  );
};

export default function RewardsPage() {
  const { ready, authenticated } = usePrivy();
  const { login } = useLogin();
  const rewards = useRewards();
  const referralData = useReferralData();
  const optInMutation = useGiveawayOptIn();
  // Own username (public leaderboard handle) for the share-rank card.
  const myPage = useLeaderboard(1, true);
  const myUsername = myPage.data?.rows.find((row) => row.is_me)?.username;

  if (!ready || (authenticated && rewards.isPending)) {
    return <RewardsSkeleton />;
  }

  if (!authenticated) {
    return (
      <EmptyState
        icon={<ChampionIcon className="size-8 text-lavender-500" />}
        title="Sign in to see your rewards"
        description="Track your referral qualification progress and share your league rank."
        action={
          <button
            type="button"
            onClick={() => login()}
            className={primaryButtonClasses}
          >
            Sign in
          </button>
        }
      />
    );
  }

  if (
    rewards.error instanceof PlayApiError &&
    rewards.error.code === "NOT_JOINED"
  ) {
    return (
      <EmptyState
        icon={<ChampionIcon className="size-8 text-lavender-500" />}
        title="Join the league to unlock rewards"
        description="The 300 USDC giveaway is for league participants — joining takes under a minute."
        action={
          <Link href="/play" className={primaryButtonClasses}>
            Join the league
          </Link>
        }
      />
    );
  }

  if (rewards.isError || !rewards.data) {
    return (
      <ErrorState
        message="Couldn't load your rewards."
        onRetry={() => rewards.refetch()}
      />
    );
  }

  const data = rewards.data;

  const handleToggleOptIn = async () => {
    const next = !data.giveaway_opt_in;
    try {
      await optInMutation.mutateAsync(next);
      if (!next) trackEvent("giveaway_opt_out");
      toast.success(
        next
          ? "You're in the giveaway"
          : "You're now playing for bragging rights only",
      );
    } catch (error) {
      toast.error(
        error instanceof PlayApiError
          ? error.message
          : "Couldn't update your preference",
      );
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-text-body dark:text-white">
        Rewards
      </h1>

      <ReferralLinkCard />

      <RewardsProgress rewards={data} />

      {/* Giveaway opt-in */}
      <PlayCard className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-text-body dark:text-white">
            300 USDC giveaway
          </p>
          <p className="text-xs text-text-secondary dark:text-white/50">
            {data.giveaway_opt_in
              ? "You're competing for the prize pool."
              : "You're playing for bragging rights only."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={data.giveaway_opt_in}
          disabled={optInMutation.isPending}
          onClick={handleToggleOptIn}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
            data.giveaway_opt_in
              ? "bg-lavender-500"
              : "bg-gray-300 dark:bg-white/20"
          }`}
        >
          <span
            className={`absolute left-0 top-0.5 size-5 rounded-full bg-white transition-transform ${
              data.giveaway_opt_in ? "translate-x-[22px]" : "translate-x-0.5"
            }`}
          />
        </button>
      </PlayCard>

      {data.rank != null && referralData.data?.referral_code && myUsername && (
        <ShareRankCard
          username={myUsername}
          rank={data.rank}
          points={data.total_points}
          referrals={data.activated}
          code={referralData.data.referral_code}
        />
      )}
    </div>
  );
}
