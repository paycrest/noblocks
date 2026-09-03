"use client";

/**
 * Horizontally scrolling gameweek strip, windowed around the current GW
 * (~current−2 … current+3 visible first; rest reachable by scroll).
 */

import { useEffect, useRef } from "react";
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
  scores?: Record<number, number>;
}) => {
  const { data, isPending } = useMatchdays();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLDivElement>(null);

  const matchdays = data?.matchdays ?? [];
  const currentId = matchdays.find((md) => md.status !== "final")?.id;
  const current = matchdays.find((md) => md.id === currentId);
  const transfersOpen = current != null && stateOf(current, true) === "open";

  useEffect(() => {
    currentRef.current?.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: "smooth",
    });
  }, [currentId]);

  if (isPending) return <Skeleton className="h-16 w-full rounded-2xl" />;
  if (matchdays.length < 2) return null;

  return (
    <div className="overflow-hidden rounded-2xl bg-background-neutral dark:bg-white/5">
      <div
        ref={scrollerRef}
        className="flex gap-1 overflow-x-auto px-2 py-1 scrollbar-thin"
      >
        {matchdays.map((md) => {
          const isCurrent = md.id === currentId;
          const state = stateOf(md, isCurrent);
          return (
            <div
              key={md.id}
              ref={isCurrent ? currentRef : undefined}
              aria-current={isCurrent ? "step" : undefined}
              className="relative w-[4.5rem] shrink-0 px-1 py-2.5 text-center"
            >
              <span
                className={`block truncate text-xs font-semibold ${
                  isCurrent
                    ? "text-lavender-500 dark:text-lavender-400"
                    : "text-text-secondary dark:text-white/50"
                }`}
              >
                {md.label || md.display_name}
              </span>
              <span className="mt-1 block text-[10px]">
                {state === "complete" && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-2 py-0.5 font-semibold text-emerald-600 dark:text-emerald-400">
                    {scores ? (
                      `${scores[md.id] ?? 0} pts`
                    ) : (
                      <>
                        <Tick02Icon className="size-3" />
                        Done
                      </>
                    )}
                  </span>
                )}
                {state === "open" && (
                  <span className="font-medium text-lavender-500 dark:text-lavender-400">
                    Open
                  </span>
                )}
                {state === "live" && (
                  <span className="font-semibold text-red-500">Live</span>
                )}
                {state === "finalizing" && (
                  <span className="font-medium text-amber-600">Finalizing</span>
                )}
                {state === "upcoming" && (
                  <span className="text-text-disabled dark:text-white/40">
                    {shortDate(md.lock_at)}
                  </span>
                )}
              </span>
              {isCurrent && (
                <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-lavender-500" />
              )}
            </div>
          );
        })}
      </div>
      {transfersOpen && current && (
        <div className="border-t border-border-light px-3 py-2 text-center text-xs text-text-secondary dark:border-white/10 dark:text-white/60">
          Deadline: {deadlineLabel(current.lock_at)}
        </div>
      )}
    </div>
  );
};
