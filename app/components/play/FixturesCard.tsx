"use client";

/**
 * Fixtures & Results card for the team page — the current round's games with
 * scores/kickoffs, navigable across matchdays (like the official game's
 * fixtures panel).
 */

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft01Icon, ArrowRight01Icon } from "hugeicons-react";

/**
 * National-team flag/badge from the data provider's media CDN (the same host
 * the player photos come from). Hidden entirely if the image 404s — e.g. the
 * demo's synthetic team ids.
 */
export const TeamFlag = ({
  teamId,
  className = "size-5",
}: {
  teamId: number;
  className?: string;
}) => {
  const [failed, setFailed] = useState(false);
  if (!teamId || failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://media.api-sports.io/football/teams/${teamId}.png`}
      alt=""
      loading="lazy"
      draggable={false}
      onError={() => setFailed(true)}
      className={`${className} shrink-0 object-contain`}
    />
  );
};
import { useMatchday } from "./hooks";
import { PlayCard, Skeleton } from "./ui";
import {
  FIXTURE_FINISHED_STATUSES,
  FIXTURE_LIVE_STATUSES,
  type FixtureData,
} from "./types";

const MIN_MATCHDAY = 5; // R16 exists only in test mode; the card just 404s past the edges
const MAX_MATCHDAY = 8;

const kickoffTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const kickoffDay = (iso: string) =>
  new Date(iso).toLocaleDateString([], {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/** FIFA-reference row: home name · bordered time/score box · away name. */
const FixtureRow = ({ fixture }: { fixture: FixtureData }) => {
  const live = FIXTURE_LIVE_STATUSES.has(fixture.status);
  const finished = FIXTURE_FINISHED_STATUSES.has(fixture.status);
  return (
    <div className="grid grid-cols-[1fr,auto,1fr] items-center gap-3 py-3 text-sm">
      <span className="flex min-w-0 items-center justify-end gap-2 font-medium text-text-body dark:text-white">
        <span className="min-w-0 truncate">{fixture.home_team}</span>
        <TeamFlag teamId={fixture.home_team_id} />
      </span>
      <span className="relative">
        <span
          className={`block min-w-16 rounded-md border px-2 py-1.5 text-center text-sm font-bold tabular-nums ${
            live
              ? "border-accent-red text-accent-red"
              : "border-border-light text-text-body dark:border-white/25 dark:text-white"
          }`}
        >
          {fixture.home_score != null
            ? `${fixture.home_score} – ${fixture.away_score}`
            : kickoffTime(fixture.kickoff)}
        </span>
        {(live || finished) && (
          <span
            className={`absolute -bottom-2 left-1/2 -translate-x-1/2 rounded px-1 text-[9px] font-bold uppercase ${
              live
                ? "bg-accent-red text-white"
                : "bg-background-neutral text-text-secondary dark:bg-white/10 dark:text-white/60"
            }`}
          >
            {live ? "Live" : "FT"}
          </span>
        )}
      </span>
      <span className="flex min-w-0 items-center gap-2 font-medium text-text-body dark:text-white">
        <TeamFlag teamId={fixture.away_team_id} />
        <span className="min-w-0 truncate">{fixture.away_team}</span>
      </span>
    </div>
  );
};

export const FixturesCard = ({ initialMatchdayId }: { initialMatchdayId: number }) => {
  const [matchdayId, setMatchdayId] = useState(initialMatchdayId);
  const query = useMatchday(matchdayId);

  const byDay = new Map<string, FixtureData[]>();
  for (const fixture of query.data?.fixtures ?? []) {
    const day = kickoffDay(fixture.kickoff);
    byDay.set(day, [...(byDay.get(day) ?? []), fixture]);
  }

  return (
    <PlayCard>
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary dark:text-white/40">
          Fixtures &amp; Results
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous round"
            disabled={matchdayId <= MIN_MATCHDAY}
            onClick={() => setMatchdayId((id) => Math.max(MIN_MATCHDAY, id - 1))}
            className="flex size-8 items-center justify-center rounded-full bg-accent-gray text-text-body transition-colors hover:bg-accent-gray/70 disabled:opacity-30 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
          >
            <ArrowLeft01Icon className="size-4" />
          </button>
          <span className="min-w-24 text-center text-sm font-medium text-text-body dark:text-white">
            {query.data?.matchday.display_name ?? `Round ${matchdayId}`}
          </span>
          <button
            type="button"
            aria-label="Next round"
            disabled={matchdayId >= MAX_MATCHDAY}
            onClick={() => setMatchdayId((id) => Math.min(MAX_MATCHDAY, id + 1))}
            className="flex size-8 items-center justify-center rounded-full bg-accent-gray text-text-body transition-colors hover:bg-accent-gray/70 disabled:opacity-30 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
          >
            <ArrowRight01Icon className="size-4" />
          </button>
        </div>
      </div>

      {query.isPending ? (
        <div className="space-y-2 py-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : query.isError || !query.data ? (
        <p className="py-4 text-center text-xs text-text-secondary dark:text-white/50">
          Fixtures for this round aren&apos;t published yet.
        </p>
      ) : query.data.fixtures.length === 0 ? (
        <p className="py-4 text-center text-xs text-text-secondary dark:text-white/50">
          The bracket for this round is still being decided.
        </p>
      ) : (
        <div>
          {[...byDay.entries()].map(([day, fixtures]) => (
            <div key={day}>
              {/* Full-bleed date strip, FIFA-style */}
              <p className="-mx-4 bg-background-neutral px-4 py-2 text-center text-xs font-semibold text-text-body dark:bg-white/5 dark:text-white/80">
                {day}
              </p>
              <div className="divide-y divide-border-light dark:divide-white/5">
                {fixtures.map((fixture) => (
                  <FixtureRow key={fixture.provider_fixture_id} fixture={fixture} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Link
        href={`/play/matchday/${matchdayId}`}
        className="mt-2 block text-xs font-medium text-lavender-500 hover:underline dark:text-lavender-400"
      >
        Full matchday view →
      </Link>
    </PlayCard>
  );
};
