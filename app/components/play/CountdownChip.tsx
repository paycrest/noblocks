"use client";

/**
 * Countdown chip to the current matchday's lineup lock. Reads the public
 * players endpoint (cached) for the current matchday; once the round is
 * live/locked it flips to a "Live" indicator linking to the matchday page.
 */

import Link from "next/link";
import { Clock01Icon } from "hugeicons-react";
import { usePlayersPool, useCountdown } from "./hooks";
import { Chip, Skeleton } from "./ui";

export const CountdownChip = ({ className = "" }: { className?: string }) => {
  const { data, isLoading } = usePlayersPool();
  const matchday = data?.matchday ?? null;
  const countdown = useCountdown(matchday?.lock_at);

  if (isLoading) return <Skeleton className={`h-7 w-32 ${className}`} />;
  if (!matchday) return null;

  const locked = countdown.expired || matchday.status !== "upcoming";

  if (locked) {
    return (
      <Link href={`/play/matchday/${matchday.id}`} className={className}>
        <Chip tone={matchday.status === "final" ? "neutral" : "red"}>
          {matchday.status === "final" ? (
            <>{matchday.display_name} · Final</>
          ) : (
            <>
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent-red opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-accent-red" />
              </span>
              {matchday.display_name} · Live
            </>
          )}
        </Chip>
      </Link>
    );
  }

  const { days, hours, minutes, seconds } = countdown;
  const time =
    days > 0
      ? `${days}d ${hours}h ${minutes}m`
      : hours > 0
        ? `${hours}h ${minutes}m ${seconds}s`
        : `${minutes}m ${seconds}s`;

  return (
    <Link href="/play/team" className={className}>
      <Chip tone="lavender">
        <Clock01Icon className="size-3.5" />
        {matchday.display_name} locks in {time}
      </Chip>
    </Link>
  );
};
