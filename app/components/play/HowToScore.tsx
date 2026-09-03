"use client";

/**
 * "How to score" panel — FPL matrix from fantasy_settings.config, plus
 * defensive contribution / NMB notes that aren't in the matrix JSON.
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
          <Row
            label="Played 60+ minutes"
            sub="On top of the appearance point"
            points={scoring.appearance_60}
          />
          <Row label="Assist" points={scoring.assist} />
          <Row label="Penalty miss" points={scoring.penalty_miss} />
          <Row label="Yellow card" points={scoring.yellow_card} />
          <Row label="Red card" points={scoring.red_card} />
          <Row label="Own goal" points={scoring.own_goal} />
        </div>
      )}

      {tab === "GK & DEF" && (
        <div>
          <Row label="Goal scored (GK)" points={scoring.goal.GK} />
          <Row label="Goal scored (DEF)" points={scoring.goal.DEF} />
          <Row
            label="Clean sheet"
            sub="60+ minutes played"
            points={scoring.clean_sheet.GK}
          />
          <Row
            label="Goals conceded"
            sub="−1 per 2 goals conceded while on the pitch"
            points={scoring.goals_conceded_per_two.GK}
          />
          <Row label="Penalty save (GK)" points={scoring.penalty_save} />
          <Row label={`Every ${scoring.saves_per_point} saves (GK)`} points={1} />
          <Row
            label="Defensive contribution (DEF)"
            sub="Blocks + interceptions + tackles ≥ threshold"
            points={2}
          />
        </div>
      )}

      {tab === "MID & FWD" && (
        <div>
          <Row label="Goal scored (MID)" points={scoring.goal.MID} />
          <Row label="Goal scored (FWD)" points={scoring.goal.FWD} />
          <Row
            label="Clean sheet (MID)"
            sub="60+ minutes played"
            points={scoring.clean_sheet.MID}
          />
          <Row
            label="Defensive contribution"
            sub="Blocks + interceptions + tackles ≥ threshold"
            points={2}
          />
        </div>
      )}

      <p className="mt-3 border-t border-border-light pt-2 text-xs font-semibold uppercase tracking-wide text-text-secondary dark:border-white/5 dark:text-white/40">
        Bonus
      </p>
      <Row
        label="Noblocks Match Bonus"
        sub="Top 3 in our NMB ranking get +3 / +2 / +1 (FPL-style ties)"
        points={3}
      />

      <p className="mt-3 text-[11px] leading-relaxed text-text-secondary dark:text-white/40">
        Captain scores double if they play; otherwise your vice-captain may.
        Auto-subs fill blanks from the bench.{" "}
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
