"use client";

/**
 * "How to score" panel (mirrors the official game's right-hand card).
 * Values come straight from the settings' scoring matrix, so a rules tweak
 * in fantasy_settings.config shows up here without a deploy.
 */

import { useState } from "react";
import Link from "next/link";
import type { ScoringMatrix } from "./types";
import { PlayCard } from "./ui";

const TABS = ["All players", "GK & DEF", "MID & FWD"] as const;
type Tab = (typeof TABS)[number];

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

const Row = ({
  label,
  sub,
  points,
}: {
  label: string;
  sub?: string;
  points: number;
}) => (
  <div className="flex items-center justify-between gap-3 border-b border-border-light py-2.5 last:border-0 dark:border-white/5">
    <span className="min-w-0">
      <span className="block text-sm text-text-body dark:text-white">{label}</span>
      {sub && (
        <span className="block text-[11px] text-text-secondary dark:text-white/40">
          {sub}
        </span>
      )}
    </span>
    <span
      className={`shrink-0 text-sm font-bold tabular-nums ${
        points >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-accent-red"
      }`}
    >
      {signed(points)}
    </span>
  </div>
);

export const HowToScore = ({ scoring }: { scoring: ScoringMatrix }) => {
  const [tab, setTab] = useState<Tab>("All players");

  return (
    <PlayCard>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary dark:text-white/40">
        How to score
      </p>

      <div className="mb-2 flex gap-1 rounded-xl bg-background-neutral p-1 dark:bg-white/5">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`min-h-8 flex-1 rounded-lg px-2 text-xs font-medium transition-colors ${
              tab === t
                ? "bg-white text-text-body shadow-sm dark:bg-white/15 dark:text-white"
                : "text-text-secondary hover:text-text-body dark:text-white/50 dark:hover:text-white"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "All players" && (
        <div>
          <Row label="Appearance" sub="Any minutes played" points={scoring.appearance} />
          <Row label="Played 60+ minutes" sub="On top of the appearance point" points={scoring.appearance_60} />
          <Row label="Assist" points={scoring.assist} />
          <Row label="Winning a penalty" points={scoring.penalty_won} />
          <Row label="Conceding a penalty" points={scoring.penalty_conceded} />
          <Row label="Yellow card" points={scoring.yellow_card} />
          <Row label="Red card" points={scoring.red_card} />
          <Row label="Own goal" points={scoring.own_goal} />
        </div>
      )}

      {tab === "GK & DEF" && (
        <div>
          <Row label="Goal scored (GK)" points={scoring.goal.GK} />
          <Row label="Goal scored (DEF)" points={scoring.goal.DEF} />
          <Row label="Clean sheet" sub="60+ minutes played" points={scoring.clean_sheet.GK} />
          <Row
            label="Goals conceded"
            sub="First conceded is free, then per goal while on the pitch"
            points={scoring.goals_conceded_per_extra.GK}
          />
          <Row label="Penalty save (GK)" points={scoring.penalty_save} />
          <Row label={`Every ${scoring.saves_per_point} saves (GK)`} points={1} />
        </div>
      )}

      {tab === "MID & FWD" && (
        <div>
          <Row label="Goal scored (MID)" points={scoring.goal.MID} />
          <Row label="Goal scored (FWD)" points={scoring.goal.FWD} />
          <Row label="Clean sheet (MID)" sub="60+ minutes played" points={scoring.clean_sheet.MID} />
          <Row label={`Every ${scoring.tackles_per_point} tackles (MID)`} points={1} />
          <Row
            label={`Every ${scoring.key_passes_per_point} key passes (MID)`}
            sub="Key passes stand in for big chances created"
            points={1}
          />
          <Row label={`Every ${scoring.shots_on_target_per_point} shots on target (FWD)`} points={1} />
        </div>
      )}

      <p className="mt-3 border-t border-border-light pt-2 text-xs font-semibold uppercase tracking-wide text-text-secondary dark:border-white/5 dark:text-white/40">
        Bonus points
      </p>
      <Row
        label="Goal from a direct free-kick"
        sub="On top of the goal points, where our data feed identifies the goal type"
        points={scoring.direct_free_kick_goal}
      />

      <p className="mt-3 text-[11px] leading-relaxed text-text-secondary dark:text-white/40">
        Captain scores double; if they don&apos;t play, your vice-captain
        scores double instead. Bench players never score.{" "}
        <Link
          href="/play/terms"
          className="font-medium text-lavender-500 hover:underline dark:text-lavender-400"
        >
          Full rules →
        </Link>
      </p>
    </PlayCard>
  );
};
