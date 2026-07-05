"use client";

/**
 * /play/team — squad builder & manager. Auth + join gating happens here;
 * all the squad logic lives in TeamManager.
 */

import Link from "next/link";
import { useLogin, usePrivy } from "@privy-io/react-auth";
import { FootballIcon } from "hugeicons-react";
import { PlayApiError } from "@/app/components/play/api";
import { TeamManager } from "@/app/components/play/TeamManager";
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

  if (squadQuery.isLoading || poolQuery.isLoading) return <TeamSkeleton />;

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

  return <TeamManager squadData={squadQuery.data} poolData={poolQuery.data} />;
}
