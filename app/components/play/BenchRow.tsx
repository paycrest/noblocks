"use client";

/**
 * Bench row (slots 12–15). After a gameweek is final, substituted-out
 * starters occupy the slots vacated by promoted bench players.
 */

import type { ReactNode } from "react";
import { PlayerSlotCard, type SlotView } from "./PitchView";

export const BenchRow = ({
  slots,
  showPrice,
  onSlotClick,
  note,
}: {
  slots: SlotView[];
  showPrice: boolean;
  onSlotClick: (slot: SlotView) => void;
  /** Round-specific caption; defaults to how the bench will be used. */
  note?: ReactNode;
}) => (
  <div className="rounded-2xl bg-background-neutral p-3 dark:bg-white/5 sm:p-4">
    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary dark:text-white/40">
      Bench{" "}
      <span className="font-normal normal-case">
        — {note ?? "auto-subs promote in slot order"}
      </span>
    </p>
    <div className="flex flex-wrap items-start justify-center gap-2 sm:justify-start sm:gap-4">
      {slots.map((slot) => (
        <PlayerSlotCard
          key={slot.key}
          slot={slot}
          showPrice={showPrice}
          onClick={() => onSlotClick(slot)}
        />
      ))}
    </div>
  </div>
);
