"use client";

/**
 * Round-progress strip, matching the official game's design: one band with
 * every round as an equal column — completed rounds get a "Done" pill, the
 * current round is highlighted with an underline and its state (Transfers
 * open / Live / Finalizing), upcoming rounds show their date — plus a
 * transfers-deadline strip underneath while the window is open.
 */

import { Tick02Icon } from "hugeicons-react";
import { useMatchdays } from "./hooks";
import { Skeleton } from "./ui";
import type { PlayMatchday } from "./types";

type RoundState = "complete" | "open" | "live" | "finalizing" | "upcoming";

const stateOf = (md: PlayMatchday, current: boolean): RoundState => {
  if (md.status === "final") return "complete";
  if (!current) return "upcoming";
  if (md.status === "finalizing") return "finalizing";
  if (md.status === "live" || Date.now() >= new Date(md.lock_at).getTime()) {
    return "live";
  }
  return "open";
};

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" });

const deadlineLabel = (iso: string) => {
  const date = new Date(iso);
  return `${date.toLocaleDateString([], { day: "numeric", month: "long" })}, ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
};

export const RoundStrip = ({
  scores,
}: {
  /** Own points per matchday id (from the squad response). */
  scores?: Record<number, number>;
}) => {
  const { data, isPending } = useMatchdays();
  // Reserve the band's height while loading so the page doesn't jump.
  if (isPending) return <Skeleton className="h-16 w-full rounded-2xl" />;
  const matchdays = data?.matchdays ?? [];
  if (matchdays.length < 2) return null;

  const currentId = matchdays.find((md) => md.status !== "final")?.id;
  const current = matchdays.find((md) => md.id === currentId);
  const transfersOpen =
    current != null && stateOf(current, true) === "open";

  return (
    <div className="overflow-hidden rounded-2xl bg-background-neutral dark:bg-white/5">
      <div className="flex">
        {matchdays.map((md) => {
          const isCurrent = md.id === currentId;
          const state = stateOf(md, isCurrent);
          return (
            <div
              key={md.id}
              aria-current={isCurrent ? "step" : undefined}
              className="relative min-w-0 flex-1 px-1 py-2.5 text-center"
            >
              <span
                className={`block truncate text-xs font-semibold ${
                  isCurrent
                    ? "text-lavender-500 dark:text-lavender-400"
                    : "text-text-secondary dark:text-white/50"
                }`}
              >
                {md.display_name}
              </span>
              <span className="mt-1 block text-[10px]">
                {state === "complete" && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-2 py-0.5 font-semibold text-emerald-600 dark:text-emerald-400">
                    {scores ? (
                      `${scores[md.id] ?? 0} pts`
                    ) : (
                      <>
                        <Tick02Icon className="size-2.5" />
                        Done
                      </>
                    )}
                  </span>
                )}
                {state === "open" && (
                  <span className="font-medium text-text-body dark:text-white">
                    Transfers open
                  </span>
                )}
                {state === "live" && (
                  <span className="font-semibold text-accent-red">Live</span>
                )}
                {state === "finalizing" && (
                  <span className="font-semibold text-amber-600 dark:text-amber-400">
                    Finalizing
                  </span>
                )}
                {state === "upcoming" && (
                  <span className="text-text-secondary dark:text-white/40">
                    {shortDate(md.lock_at)}
                  </span>
                )}
              </span>
              {isCurrent && (
                <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-lavender-500" />
              )}
            </div>
          );
        })}
      </div>
      {transfersOpen && current && (
        <div className="border-t border-border-light px-3 py-2 text-center text-[11px] text-text-secondary dark:border-white/10 dark:text-white/50">
          Transfers deadline:{" "}
          <span className="font-semibold text-text-body dark:text-white">
            {deadlineLabel(current.lock_at)}
          </span>
        </div>
      )}
    </div>
  );
};
