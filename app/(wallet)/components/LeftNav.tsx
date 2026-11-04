"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  useDrawerFocusTrap,
  useDrawerOpenFocus,
} from "@/app/components/drawer/hooks";
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
import { WALLET_MOBILE_NAV_ID } from "./walletShellIds";
import { useIsBelowMd } from "./useIsBelowMd";

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
  const isBelowMd = useIsBelowMd();
  const [asideEl, setAsideEl] = useState<HTMLElement | null>(null);
  const mobileDrawerActive = isBelowMd && mobileOpen;
  const mobileAsideInert = isBelowMd && !mobileOpen;

  useDrawerOpenFocus(asideEl, mobileDrawerActive);
  useDrawerFocusTrap(asideEl, mobileDrawerActive);

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
        ref={setAsideEl}
        id={WALLET_MOBILE_NAV_ID}
        className={classNames(
          "fixed inset-y-0 left-0 z-40 flex h-dvh w-[214px] shrink-0 flex-col justify-between overflow-y-auto border-r border-border-light md:border-r-0 bg-white pb-7 pl-5 pt-1 dark:border-white/10 dark:bg-surface-canvas md:static md:z-auto md:translate-x-0",
          "max-md:transition-[transform,visibility] max-md:duration-200 max-md:motion-reduce:transition-none",
          mobileOpen
            ? "translate-x-0 max-md:visible max-md:pointer-events-auto max-md:[transition:transform_200ms_ease,visibility_0s_0ms] max-md:motion-reduce:[transition:none]"
            : "-translate-x-full max-md:invisible max-md:pointer-events-none max-md:[transition:transform_200ms_ease,visibility_0s_200ms] max-md:motion-reduce:[transition:none]",
        )}
        data-mobile-nav-open={mobileOpen ? "true" : "false"}
        {...(mobileDrawerActive
          ? ({
              role: "dialog",
              "aria-modal": true,
              "aria-label": "Main navigation",
            } as const)
          : {})}
        {...(mobileAsideInert
          ? ({ inert: true, "aria-hidden": true } as const)
          : {})}
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
              className="size-11 md:hidden"
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
