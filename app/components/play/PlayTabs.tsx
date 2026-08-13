"use client";

/** Tab navigation shared by every /play page. */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChampionIcon,
  FootballIcon,
  TShirtIcon,
  UserGroupIcon,
} from "hugeicons-react";

const TABS = [
  { href: "/play", label: "Play", Icon: FootballIcon },
  { href: "/play/team", label: "My Team", Icon: TShirtIcon },
  { href: "/play/leaderboard", label: "Leaderboard", Icon: UserGroupIcon },
  { href: "/play/rewards", label: "Leagues", Icon: ChampionIcon },
];

/**
 * variant "bar":    horizontal scrollable tabs.
 * variant "rail":   vertical items for the collapsible desktop rail — labels
 *   are revealed by the parent `group`'s hover (see PlayShell).
 * variant "bottom": fixed app-style bottom tab bar (mobile).
 */
export const PlayTabs = ({
  variant = "bar",
}: {
  variant?: "bar" | "rail" | "bottom";
}) => {
  const pathname = usePathname();
  const rail = variant === "rail";

  if (variant === "bottom") {
    return (
      <nav
        aria-label="Noblocks Play"
        className="fixed inset-x-0 bottom-0 z-40 rounded-t-3xl border-t border-border-light bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-white/10 dark:bg-neutral-900/95 lg:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-4">
          {TABS.map(({ href, label, Icon }) => {
            const active =
              href === "/play" ? pathname === "/play" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                  active
                    ? "text-lavender-500 dark:text-lavender-400"
                    : "text-text-secondary dark:text-white/50"
                }`}
              >
                <Icon className="size-5" />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    );
  }

  return (
    <nav
      aria-label="Noblocks Play"
      className={
        rail
          ? "flex flex-col gap-1 p-2"
          : "scrollbar-hide -mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0"
      }
    >
      {TABS.map(({ href, label, Icon }) => {
        const active =
          href === "/play" ? pathname === "/play" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            title={rail ? label : undefined}
            className={`flex min-h-11 shrink-0 items-center gap-3 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
              rail ? "w-full" : ""
            } ${
              active
                ? "bg-lavender-500 text-white"
                : "text-text-secondary hover:bg-accent-gray hover:text-text-body dark:text-white/50 dark:hover:bg-white/5 dark:hover:text-white"
            }`}
          >
            <Icon className="size-5 shrink-0" />
            <span
              className={
                rail
                  ? "whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                  : ""
              }
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
};
