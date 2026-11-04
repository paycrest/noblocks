"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { classNames } from "@/app/utils";
import { forwardRef, type ReactNode } from "react";
import {
  shellFocusRingClasses,
  shellMinHitTargetClasses,
} from "./shellFocusStyles";

export type NavMenuItemState = "default" | "hover" | "active" | "active-hover";

const shellActiveLavenderClasses = "text-lavender-700 dark:text-lavender-500";

type NavMenuItemProps = {
  href: string;
  label: string;
  icon: ReactNode;
  isActive?: boolean;
  className?: string;
};

export function NavMenuItem({
  href,
  label,
  icon,
  isActive = false,
  className,
}: NavMenuItemProps) {
  const pathname = usePathname();

  const active =
    isActive ||
    (href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`));

  const content = (
    <>
      <span
        className={classNames(
          "flex size-[18px] shrink-0 items-center justify-center",
          active
            ? shellActiveLavenderClasses
            : "text-icon-outline-secondary dark:text-white/50",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-bold leading-6">
        {label}
      </span>
    </>
  );

  const baseClasses = classNames(
    "flex w-full min-h-11 items-center gap-3 rounded-xl px-2 py-1 text-left transition-colors",
    shellFocusRingClasses,
    active
      ? classNames(
          "bg-white shadow-[0px_0px_2px_1px_rgba(18,18,23,0.02)] dark:bg-[#2c2c2c]",
          shellActiveLavenderClasses,
        )
      : "text-text-body hover:bg-accent-gray dark:text-white dark:hover:bg-white/10",
    className,
  );

  return (
    <Link href={href} className={baseClasses} aria-current={active ? "page" : undefined}>
      {content}
    </Link>
  );
}

export function NavSectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-[7px] text-xs font-medium leading-6 text-text-secondary dark:text-white/50">
      {children}
    </p>
  );
}

export const ShellIconButton = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    label: string;
    children: ReactNode;
  }
>(function ShellIconButton(
  { label, className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className={classNames(
        "inline-flex items-center justify-center rounded-xl bg-accent-gray text-icon-outline-secondary transition hover:bg-border-light dark:bg-white/10 dark:text-white/50 dark:hover:bg-white/15",
        shellFocusRingClasses,
        shellMinHitTargetClasses,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});
