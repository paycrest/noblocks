"use client";

/**
 * /play campaign landing: hero, how it works, prize breakdown, top-5
 * leaderboard preview and the join flow (Privy login, then the username
 * modal).
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useLogin, usePrivy } from "@privy-io/react-auth";
import {
  ArrowRight01Icon,
  ChampionIcon,
  FootballIcon,
  UserGroupIcon,
} from "hugeicons-react";
import { trackEvent } from "@/app/hooks/analytics/client";
import { JoinModal } from "@/app/components/play/JoinModal";
import { LeaderboardTable } from "@/app/components/play/LeaderboardTable";
import { useJoinStatus, useLeaderboard } from "@/app/components/play/hooks";
import {
  ErrorState,
  PlayCard,
  Skeleton,
  primaryButtonClasses,
} from "@/app/components/play/ui";

const PRIZE_TIERS = [
  { ranks: "Ranks 1–5", amount: "40 USDC each" },
  { ranks: "Ranks 6–10", amount: "20 USDC each" },
];

const JoinCTA = ({ className = "" }: { className?: string }) => {
  const { ready, authenticated } = usePrivy();
  const { joined, isLoading } = useJoinStatus();
  const [modalOpen, setModalOpen] = useState(false);
  const openAfterLogin = useRef(false);

  const { login } = useLogin({
    onComplete: () => {
      if (openAfterLogin.current) {
        openAfterLogin.current = false;
        setModalOpen(true);
      }
    },
  });

  if (!ready || isLoading) {
    return <Skeleton className={`h-11 w-40 ${className}`} />;
  }

  if (joined) {
    return (
      <Link
        href="/play/team"
        className={`${primaryButtonClasses} inline-flex items-center gap-2 ${className}`}
      >
        My Team
        <ArrowRight01Icon className="size-4" />
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (!authenticated) {
            openAfterLogin.current = true;
            login();
          } else {
            setModalOpen(true);
          }
        }}
        className={`${primaryButtonClasses} ${className}`}
      >
        Join the league
      </button>
      <JoinModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
};

const LeaderboardPreview = () => {
  const { data, isPending, isError, refetch } = useLeaderboard(1);

  if (isPending) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <ErrorState
        message="Couldn't load the leaderboard."
        onRetry={() => refetch()}
      />
    );
  }
  const rows = (data?.rows ?? []).slice(0, 5);
  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border-light px-6 py-8 text-center text-sm text-text-secondary dark:border-white/10 dark:text-white/50">
        No managers on the board yet. Join now and claim the top spot.
      </p>
    );
  }
  return <LeaderboardTable rows={rows} compact />;
};

export default function PlayLandingPage() {
  useEffect(() => {
    trackEvent("play_landing_view");
  }, []);

  return (
    <div className="space-y-10">
      {/* Hero */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-lavender-500 via-lavender-600 to-lavender-800 px-6 py-10 text-white sm:px-10 sm:py-14"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-10 size-48 rounded-full bg-white/10 blur-2xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-16 -left-8 size-56 rounded-full bg-white/10 blur-3xl"
        />
        <div className="relative max-w-2xl space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
            World Cup 2026 · Quarter-finals to the Final
          </p>
          <h1 className="text-3xl font-bold leading-tight sm:text-4xl">
            The Noblocks World Cup Fantasy League
          </h1>
          <p className="max-w-xl text-sm text-white/80 sm:text-base">
            Build your dream XI for the knockout rounds, score points every
            matchday, and invite friends to qualify for a share of{" "}
            <span className="font-semibold text-white">300 USDC on Base</span>.
            Free to play.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <JoinCTA />
            <Link
              href="/play/terms"
              className="min-h-11 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/20"
            >
              Read the rules
            </Link>
          </div>
        </div>
      </motion.section>

      {/* How it works */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-text-body dark:text-white">
          How it works
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <PlayCard className="space-y-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-lavender-100 dark:bg-lavender-500/15">
              <FootballIcon className="size-5 text-lavender-600 dark:text-lavender-300" />
            </div>
            <h3 className="text-sm font-semibold text-text-body dark:text-white">
              Build your squad and score points
            </h3>
            <p className="text-sm text-text-secondary dark:text-white/50">
              Pick 15 players within your budget: 2 goalkeepers, 5 defenders,
              5 midfielders and 3 forwards. Set your starting XI and captain
              before each round locks. Goals, assists, clean sheets and more
              earn points through the quarter-finals, semi-finals and the
              Final, and your rank on the global leaderboard decides your
              prize.
            </p>
          </PlayCard>
          <PlayCard className="space-y-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-lavender-100 dark:bg-lavender-500/15">
              <UserGroupIcon className="size-5 text-lavender-600 dark:text-lavender-300" />
            </div>
            <h3 className="text-sm font-semibold text-text-body dark:text-white">
              Invite friends to unlock the prize
            </h3>
            <p className="text-sm text-text-secondary dark:text-white/50">
              Points decide where you rank, but only qualified managers can
              win. To qualify, invite 5 friends who each complete $5 or more
              in total on and off-ramp volume on Noblocks before the
              deadline. The $5 adds up across all of their transactions, so
              no single large payment is needed.
            </p>
          </PlayCard>
        </div>
      </section>

      {/* Prize breakdown */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-text-body dark:text-white">
          Prize pool: 300 USDC on Base
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {PRIZE_TIERS.map(({ ranks, amount }, index) => (
            <PlayCard key={ranks} className="flex items-center gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-yellow-secondary dark:bg-yellow-primary/10">
                <ChampionIcon
                  className={`size-6 ${index === 0 ? "text-yellow-primary" : "text-text-secondary dark:text-white/40"}`}
                />
              </div>
              <div>
                <p className="text-sm font-semibold text-text-body dark:text-white">
                  {ranks}
                </p>
                <p className="text-sm text-text-secondary dark:text-white/50">
                  {amount}
                </p>
              </div>
            </PlayCard>
          ))}
        </div>
        <p className="text-xs text-text-secondary dark:text-white/50">
          Prizes go to the top 10 qualified managers by final rank. Anyone
          who has not qualified or has opted out is skipped when prizes are
          assigned. Full details in the{" "}
          <Link
            href="/play/terms"
            className="text-lavender-500 underline hover:text-lavender-600"
          >
            terms
          </Link>
          .
        </p>
      </section>

      {/* Leaderboard preview */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-body dark:text-white">
            Top of the table
          </h2>
          <Link
            href="/play/leaderboard"
            className="flex items-center gap-1 text-sm font-medium text-lavender-500 hover:text-lavender-600"
          >
            Full leaderboard
            <ArrowRight01Icon className="size-4" />
          </Link>
        </div>
        <LeaderboardPreview />
      </section>

      {/* Bottom CTA */}
      <section className="flex flex-col items-center gap-3 rounded-3xl bg-background-neutral px-6 py-10 text-center dark:bg-white/5">
        <h2 className="text-xl font-semibold text-text-body dark:text-white">
          Ready to manage your way to the Final?
        </h2>
        <p className="max-w-md text-sm text-text-secondary dark:text-white/50">
          Joining takes less than a minute. Pick a username, build your
          squad, and you&apos;re on the board.
        </p>
        <JoinCTA className="mt-2" />
      </section>
    </div>
  );
}
