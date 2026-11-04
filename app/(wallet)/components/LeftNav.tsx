"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import {
  Home04Icon,
  Coins01Icon,
  Money03Icon,
  MarketAnalysisIcon,
  Clock02Icon,
  SidebarLeftIcon,
} from "hugeicons-react";
import { NoblocksLogo } from "@/app/components/ImageAssets";
import { getFeatureFlags } from "@/app/lib/flags";
import { getVisibleWalletShellAssetNavLinks } from "@/app/lib/wallet-shell-nav";
import { NavMenuItem, NavSectionLabel, ShellIconButton } from "./NavMenuItem";
import { WalletAccountMenu } from "./WalletAccountMenu";
import { classNames } from "@/app/utils";
import { shellFocusRingClasses } from "./shellFocusStyles";

type NavLinkDef = {
  label: string;
  href: string;
  icon: React.ReactNode;
};

const ASSET_LINK_ICONS: Record<string, React.ReactNode> = {
  Tokens: <Coins01Icon className="size-[18px]" />,
  Earn: <Money03Icon className="size-[18px]" />,
  Stocks: <MarketAnalysisIcon className="size-[18px]" />,
};

type LeftNavProps = {
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
};

export function LeftNav({ mobileOpen, onMobileOpenChange }: LeftNavProps) {
  const flags = useMemo(() => getFeatureFlags(), []);
  const visibleAssets = getVisibleWalletShellAssetNavLinks(flags);

  const assetLinks: NavLinkDef[] = visibleAssets.map((link) => ({
    label: link.label,
    href: link.href,
    icon: ASSET_LINK_ICONS[link.label] ?? (
      <Coins01Icon className="size-[18px]" />
    ),
  }));

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          aria-hidden
          onClick={() => onMobileOpenChange(false)}
        />
      )}

      <aside
        className={classNames(
          "fixed inset-y-0 left-0 z-40 flex h-dvh w-[214px] shrink-0 flex-col justify-between overflow-y-auto border-r border-border-light bg-background-neutral pb-7 pl-5 pt-1 transition-transform duration-200 dark:border-white/10 dark:bg-surface-canvas md:static md:z-auto md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
        data-mobile-nav-open={mobileOpen ? "true" : "false"}
      >
        <div className="flex flex-col gap-9 pr-3 pt-2">
          <div className="flex items-center justify-between pr-1">
            <Link
              href="/"
              className={classNames("block shrink-0", shellFocusRingClasses, "rounded-md")}
              aria-label="Noblocks home"
            >
              <NoblocksLogo className="h-[14px] w-[120px]" />
            </Link>
            <ShellIconButton
              label="Close navigation"
              className="md:hidden"
              onClick={() => onMobileOpenChange(false)}
            >
              <SidebarLeftIcon className="size-5" />
            </ShellIconButton>
          </div>

          <nav className="flex min-h-0 flex-1 flex-col gap-6" aria-label="Main">
            <NavMenuItem
              href="/"
              label="Home"
              icon={<Home04Icon className="size-[18px]" />}
            />

            <div className="flex flex-col gap-1.5">
              <NavSectionLabel>Assets</NavSectionLabel>
              <div className="flex flex-col gap-1">
                {assetLinks.map((link) => (
                  <NavMenuItem
                    key={link.href}
                    href={link.href}
                    label={link.label}
                    icon={link.icon}
                  />
                ))}
              </div>
            </div>
          </nav>
        </div>

        <div className="mt-6 flex flex-col gap-2 pr-3">
          <NavMenuItem
            href="/history"
            label="History"
            icon={<Clock02Icon className="size-[18px]" />}
          />
          <WalletAccountMenu />
        </div>
      </aside>
    </>
  );
}
