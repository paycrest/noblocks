import { canonicalTokenSymbol } from "./token-symbol";
import { resolveWalletRouteId } from "./wallet-routes";

export type BreadcrumbCrumb = {
  label: string;
  href?: string;
};

export type BuildWalletBreadcrumbsInput = {
  pathname: string;
  tokenDisplayName?: string;
};

const ROUTE_LABELS: Record<string, string> = {
  home: "Home",
  tokens: "Tokens",
  earn: "Earn",
  stocks: "Stocks",
  history: "History",
  profile: "Profile",
  settings: "Settings",
  beneficiaries: "Beneficiaries",
  transfer: "Transfer",
};

/**
 * Builds breadcrumb segments for the wallet top bar.
 * Home route returns a single "Home" crumb (rendered as "Home /" in the UI).
 */
export function buildWalletBreadcrumbs({
  pathname,
  tokenDisplayName,
}: BuildWalletBreadcrumbsInput): BreadcrumbCrumb[] {
  const routeId = resolveWalletRouteId(pathname);
  if (!routeId || routeId === "home") {
    return [{ label: "Home" }];
  }

  const crumbs: BreadcrumbCrumb[] = [
    { label: "Home", href: "/" },
    { label: ROUTE_LABELS[routeId] ?? routeId },
  ];

  if (routeId === "tokens" && pathname.startsWith("/tokens/")) {
    const rawSymbol = pathname.split("/")[2] ?? "";
    const symbol = canonicalTokenSymbol(decodeURIComponent(rawSymbol));
    if (symbol) {
      crumbs.push({
        label: tokenDisplayName?.trim() || symbol,
      });
    }
  }

  return crumbs;
}
