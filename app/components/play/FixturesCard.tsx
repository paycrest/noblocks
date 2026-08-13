"use client";

/**
 * Fixtures & Results card for the team page — the current round's games with
 * scores/kickoffs, navigable across matchdays (like the official game's
 * fixtures panel).
 */

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft01Icon, ArrowRight01Icon } from "hugeicons-react";
import { ClubBadge } from "./ClubJersey";
import { useMatchday, useMatchdays } from "./hooks";
import { PlayCard, Skeleton } from "./ui";
import {
  FIXTURE_FINISHED_STATUSES,
  FIXTURE_LIVE_STATUSES,
  type FixtureData,
} from "./types";

/** @deprecated Use ClubBadge — kept as alias for matchday page imports. */
export const TeamFlag = ({
  teamId,
  className = "size-5",
}: {
  teamId: number;
  className?: string;
}) => <ClubBadge teamId={teamId} className={className} />;

const kickoffTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const kickoffDay = (iso: string) =>
  new Date(iso).toLocaleDateString([], {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/** Fixture row: home · time/score · away, with stylized club codes (not crests). */
const FixtureRow = ({ fixture }: { fixture: FixtureData }) => {
  const live = FIXTURE_LIVE_STATUSES.has(fixture.status);
  const finished = FIXTURE_FINISHED_STATUSES.has(fixture.status);
  return (
    <div className="grid grid-cols-[1fr,auto,1fr] items-center gap-3 px-1 py-4 text-sm">
      <span className="flex min-w-0 items-center justify-end gap-2.5 font-medium text-text-body dark:text-white">
        <span className="min-w-0 truncate leading-snug">{fixture.home_team}</span>
        <ClubBadge
          teamId={fixture.home_team_id}
          title={fixture.home_team}
          className="size-7 text-[9px]"
        />
      </span>
      <span className="relative">
        <span
          className={`block min-w-[4.5rem] rounded-lg border px-2.5 py-2 text-center text-sm font-bold tabular-nums ${
            live
              ? "border-accent-red bg-accent-red/10 text-accent-red"
              : finished
                ? "border-border-light bg-background-neutral text-text-body dark:border-white/10 dark:bg-white/5 dark:text-white"
                : "border-border-light bg-white text-text-body dark:border-white/10 dark:bg-white/5 dark:text-white"
          }`}
        >
          {finished || live
            ? `${fixture.home_score ?? 0}–${fixture.away_score ?? 0}`
            : kickoffTime(fixture.kickoff)}
        </span>
        {live && (
          <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-accent-red px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
            Live
          </span>
        )}
      </span>
      <span className="flex min-w-0 items-center gap-2.5 font-medium text-text-body dark:text-white">
        <ClubBadge
          teamId={fixture.away_team_id}
          title={fixture.away_team}
          className="size-7 text-[9px]"
        />
        <span className="min-w-0 truncate leading-snug">{fixture.away_team}</span>
      </span>
    </div>
  );
};

export const FixturesCard = ({ initialMatchdayId }: { initialMatchdayId: number }) => {
  const [matchdayId, setMatchdayId] = useState(initialMatchdayId);
  const query = useMatchday(matchdayId);
  const { data: allMatchdays } = useMatchdays();
  const ids = (allMatchdays?.matchdays ?? []).map((m) => m.id);
  const idx = ids.indexOf(matchdayId);
  const prevId = idx > 0 ? ids[idx - 1] : null;
  const nextId = idx >= 0 && idx < ids.length - 1 ? ids[idx + 1] : null;

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
            aria-label="Previous gameweek"
            disabled={prevId == null}
            onClick={() => prevId != null && setMatchdayId(prevId)}
            className="flex size-8 items-center justify-center rounded-full bg-accent-gray text-text-body transition-colors hover:bg-accent-gray/70 disabled:opacity-30 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
          >
            <ArrowLeft01Icon className="size-4" />
          </button>
          <span className="min-w-24 text-center text-sm font-medium text-text-body dark:text-white">
            {query.data?.matchday.display_name ?? `GW ${matchdayId}`}
          </span>
          <button
            type="button"
            aria-label="Next gameweek"
            disabled={nextId == null}
            onClick={() => nextId != null && setMatchdayId(nextId)}
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
          Fixtures for this gameweek aren&apos;t listed yet.
        </p>
      ) : (
        <div>
          {[...byDay.entries()].map(([day, fixtures]) => (
            <div key={day}>
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
