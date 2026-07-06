"use client";

/** Key/legend for the badges used on the pitch, bench and swap lists. */

import {
  Add01Icon,
  AirplaneTakeOff01Icon,
  SquareLock02Icon,
  Tick02Icon,
} from "hugeicons-react";
import { PlayCard } from "./ui";

const KeyItem = ({
  glyph,
  label,
}: {
  glyph: React.ReactNode;
  label: string;
}) => (
  <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary dark:text-white/60">
    {glyph}
    {label}
  </span>
);

const badge = "flex size-5 items-center justify-center rounded-full text-[10px] font-bold shadow";

export const SquadKey = ({
  onHowToScore,
}: {
  /** Opens the scoring modal (mobile — xl screens have the sidebar). */
  onHowToScore?: () => void;
}) => (
  <PlayCard>
    <div className="mb-2 flex items-center justify-between gap-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary dark:text-white/40">
        Key
      </p>
      {onHowToScore && (
        <button
          type="button"
          onClick={onHowToScore}
          className="text-xs font-semibold text-text-body underline underline-offset-2 hover:text-lavender-500 dark:text-white dark:hover:text-lavender-400 xl:hidden"
        >
          How to score points
        </button>
      )}
    </div>
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      <KeyItem
        glyph={
          <span className={`${badge} bg-black text-white dark:bg-white dark:text-black`}>C</span>
        }
        label="Captain"
      />
      <KeyItem
        glyph={
          <span className={`${badge} bg-white text-black ring-1 ring-gray-400 dark:bg-black dark:text-white dark:ring-white/20`}>
            V
          </span>
        }
        label="Vice-captain"
      />
      <KeyItem
        glyph={
          <span className={`${badge} bg-black/80 text-white`}>
            <SquareLock02Icon className="size-3" />
          </span>
        }
        label="In play"
      />
      <KeyItem
        glyph={
          <span className={`${badge} bg-emerald-500 text-white`}>
            <Tick02Icon className="size-3" />
          </span>
        }
        label="Played"
      />
      <KeyItem
        glyph={
          <span className={`${badge} bg-accent-red text-white`}>
            <AirplaneTakeOff01Icon className="size-3" />
          </span>
        }
        label="Eliminated"
      />
      <KeyItem
        glyph={
          <span className="rounded bg-emerald-500 px-1 text-[9px] font-bold text-white">IN</span>
        }
        label="Transfer in"
      />
      <KeyItem
        glyph={
          <span className="rounded bg-accent-red px-1 text-[9px] font-bold text-white">OUT</span>
        }
        label="Transfer out"
      />
      <KeyItem
        glyph={
          <span className="flex size-5 items-center justify-center rounded-full border-2 border-dashed border-text-secondary/50 dark:border-white/40">
            <Add01Icon className="size-3" />
          </span>
        }
        label="Empty slot"
      />
    </div>
  </PlayCard>
);
