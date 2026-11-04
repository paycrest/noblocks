"use client";

import { Fragment, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  HelpSquareIcon,
  Notification02Icon,
  SidebarLeftIcon,
} from "hugeicons-react";
import { buildWalletBreadcrumbs } from "@/app/lib/breadcrumbs";
import { NOBLOCKS_HELP_URL } from "@/app/lib/customer-support";
import { resolveWalletTokenMeta } from "@/app/lib/wallet-token-allowlist";
import { classNames } from "@/app/utils";
import { ShellIconButton } from "./NavMenuItem";
import {
  shellFocusRingClasses,
  shellMinHitTargetClasses,
} from "./shellFocusStyles";
import { WALLET_MOBILE_NAV_ID } from "./walletShellIds";

type TopBarProps = {
  mobileNavOpen: boolean;
  onMobileNavToggle: () => void;
  mobileNavToggleRef?: React.Ref<HTMLButtonElement>;
};

const topBarIconButtonBase =
  "relative inline-flex items-center justify-center bg-accent-gray text-icon-outline-secondary transition hover:bg-border-light dark:bg-white/10 dark:text-white/50 dark:hover:bg-white/15";

export function TopBar({
  mobileNavOpen,
  onMobileNavToggle,
  mobileNavToggleRef,
}: TopBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const tokenDisplayName = useMemo(() => {
    if (!pathname.startsWith("/tokens/")) return undefined;
    const raw = pathname.split("/")[2];
    if (!raw) return undefined;
    return resolveWalletTokenMeta(raw)?.name;
  }, [pathname]);

  const crumbs = useMemo(
    () => buildWalletBreadcrumbs({ pathname, tokenDisplayName }),
    [pathname, tokenDisplayName],
  );

  const isHomeOnly = crumbs.length === 1 && crumbs[0]?.label === "Home";

  return (
    <header className="flex h-14 shrink-0 items-center justify-between px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-2 md:gap-3">
        <ShellIconButton
          ref={mobileNavToggleRef}
          label={mobileNavOpen ? "Close navigation" : "Open navigation"}
          className="size-9 rounded-xl md:hidden"
          aria-expanded={mobileNavOpen}
          aria-controls={WALLET_MOBILE_NAV_ID}
          onClick={onMobileNavToggle}
        >
          <SidebarLeftIcon className="size-5" />
        </ShellIconButton>

        <div className="hidden items-center gap-3 md:flex">
          <button
            type="button"
            aria-label="Go back"
            onClick={() => router.back()}
            className={classNames(
              topBarIconButtonBase,
              "size-8 rounded-lg",
              shellFocusRingClasses,
              shellMinHitTargetClasses,
            )}
          >
            <ArrowLeft01Icon className="size-[19px]" />
          </button>
          <button
            type="button"
            aria-label="Go forward"
            onClick={() => router.forward()}
            className={classNames(
              topBarIconButtonBase,
              "size-8 rounded-lg",
              shellFocusRingClasses,
              shellMinHitTargetClasses,
            )}
          >
            <ArrowRight01Icon className="size-[19px]" />
          </button>
        </div>

        <nav
          aria-label="Breadcrumb"
          className="flex min-w-0 items-center gap-0.5 text-sm font-medium tracking-[-0.01em]"
        >
          {isHomeOnly ? (
            <span
              className="text-text-secondary dark:text-white/50"
              aria-current="page"
            >
              Home
            </span>
          ) : (
            crumbs.map((crumb, index) => {
              const isLast = index === crumbs.length - 1;
              return (
                <Fragment key={`${crumb.label}-${index}`}>
                  {crumb.href && !isLast ? (
                    <Link
                      href={crumb.href}
                      className={classNames(
                        "truncate text-text-secondary hover:text-text-body dark:text-white/50 dark:hover:text-white",
                        shellFocusRingClasses,
                        "rounded-sm",
                      )}
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span
                      className={classNames(
                        "truncate",
                        isLast
                          ? "text-text-body dark:text-white"
                          : "text-text-secondary dark:text-white/50",
                      )}
                      {...(isLast ? { "aria-current": "page" as const } : {})}
                    >
                      {crumb.label}
                    </span>
                  )}
                  {!isLast && (
                    <span className="text-text-secondary dark:text-white/50">
                      /
                    </span>
                  )}
                </Fragment>
              );
            })
          )}
        </nav>
      </div>

      <div className="flex items-center gap-2">
        <a
          href={NOBLOCKS_HELP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={classNames(
            topBarIconButtonBase,
            "size-9 rounded-xl",
            shellFocusRingClasses,
            shellMinHitTargetClasses,
          )}
        >
          <HelpSquareIcon className="size-5" />
          <span className="sr-only">Help (opens in new tab)</span>
        </a>

        <Popover className="relative">
          <PopoverButton
            aria-label="Notifications"
            className={classNames(
              topBarIconButtonBase,
              "size-9 rounded-xl data-[open]:bg-border-light dark:data-[open]:bg-white/15",
              shellFocusRingClasses,
              shellMinHitTargetClasses,
            )}
          >
            <Notification02Icon className="size-5" />
          </PopoverButton>
          <PopoverPanel
            anchor="bottom end"
            className="z-50 mt-2 w-64 rounded-xl border border-border-light bg-white p-4 shadow-lg outline-none dark:border-white/10 dark:bg-surface-overlay"
          >
            <p className="text-sm text-text-secondary dark:text-white/50">
              No notifications yet
            </p>
          </PopoverPanel>
        </Popover>
      </div>
    </header>
  );
}
