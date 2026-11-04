import type { FeatureFlagName, FeatureFlags } from "@/app/lib/flags";

export type WalletShellNavLink = {
  label: string;
  href: string;
  flag?: FeatureFlagName;
};

export const WALLET_SHELL_ASSET_NAV_LINKS: WalletShellNavLink[] = [
  { label: "Tokens", href: "/tokens" },
  { label: "Earn", href: "/earn", flag: "noblocks-earn-v2" },
  { label: "Stocks", href: "/stocks", flag: "stocks" },
];

export function isWalletShellNavLinkVisible(
  flag: FeatureFlagName | undefined,
  flags: FeatureFlags,
): boolean {
  if (!flag) return true;
  return flags[flag];
}

export function getVisibleWalletShellAssetNavLinks(
  flags: FeatureFlags,
): WalletShellNavLink[] {
  return WALLET_SHELL_ASSET_NAV_LINKS.filter((link) =>
    isWalletShellNavLinkVisible(link.flag, flags),
  );
}
