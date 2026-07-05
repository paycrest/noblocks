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
  { href: "/play/rewards", label: "Rewards", Icon: ChampionIcon },
];

/**
 * variant "bar":  horizontal scrollable tabs (mobile).
 * variant "rail": vertical items for the collapsible desktop rail — labels
 *   are revealed by the parent `group`'s hover (see PlayShell), icons stay
 *   put so the collapsed state is a clean icon column.
 */
export const PlayTabs = ({ variant = "bar" }: { variant?: "bar" | "rail" }) => {
  const pathname = usePathname();
  const rail = variant === "rail";

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
