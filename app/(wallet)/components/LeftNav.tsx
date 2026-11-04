"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Home04Icon,
  Coins01Icon,
  ChartIncreaseIcon,
  PieChartIcon,
  Clock01Icon,
  ArrowDown01Icon,
} from "hugeicons-react";
import { NoblocksLogo } from "@/app/components/ImageAssets";
import { getFeatureFlags, type FeatureFlagName } from "@/app/lib/flags";
import { NavMenuItem } from "./NavMenuItem";
import { WalletAccountMenu } from "./WalletAccountMenu";
import { classNames, shortenAddress } from "@/app/utils";
import { useWalletAddress } from "@/app/hooks/useWalletAddress";
import { usePrivy } from "@privy-io/react-auth";

type NavLinkDef = {
  label: string;
  href: string;
  icon: React.ReactNode;
  flag?: FeatureFlagName;
};

const ASSET_LINKS: NavLinkDef[] = [
  {
    label: "Tokens",
    href: "/tokens",
    icon: <Coins01Icon className="size-[18px]" />,
  },
  {
    label: "Earn",
    href: "/earn",
    icon: <ChartIncreaseIcon className="size-[18px]" />,
    flag: "noblocks-earn-v2",
  },
  {
    label: "Stocks",
    href: "/stocks",
    icon: <PieChartIcon className="size-[18px]" />,
    flag: "stocks",
  },
];

function isLinkVisible(flag: FeatureFlagName | undefined, flags: ReturnType<typeof getFeatureFlags>): boolean {
  if (!flag) return true;
  return flags[flag];
}

export function LeftNav() {
  const pathname = usePathname();
  const flags = useMemo(() => getFeatureFlags(), []);
  const [assetsOpen, setAssetsOpen] = useState(true);
  const walletAddress = useWalletAddress();
  const { authenticated } = usePrivy();

  const visibleAssets = ASSET_LINKS.filter((link) =>
    isLinkVisible(link.flag, flags),
  );

  const assetsActive = visibleAssets.some(
    (link) => pathname === link.href || pathname.startsWith(`${link.href}/`),
  );

  return (
    <aside className="flex h-dvh w-[214px] shrink-0 flex-col justify-between overflow-y-auto border-r border-border-light bg-background-neutral pb-7 pl-5 pt-1 dark:border-white/10 dark:bg-neutral-900">
      <div className="flex flex-col gap-9 pr-3 pt-2">
        <Link href="/" className="block shrink-0" aria-label="Noblocks home">
          <NoblocksLogo className="h-[14px] w-[120px]" />
        </Link>

        <nav className="flex flex-col gap-6" aria-label="Main">
          <NavMenuItem
            href="/"
            label="Home"
            icon={<Home04Icon className="size-[18px]" />}
          />

          <div className="flex flex-col gap-1">
            <NavMenuItem
              href="/tokens"
              label="Assets"
              icon={<Coins01Icon className="size-[18px]" />}
              hasDropdown
              dropdownOpen={assetsOpen}
              onToggleDropdown={() => setAssetsOpen((open) => !open)}
              isActive={assetsActive}
            />
            {assetsOpen && (
              <div className="ml-2 flex flex-col gap-0.5 border-l border-border-light pl-3 dark:border-white/10">
                {visibleAssets.map((link) => (
                  <NavMenuItem
                    key={link.href}
                    href={link.href}
                    label={link.label}
                    icon={link.icon}
                  />
                ))}
              </div>
            )}
          </div>

          <NavMenuItem
            href="/history"
            label="History"
            icon={<Clock01Icon className="size-[18px]" />}
          />
        </nav>
      </div>

      <div className="pr-3">
        <WalletAccountMenu
          trigger={
            <button
              type="button"
              className={classNames(
                "flex w-full items-center gap-2 rounded-xl bg-accent-gray px-2 py-2 text-left transition-colors hover:bg-border-light dark:bg-white/10 dark:hover:bg-white/15",
              )}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-lavender-100 text-xs font-semibold text-lavender-600 dark:bg-lavender-900/40 dark:text-lavender-300">
                {authenticated && walletAddress
                  ? walletAddress.slice(2, 4).toUpperCase()
                  : "—"}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-body dark:text-white">
                {authenticated && walletAddress
                  ? shortenAddress(walletAddress, 6)
                  : "Account"}
              </span>
              <ArrowDown01Icon className="size-4 shrink-0 text-icon-outline-secondary dark:text-white/50" />
            </button>
          }
        />
      </div>
    </aside>
  );
}
