"use client";

/**
 * /play/team — squad builder & manager. Auth + join gating happens here;
 * all the squad logic lives in TeamManager.
 */

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useLogin, usePrivy } from "@privy-io/react-auth";
import { Cancel01Icon, FootballIcon } from "hugeicons-react";
import { PlayApiError } from "@/app/components/play/api";
import { TeamManager } from "@/app/components/play/TeamManager";
import { ShareSquadCard } from "@/app/components/play/ShareSquadCard";
import { SquadKey } from "@/app/components/play/SquadKey";
import { RoundStrip } from "@/app/components/play/RoundStrip";
import { FixturesCard } from "@/app/components/play/FixturesCard";
import { HowToScore } from "@/app/components/play/HowToScore";
import { usePlayersPool, useSquad } from "@/app/components/play/hooks";
import {
  EmptyState,
  ErrorState,
  Skeleton,
  primaryButtonClasses,
} from "@/app/components/play/ui";

const TeamSkeleton = () => (
  <div className="space-y-4">
    <div className="flex gap-2">
      <Skeleton className="h-7 w-28" />
      <Skeleton className="h-7 w-36" />
      <Skeleton className="h-7 w-24" />
    </div>
    <Skeleton className="h-2 w-full" />
    <Skeleton className="h-[24rem] w-full rounded-2xl" />
    <Skeleton className="h-24 w-full rounded-2xl" />
  </div>
);

export default function TeamPage() {
  const { ready, authenticated } = usePrivy();
  const { login } = useLogin();
  const squadQuery = useSquad();
  const poolQuery = usePlayersPool();
  const [showScoring, setShowScoring] = useState(false);

  if (!ready) return <TeamSkeleton />;

  if (!authenticated) {
    return (
      <EmptyState
        icon={<FootballIcon className="size-8 text-lavender-500" />}
        title="Sign in to manage your team"
        description="Log in with your Noblocks account to build your World Cup fantasy squad."
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

  // isPending (not isLoading): a query disabled while Privy initializes
  // reports isLoading=false, which used to flash the error/empty state.
  if (squadQuery.isPending || poolQuery.isPending) return <TeamSkeleton />;

  if (
    squadQuery.error instanceof PlayApiError &&
    squadQuery.error.code === "NOT_JOINED"
  ) {
    return (
      <EmptyState
        icon={<FootballIcon className="size-8 text-lavender-500" />}
        title="You haven't joined the league yet"
        description="Pick a username and enter the league — then come back here to build your squad."
        action={
          <Link href="/play" className={primaryButtonClasses}>
            Join the league
          </Link>
        }
      />
    );
  }

  if (squadQuery.isError || poolQuery.isError || !poolQuery.data) {
    return (
      <ErrorState
        message="Couldn't load your team."
        onRetry={() => {
          squadQuery.refetch();
          poolQuery.refetch();
        }}
      />
    );
  }

  if (!squadQuery.data) return <TeamSkeleton />;

  const matchdayId = poolQuery.data.matchday?.id ?? squadQuery.data.matchday.id;

  return (
    <div className="xl:flex xl:items-start xl:gap-6">
      <div className="min-w-0 flex-1 space-y-4">
        <RoundStrip
          scores={Object.fromEntries(
            (squadQuery.data.matchday_scores ?? []).map((s) => [
              s.matchday_id,
              s.points,
            ]),
          )}
        />
        <TeamManager squadData={squadQuery.data} poolData={poolQuery.data} />
        <SquadKey onHowToScore={() => setShowScoring(true)} />
        {squadQuery.data.username && (
          <ShareSquadCard username={squadQuery.data.username} />
        )}
        <FixturesCard initialMatchdayId={matchdayId} />
      </div>
      <aside className="hidden xl:sticky xl:top-24 xl:block xl:w-80 xl:shrink-0">
        <HowToScore scoring={poolQuery.data.settings.scoring} />
      </aside>

      {/* Mobile: scoring rules as a bottom-sheet modal (Key card link) */}
      <AnimatePresence>
        {showScoring && (
          <div className="fixed inset-0 z-[60] xl:hidden">
            <motion.button
              type="button"
              aria-label="Close"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowScoring(false)}
              className="absolute inset-0 w-full cursor-default bg-black/40"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 32 }}
              className="absolute inset-x-0 bottom-0 mx-auto max-h-[85dvh] max-w-lg overflow-y-auto rounded-t-3xl bg-white p-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-xl dark:bg-surface-overlay"
            >
              <div className="mb-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowScoring(false)}
                  aria-label="Close"
                  className="flex size-9 items-center justify-center rounded-full bg-accent-gray text-gray-900 dark:bg-white/5 dark:text-white"
                >
                  <Cancel01Icon className="size-4" />
                </button>
              </div>
              <HowToScore scoring={poolQuery.data.settings.scoring} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
