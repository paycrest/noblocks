"use client";

/**
 * /play/matchday/[id] — public matchday view: fixtures with scores/status,
 * plus (when signed in and joined) the viewer's own XI live points from the
 * squad endpoint's per-player `live` field.
 */

import { useParams } from "next/navigation";
import Link from "next/link";
import { FootballIcon, SquareLock02Icon } from "hugeicons-react";
import { useMatchday, useSquad } from "@/app/components/play/hooks";
import { TeamFlag } from "@/app/components/play/FixturesCard";
import {
  Chip,
  EmptyState,
  ErrorState,
  PlayCard,
  Skeleton,
} from "@/app/components/play/ui";
import {
  FIXTURE_FINISHED_STATUSES,
  FIXTURE_LIVE_STATUSES,
  type FixtureData,
} from "@/app/components/play/types";

const fixtureStatus = (fixture: FixtureData) => {
  if (FIXTURE_LIVE_STATUSES.has(fixture.status)) {
    return { label: "Live", tone: "red" as const };
  }
  if (FIXTURE_FINISHED_STATUSES.has(fixture.status)) {
    return { label: fixture.status === "FT" ? "FT" : fixture.status, tone: "neutral" as const };
  }
  return { label: "Upcoming", tone: "lavender" as const };
};

const kickoffFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const FixtureCard = ({ fixture }: { fixture: FixtureData }) => {
  const status = fixtureStatus(fixture);
  const started =
    status.label !== "Upcoming" ||
    fixture.home_score != null ||
    fixture.away_score != null;
  return (
    <PlayCard className="flex items-center gap-3">
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2 text-sm font-medium text-text-body dark:text-white">
        <span className="min-w-0 truncate">{fixture.home_team}</span>
        <TeamFlag teamId={fixture.home_team_id} />
      </div>
      <div className="flex shrink-0 flex-col items-center gap-1">
        <span className="text-base font-bold tabular-nums text-text-body dark:text-white">
          {started
            ? `${fixture.home_score ?? 0} – ${fixture.away_score ?? 0}`
            : "vs"}
        </span>
        <Chip tone={status.tone}>{status.label}</Chip>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium text-text-body dark:text-white">
        <TeamFlag teamId={fixture.away_team_id} />
        <span className="min-w-0 truncate">{fixture.away_team}</span>
      </div>
    </PlayCard>
  );
};

const OwnXISection = ({ matchdayId }: { matchdayId: number }) => {
  const squadQuery = useSquad();
  const data = squadQuery.data;
  // Signed out / not joined / no squad — quietly skip. The squad endpoint
  // serves the current matchday only, so other rounds show fixtures alone.
  if (!data?.squad || data.matchday.id !== matchdayId) return null;

  const xi = data.squad.players
    .filter((p) => p.slot <= 11)
    .sort((a, b) => a.slot - b.slot);

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-text-body dark:text-white">
        Your XI this round
      </h2>
      <div className="overflow-hidden rounded-2xl border border-border-light dark:border-white/10">
        {xi.map((entry) => (
          <div
            key={entry.player_id}
            className="flex items-center gap-3 border-b border-border-light px-4 py-2.5 last:border-0 dark:border-white/5"
          >
            <span className="w-10 shrink-0 text-xs font-semibold text-text-secondary dark:text-white/40">
              {entry.player?.position ?? ""}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-body dark:text-white">
              {entry.player?.name ?? entry.player_id}
              {entry.is_captain && (
                <span className="ml-1.5 rounded bg-black px-1 text-[10px] font-bold text-white dark:bg-white dark:text-black">
                  C
                </span>
              )}
              {entry.is_vice && (
                <span className="ml-1.5 rounded bg-accent-gray px-1 text-[10px] font-bold text-text-body dark:bg-white/10 dark:text-white">
                  V
                </span>
              )}
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 text-xs text-text-secondary dark:text-white/40">
              {entry.lock_state === "played" ? (
                `${entry.live.minutes}'`
              ) : entry.lock_state === "locked" ? (
                <>
                  <SquareLock02Icon className="size-3" /> in play
                </>
              ) : (
                "—"
              )}
            </span>
            <span className="w-14 shrink-0 text-right text-sm font-semibold tabular-nums text-text-body dark:text-white">
              {entry.live.points} pts
            </span>
          </div>
        ))}
      </div>
      <p className="text-xs text-text-secondary dark:text-white/40">
        Captain scores double (unconditional vice fallback if the captain
        plays 0 minutes). Bench points never count.
      </p>
    </section>
  );
};

export default function MatchdayPage() {
  const params = useParams<{ id: string }>();
  const { data, isPending, isError, refetch } = useMatchday(params.id);

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <ErrorState
        message="Couldn't load this matchday."
        onRetry={() => refetch()}
      />
    );
  }

  const { matchday, fixtures } = data;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-text-body dark:text-white">
          {matchday.display_name}
        </h1>
        <Chip
          tone={
            matchday.status === "live"
              ? "red"
              : matchday.status === "upcoming"
                ? "lavender"
                : "neutral"
          }
        >
          {matchday.status === "live"
            ? "Live"
            : matchday.status === "upcoming"
              ? "Upcoming"
              : matchday.status === "finalizing"
                ? "Finalizing scores"
                : "Final"}
        </Chip>
      </div>

      {fixtures.length === 0 ? (
        <EmptyState
          icon={<FootballIcon className="size-8 text-lavender-500" />}
          title="Fixtures not confirmed yet"
          description="Check back once the bracket for this round is set."
        />
      ) : (
        <section className="space-y-3">
          {fixtures.map((fixture) => (
            <div key={fixture.provider_fixture_id} className="space-y-1">
              <FixtureCard fixture={fixture} />
              <p className="px-1 text-right text-[11px] text-text-secondary dark:text-white/40">
                {kickoffFormat.format(new Date(fixture.kickoff))}
              </p>
            </div>
          ))}
        </section>
      )}

      <OwnXISection matchdayId={matchday.id} />

      <Link
        href="/play/leaderboard"
        className="inline-block text-sm font-medium text-lavender-500 hover:text-lavender-600"
      >
        See the leaderboard →
      </Link>
    </div>
  );
}
