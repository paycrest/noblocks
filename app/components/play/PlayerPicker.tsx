"use client";

/**
 * Player picker: bottom sheet (mobile) / right-hand panel (desktop) with
 * search + position/nation/price filters. Excludes inactive (eliminated)
 * players; already-picked and constraint-violating players are disabled
 * with a reason.
 */

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Cancel01Icon, Search01Icon } from "hugeicons-react";
import type { FantasyPlayer, Position } from "./types";
import { PlayerPhoto } from "./PitchView";

const POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];

const PRICE_CEILINGS = [
  { label: "Any price", value: Infinity },
  { label: "≤ 9.5m", value: 9.5 },
  { label: "≤ 8.0m", value: 8 },
  { label: "≤ 6.5m", value: 6.5 },
  { label: "≤ 5.0m", value: 5 },
];

export const PlayerPicker = ({
  isOpen,
  title,
  players,
  fixedPosition,
  selectedIds,
  disabledReason,
  onPick,
  onClose,
}: {
  isOpen: boolean;
  title: string;
  players: FantasyPlayer[];
  /** Lock the position filter (picking for a specific slot / transfer-in). */
  fixedPosition?: Position | null;
  selectedIds: Set<number>;
  /** Returns a human reason when a player can't be picked, else null. */
  disabledReason: (player: FantasyPlayer) => string | null;
  onPick: (player: FantasyPlayer) => void;
  onClose: () => void;
}) => {
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState<Position | "ALL">("ALL");
  const [nation, setNation] = useState<string>("ALL");
  const [maxPrice, setMaxPrice] = useState<number>(Infinity);

  const activePosition = fixedPosition ?? (position === "ALL" ? null : position);

  const nations = useMemo(
    () =>
      [...new Set(players.filter((p) => p.is_active).map((p) => p.nation))].sort(),
    [players],
  );

  const results = useMemo(() => {
    const query = search.trim().toLowerCase();
    return players
      .filter(
        (p) =>
          p.is_active &&
          (!activePosition || p.position === activePosition) &&
          (nation === "ALL" || p.nation === nation) &&
          Number(p.price) <= maxPrice &&
          (!query ||
            p.name.toLowerCase().includes(query) ||
            p.nation.toLowerCase().includes(query)),
      )
      .sort((a, b) => Number(b.price) - Number(a.price));
  }, [players, search, activePosition, nation, maxPrice]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60]">
          <motion.button
            type="button"
            aria-label="Close player picker"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 w-full cursor-default bg-black/30 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
            className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-3xl bg-white shadow-xl dark:bg-surface-overlay sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[26rem] sm:rounded-l-3xl sm:rounded-tr-none"
          >
            <div className="flex items-center justify-between border-b border-border-light px-5 py-4 dark:border-white/10">
              <h2 className="text-base font-semibold text-text-body dark:text-white">
                {title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex size-9 items-center justify-center rounded-full bg-accent-gray text-gray-900 transition-colors hover:bg-accent-gray/80 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
              >
                <Cancel01Icon className="size-4" />
              </button>
            </div>

            <div className="space-y-3 border-b border-border-light px-5 py-3 dark:border-white/10">
              <div className="flex items-center gap-2 rounded-xl bg-background-neutral px-3 py-2.5 dark:bg-white/5">
                <Search01Icon className="size-4 shrink-0 text-text-secondary dark:text-white/40" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search players or nations"
                  className="w-full border-0 bg-transparent text-sm text-text-body placeholder:text-text-placeholder focus:outline-none focus:ring-0 dark:text-white dark:placeholder:text-white/30"
                />
              </div>

              {!fixedPosition && (
                <div className="flex gap-1.5">
                  {(["ALL", ...POSITIONS] as const).map((pos) => (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => setPosition(pos)}
                      className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                        position === pos
                          ? "bg-lavender-500 text-white"
                          : "bg-accent-gray text-text-secondary hover:text-text-body dark:bg-white/5 dark:text-white/50 dark:hover:text-white"
                      }`}
                    >
                      {pos === "ALL" ? "All" : pos}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <select
                  value={nation}
                  onChange={(e) => setNation(e.target.value)}
                  aria-label="Filter by nation"
                  className="min-h-9 flex-1 rounded-lg border-0 bg-accent-gray px-2 text-xs font-medium text-text-body focus:outline-none focus:ring-1 focus:ring-lavender-500 dark:bg-white/5 dark:text-white"
                >
                  <option value="ALL">All nations</option>
                  {nations.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <select
                  value={String(maxPrice)}
                  onChange={(e) => setMaxPrice(Number(e.target.value))}
                  aria-label="Filter by price"
                  className="min-h-9 flex-1 rounded-lg border-0 bg-accent-gray px-2 text-xs font-medium text-text-body focus:outline-none focus:ring-1 focus:ring-lavender-500 dark:bg-white/5 dark:text-white"
                >
                  {PRICE_CEILINGS.map(({ label, value }) => (
                    <option key={label} value={String(value)}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-2">
              {results.length === 0 ? (
                <p className="px-2 py-8 text-center text-sm text-text-secondary dark:text-white/50">
                  No players match your filters.
                </p>
              ) : (
                <ul>
                  {results.map((player) => {
                    const picked = selectedIds.has(player.provider_player_id);
                    const reason = picked
                      ? "Already in your squad"
                      : disabledReason(player);
                    return (
                      <li key={player.provider_player_id}>
                        <button
                          type="button"
                          disabled={Boolean(reason)}
                          onClick={() => onPick(player)}
                          className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors enabled:hover:bg-background-neutral disabled:opacity-40 dark:enabled:hover:bg-white/5"
                        >
                          <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-gray text-[10px] font-bold text-text-secondary dark:bg-white/10 dark:text-white/60">
                            <PlayerPhoto
                              player={player}
                              className="size-full object-cover object-top"
                              fallback={player.position}
                            />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-text-body dark:text-white">
                              {player.name}
                            </span>
                            <span className="block truncate text-xs text-text-secondary dark:text-white/50">
                              {player.nation}
                              {reason ? ` · ${reason}` : ""}
                            </span>
                          </span>
                          <span className="shrink-0 text-sm font-semibold tabular-nums text-text-body dark:text-white">
                            {Number(player.price).toFixed(1)}m
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
