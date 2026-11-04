"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { classNames } from "@/app/utils";
import type { ReactNode } from "react";

export type NavMenuItemState = "default" | "hover" | "active" | "active-hover";

type NavMenuItemProps = {
  href: string;
  label: string;
  icon: ReactNode;
  isActive?: boolean;
  hasDropdown?: boolean;
  onToggleDropdown?: () => void;
  dropdownOpen?: boolean;
  className?: string;
};

export function NavMenuItem({
  href,
  label,
  icon,
  isActive = false,
  hasDropdown = false,
  onToggleDropdown,
  dropdownOpen,
  className,
}: NavMenuItemProps) {
  const pathname = usePathname();

  const content = (
    <>
      <span className="flex size-[18px] shrink-0 items-center justify-center text-icon-outline-secondary dark:text-white/60">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-bold leading-6">
        {label}
      </span>
      {hasDropdown && (
        <span
          className={classNames(
            "size-4 shrink-0 text-icon-outline-secondary transition-transform dark:text-white/50",
            dropdownOpen ? "rotate-180" : "",
          )}
          aria-hidden
        >
          ▾
        </span>
      )}
    </>
  );

  const baseClasses = classNames(
    "flex w-full items-center gap-3 rounded-xl px-2 py-1 text-left transition-colors",
    isActive
      ? "bg-white text-lavender-500 shadow-[0px_0px_2px_1px_rgba(18,18,23,0.02)] dark:bg-white/10 dark:text-lavender-400"
      : "text-black hover:bg-accent-gray dark:text-white dark:hover:bg-white/10",
    className,
  );

  if (hasDropdown && onToggleDropdown) {
    return (
      <button
        type="button"
        className={baseClasses}
        onClick={onToggleDropdown}
        aria-expanded={dropdownOpen}
      >
        {content}
      </button>
    );
  }

  const active =
    isActive ||
    (href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <Link href={href} className={classNames(baseClasses, active && !isActive ? "bg-white text-lavender-500 shadow-[0px_0px_2px_1px_rgba(18,18,23,0.02)] dark:bg-white/10 dark:text-lavender-400" : "")}>
      {content}
    </Link>
  );
}
