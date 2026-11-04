import type { FeatureFlagName } from "./flags";

/** Paths that render inside the v2 wallet shell (no legacy Navbar/Footer). */
const WALLET_SHELL_PATHS = [
  "/",
  "/tokens",
  "/earn",
  "/stocks",
  "/history",
  "/profile",
  "/settings",
  "/beneficiaries",
] as const;

export function isWalletAppPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (pathname === "/") return true;
  return WALLET_SHELL_PATHS.some(
    (base) => base !== "/" && (pathname === base || pathname.startsWith(`${base}/`)),
  );
}

export type WalletRouteId =
  | "home"
  | "tokens"
  | "earn"
  | "stocks"
  | "history"
  | "profile"
  | "settings"
  | "beneficiaries";

/** Routes gated when their feature flag is OFF (404 or redirect home). */
export const WALLET_ROUTE_FLAG: Partial<Record<WalletRouteId, FeatureFlagName>> = {
  earn: "noblocks-earn-v2",
  stocks: "stocks",
};

export function resolveWalletRouteId(pathname: string): WalletRouteId | null {
  if (pathname === "/") return "home";
  if (pathname === "/tokens" || pathname.startsWith("/tokens/")) return "tokens";
  if (pathname === "/earn" || pathname.startsWith("/earn/")) return "earn";
  if (pathname === "/stocks" || pathname.startsWith("/stocks/")) return "stocks";
  if (pathname === "/history" || pathname.startsWith("/history/")) return "history";
  if (pathname === "/profile" || pathname.startsWith("/profile/")) return "profile";
  if (pathname === "/settings" || pathname.startsWith("/settings/")) return "settings";
  if (pathname === "/beneficiaries" || pathname.startsWith("/beneficiaries/")) {
    return "beneficiaries";
  }
  return null;
}

export function walletRouteRequiresFeature(
  pathname: string,
): FeatureFlagName | null {
  const routeId = resolveWalletRouteId(pathname);
  if (!routeId) return null;
  return WALLET_ROUTE_FLAG[routeId] ?? null;
}
