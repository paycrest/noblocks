"use client";

/**
 * Pitch view for the squad builder/manager: CSS grid rows GK/DEF/MID/FWD on
 * a green gradient pitch. Exports PlayerSlotCard, shared with BenchRow.
 */

import { useState, type ReactNode } from "react";
import {
  AirplaneTakeOff01Icon,
  SquareLock02Icon,
  Tick02Icon,
  Add01Icon,
} from "hugeicons-react";
import type { FantasyPlayer, LockState, Position } from "./types";

export interface SlotView {
  /** Stable UI key (player id or `empty-<pos>-<i>`). */
  key: string;
  player: FantasyPlayer | null;
  position: Position;
  isCaptain?: boolean;
  isVice?: boolean;
  lockState?: LockState;
  /** Live points to show instead of price (locked round). */
  livePoints?: number;
  /** Marked as transfer-out (pending). */
  markedOut?: boolean;
  /** Just transferred in (pending). */
  markedIn?: boolean;
  /** Highlighted as an eligible swap target. */
  highlighted?: boolean;
  dimmed?: boolean;
  /** Empty slot that targets the bench (build mode). */
  benchSlot?: boolean;
  /** Player's team is out of the tournament (flown home). */
  eliminated?: boolean;
}

const POSITION_TINT: Record<Position, string> = {
  GK: "bg-yellow-primary/90 text-black",
  DEF: "bg-sky-500/90 text-white",
  MID: "bg-emerald-500/90 text-white",
  FWD: "bg-rose-500/90 text-white",
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

/**
 * API-Football headshot with graceful fallback (photo_url can be null and
 * the CDN occasionally 404s a player) — the fallback keeps the tinted
 * initials/position look.
 */
export const PlayerPhoto = ({
  player,
  className,
  fallback,
}: {
  player: FantasyPlayer;
  className: string;
  fallback: ReactNode;
}) => {
  const [failed, setFailed] = useState(false);
  if (!player.photo_url || failed) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={player.photo_url}
      alt=""
      loading="lazy"
      draggable={false}
      onError={() => setFailed(true)}
      className={className}
    />
  );
};

const POSITION_RING: Record<Position, string> = {
  GK: "ring-yellow-primary",
  DEF: "ring-sky-500",
  MID: "ring-emerald-500",
  FWD: "ring-rose-500",
};

export const PlayerSlotCard = ({
  slot,
  showPrice,
  onClick,
}: {
  slot: SlotView;
  /** Show price as subtitle (build/transfer); otherwise live points. */
  showPrice: boolean;
  onClick?: () => void;
}) => {
  const { player } = slot;

  if (!player) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`Add ${slot.position}`}
        className="flex w-16 flex-col items-center gap-1 sm:w-20"
      >
        <span className="flex size-11 items-center justify-center rounded-full border-2 border-dashed border-white/60 bg-white/10 text-white transition-colors hover:bg-white/20 sm:size-12">
          <Add01Icon className="size-5" />
        </span>
        <span className="w-full truncate rounded bg-black/30 px-1 py-0.5 text-center text-[10px] font-medium text-white">
          {slot.position}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex w-16 flex-col items-center gap-1 transition-opacity sm:w-20 ${
        slot.dimmed ? "opacity-40" : ""
      } ${slot.highlighted ? "scale-105" : ""}`}
    >
      <span
        className={`relative flex size-11 items-center justify-center overflow-visible rounded-full text-xs font-bold shadow-md sm:size-12 ${POSITION_TINT[slot.position]} ${
          slot.highlighted
            ? "ring-4 ring-white"
            : slot.markedOut
              ? "ring-2 ring-accent-red"
              : slot.markedIn
                ? "ring-2 ring-emerald-400"
                : `ring-2 ${POSITION_RING[slot.position]}`
        }`}
      >
        <PlayerPhoto
          player={player}
          className="size-full rounded-full bg-white/90 object-cover object-top"
          fallback={initials(player.name)}
        />
        {(slot.isCaptain || slot.isVice) && (
          <span
            className={`absolute -left-1 -top-1 flex size-5 items-center justify-center rounded-full text-[10px] font-bold shadow ${
              slot.isCaptain
                ? "bg-black text-white dark:bg-white dark:text-black"
                : "bg-white text-black dark:bg-black dark:text-white"
            }`}
            aria-label={slot.isCaptain ? "Captain" : "Vice-captain"}
          >
            {slot.isCaptain ? "C" : "V"}
          </span>
        )}
        {slot.lockState === "locked" && (
          <span
            className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-black/80 text-white shadow"
            aria-label="Match in progress"
            title="Match in progress"
          >
            <SquareLock02Icon className="size-3" />
          </span>
        )}
        {slot.lockState === "played" && (
          <span
            className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-emerald-500 text-white shadow"
            aria-label="Match played"
            title="Match played"
          >
            <Tick02Icon className="size-3" />
          </span>
        )}
        {slot.eliminated &&
          slot.lockState !== "locked" &&
          slot.lockState !== "played" && (
            <span
              className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-accent-red text-white shadow"
              aria-label="Team eliminated"
              title="Team eliminated — flown home"
            >
              <AirplaneTakeOff01Icon className="size-3" />
            </span>
          )}
        {slot.markedOut && (
          <span className="absolute -bottom-1 rounded bg-accent-red px-1 text-[9px] font-bold text-white">
            OUT
          </span>
        )}
        {slot.markedIn && (
          <span className="absolute -bottom-1 rounded bg-emerald-500 px-1 text-[9px] font-bold text-white">
            IN
          </span>
        )}
      </span>
      <span className="w-full truncate rounded-t bg-black/50 px-1 pt-0.5 text-center text-[10px] font-semibold leading-tight text-white">
        {player.name.split(" ").slice(-1)[0]}
      </span>
      <span className="-mt-1 w-full truncate rounded-b bg-black/30 px-1 pb-0.5 text-center text-[9px] tabular-nums text-white/90">
        {showPrice ? `${Number(player.price).toFixed(1)}m` : `${slot.livePoints ?? 0} pts`}
      </span>
    </button>
  );
};

/**
 * The XI on the pitch. Rows are position groups; the surface is a green
 * gradient with halfway/penalty-box line accents.
 */
export const PitchView = ({
  rows,
  showPrice,
  onSlotClick,
}: {
  rows: Record<Position, SlotView[]>;
  showPrice: boolean;
  onSlotClick: (slot: SlotView) => void;
}) => (
  <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-emerald-600 via-emerald-700 to-emerald-800 p-3 sm:p-5">
    {/* pitch markings */}
    <div
      aria-hidden
      className="pointer-events-none absolute inset-3 rounded-xl border-2 border-white/20"
    />
    <div
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-3 h-10 w-32 -translate-x-1/2 rounded-b-xl border-2 border-t-0 border-white/20"
    />
    <div
      aria-hidden
      className="pointer-events-none absolute bottom-[-3.5rem] left-1/2 size-28 -translate-x-1/2 rounded-full border-2 border-white/20"
    />

    <div className="relative grid gap-4 py-2 sm:gap-6">
      {(["GK", "DEF", "MID", "FWD"] as Position[]).map((position) => (
        <div
          key={position}
          className="flex flex-wrap items-start justify-center gap-2 sm:gap-4"
        >
          {rows[position].map((slot) => (
            <PlayerSlotCard
              key={slot.key}
              slot={slot}
              showPrice={showPrice}
              onClick={() => onSlotClick(slot)}
            />
          ))}
        </div>
      ))}
    </div>
  </div>
);
