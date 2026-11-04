"use client";

import { Fragment, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  HelpSquareIcon,
  Notification02Icon,
} from "hugeicons-react";
import { buildWalletBreadcrumbs } from "@/app/lib/breadcrumbs";
import { resolveWalletTokenMeta } from "@/app/lib/wallet-token-allowlist";
import { classNames } from "@/app/utils";

export function TopBar() {
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

  const isHome = crumbs.length === 1 && crumbs[0]?.label === "Home";

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border-light px-6 dark:border-white/10">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Go back"
            onClick={() => router.back()}
            className="flex size-8 items-center justify-center rounded-lg bg-accent-gray text-icon-outline-secondary transition hover:bg-border-light dark:bg-white/10 dark:text-white/60 dark:hover:bg-white/15"
          >
            <ArrowLeft01Icon className="size-[19px]" />
          </button>
          <button
            type="button"
            aria-label="Go forward"
            onClick={() => router.forward()}
            className="flex size-8 items-center justify-center rounded-lg bg-accent-gray text-icon-outline-secondary transition hover:bg-border-light dark:bg-white/10 dark:text-white/60 dark:hover:bg-white/15"
          >
            <ArrowRight01Icon className="size-[19px]" />
          </button>
        </div>

        <nav
          aria-label="Breadcrumb"
          className="flex min-w-0 items-center gap-0.5 text-sm font-medium tracking-[-0.01em]"
        >
          {isHome ? (
            <span className="text-text-secondary dark:text-white/60">
              Home /
            </span>
          ) : (
            crumbs.map((crumb, index) => {
              const isLast = index === crumbs.length - 1;
              return (
                <Fragment key={`${crumb.label}-${index}`}>
                  {crumb.href && !isLast ? (
                    <Link
                      href={crumb.href}
                      className="truncate text-text-secondary hover:text-text-body dark:text-white/60 dark:hover:text-white"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span
                      className={classNames(
                        "truncate",
                        isLast
                          ? "text-text-body dark:text-white"
                          : "text-text-secondary dark:text-white/60",
                      )}
                    >
                      {crumb.label}
                    </span>
                  )}
                  {!isLast && (
                    <span className="text-text-secondary dark:text-white/60">
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
        <TopBarIconButton label="Help">
          <HelpSquareIcon className="size-5" />
        </TopBarIconButton>
        <TopBarIconButton label="Notifications">
          <Notification02Icon className="size-5" />
        </TopBarIconButton>
      </div>
    </header>
  );
}

function TopBarIconButton({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex size-9 items-center justify-center rounded-xl bg-accent-gray text-icon-outline-secondary transition hover:bg-border-light dark:bg-white/10 dark:text-white/60 dark:hover:bg-white/15"
    >
      {children}
    </button>
  );
}
