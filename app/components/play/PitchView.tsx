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
import { ClubJersey } from "./ClubJersey";

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
  /**
   * Auto-sub outcome for a scored round: "in" = came off the bench and
   * counted, "out" = started but was replaced, so the 0 shown is exclusion
   * rather than a blank. Cards stay in their picked slot either way.
   */
  subState?: "in" | "out" | null;
  /** Highlighted as an eligible swap target. */
  highlighted?: boolean;
  dimmed?: boolean;
  /** Empty slot that targets the bench (build mode). */
  benchSlot?: boolean;
  /** Player/club marked inactive (unavailable to pick or captain). */
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
 * Player mark, in preference order: provider headshot → stylized club jersey →
 * `fallback` (initials/position).
 *
 * No flag is threaded here on purpose. The APIs null `photo_url` unless
 * `fantasy_settings.photos_enabled` is on, so the setting alone decides whether
 * faces appear, and a broken headshot degrades to the kit rather than a hole.
 *
 * Photo styling lives here rather than at the call sites: they pass size-only
 * classes that suit the jersey SVG, and a headshot additionally needs to be
 * cropped round and anchored to the top of the frame.
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
  // Store the URL that failed, not a boolean: these components are reused
  // across players in scrolling lists, and a boolean would keep suppressing
  // the next player's perfectly good photo.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const photo = player.photo_url;

  if (photo && photo !== failedUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photo}
        alt=""
        loading="lazy"
        draggable={false}
        onError={() => setFailedUrl(photo)}
        className={`${className} rounded-full bg-white/90 object-cover object-top`}
      />
    );
  }

  if (!player.team_id) return <>{fallback}</>;
  return (
    <ClubJersey
      teamId={player.team_id}
      position={player.position}
      className={className}
      title={`${player.nation} kit`}
    />
  );
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
        slot.dimmed || slot.subState === "out" ? "opacity-40" : ""
      } ${slot.highlighted ? "scale-105" : ""}`}
    >
      <span
        className={`relative flex size-11 items-center justify-center overflow-visible sm:size-12 ${
          slot.highlighted
            ? "ring-4 ring-white rounded-lg"
            : slot.markedOut
              ? "ring-2 ring-accent-red rounded-lg"
              : slot.markedIn
                ? "ring-2 ring-emerald-400 rounded-lg"
                : slot.subState === "in"
                  ? "ring-2 ring-emerald-400 rounded-lg"
                  : slot.subState === "out"
                    ? "ring-2 ring-white/40 rounded-lg"
                    : ""
        }`}
      >
        <PlayerPhoto
          player={player}
          className="size-11 drop-shadow-md sm:size-12"
          fallback={
            <span
              className={`flex size-full items-center justify-center rounded-full text-xs font-bold ${POSITION_TINT[slot.position]}`}
            >
              {initials(player.name)}
            </span>
          }
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
              aria-label="Player unavailable"
              title="Player unavailable — transfer out when the window opens"
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
        {/* Auto-sub badges never coexist with the transfer pills: those are
            pending-edit state on an open round, these only exist once a round
            has been scored. */}
        {slot.subState === "in" && !slot.markedIn && (
          <span
            className="absolute -bottom-1 rounded bg-emerald-500 px-1 text-[9px] font-bold text-white"
            aria-label="Auto-substituted on"
            title="Auto-substituted on — these points count"
          >
            SUB ON
          </span>
        )}
        {slot.subState === "out" && !slot.markedOut && (
          <span
            className="absolute -bottom-1 rounded bg-black/70 px-1 text-[9px] font-bold text-white"
            aria-label="Auto-substituted off"
            title="Auto-substituted off — replaced by a bench player, scores nothing"
          >
            SUB OFF
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
