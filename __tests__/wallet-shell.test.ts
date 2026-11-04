import {
  buildWalletBreadcrumbs,
} from "../app/lib/breadcrumbs";
import {
  getFeatureFlags,
  isFeatureEnabled,
} from "../app/lib/flags";
import {
  isAllowedWalletTokenSymbol,
  resolveWalletTokenMeta,
} from "../app/lib/wallet-token-allowlist";
import {
  sanitizeAuthReturnPath,
  shouldGuardWalletRoute,
} from "../app/lib/wallet-auth";
import {
  isWalletAppPath,
  resolveWalletRouteId,
  walletRouteRequiresFeature,
} from "../app/lib/wallet-routes";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("wallet shell breadcrumbs", () => {
  it("returns Home only on root", () => {
    expect(buildWalletBreadcrumbs({ pathname: "/" })).toEqual([
      { label: "Home" },
    ]);
  });

  it("builds Tokens trail with token name", () => {
    expect(
      buildWalletBreadcrumbs({
        pathname: "/tokens/USDC",
        tokenDisplayName: "USD Coin",
      }),
    ).toEqual([
      { label: "Home", href: "/" },
      { label: "Tokens" },
      { label: "USD Coin" },
    ]);
  });
});

describe("wallet route flags", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_FF_NOBLOCKS_SWAP;
    delete process.env.NEXT_PUBLIC_FF_NOBLOCKS_EARN_V2;
    delete process.env.NEXT_PUBLIC_FF_STOCKS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("defaults all flags to off", () => {
    expect(getFeatureFlags()).toEqual({
      stocks: false,
      "noblocks-earn-v2": false,
      "noblocks-swap": false,
      "noblocks-marketplace": false,
      "noblocks-kyb": false,
      "noblocks-tx-protection": false,
    });
  });

  it("maps routes to feature flags (core routes are never flagged)", () => {
    expect(walletRouteRequiresFeature("/tokens")).toBeNull();
    expect(walletRouteRequiresFeature("/tokens/USDC")).toBeNull();
    expect(walletRouteRequiresFeature("/earn")).toBe("noblocks-earn-v2");
    expect(walletRouteRequiresFeature("/stocks")).toBe("stocks");
    expect(walletRouteRequiresFeature("/history")).toBeNull();
  });

  it("reads enabled flags from env", () => {
    process.env.NEXT_PUBLIC_FF_STOCKS = "true";
    expect(isFeatureEnabled("stocks")).toBe(true);
    expect(isFeatureEnabled("noblocks-swap")).toBe(false);
  });
});

describe("wallet auth helpers", () => {
  it("guards wallet app paths only", () => {
    expect(shouldGuardWalletRoute("/tokens")).toBe(true);
    expect(shouldGuardWalletRoute("/play")).toBe(false);
  });

  it("sanitizes return paths", () => {
    expect(sanitizeAuthReturnPath("/tokens")).toBe("/tokens");
    expect(sanitizeAuthReturnPath("https://evil.test")).toBeNull();
    expect(sanitizeAuthReturnPath("/play")).toBeNull();
  });
});

describe("wallet token allowlist", () => {
  it("accepts supported symbols", () => {
    expect(isAllowedWalletTokenSymbol("USDC")).toBe(true);
    expect(isAllowedWalletTokenSymbol("cNGN")).toBe(true);
  });

  it("rejects unknown symbols", () => {
    expect(isAllowedWalletTokenSymbol("NOTATOKEN")).toBe(false);
    expect(isAllowedWalletTokenSymbol("<script>")).toBe(false);
  });

  it("resolves display metadata", () => {
    expect(resolveWalletTokenMeta("usdc")?.name).toBe("USD Coin");
  });
});

describe("wallet route ids", () => {
  it("detects wallet shell paths", () => {
    expect(isWalletAppPath("/")).toBe(true);
    expect(isWalletAppPath("/tokens/eth")).toBe(true);
    expect(isWalletAppPath("/blog")).toBe(false);
  });

  it("resolves route ids", () => {
    expect(resolveWalletRouteId("/tokens/USDC")).toBe("tokens");
    expect(resolveWalletRouteId("/profile")).toBe("profile");
  });
});

describe("wallet shell layout scroll", () => {
  it("fixes shell height with h-dvh so main owns vertical scroll", () => {
    const layoutSource = readFileSync(
      join(process.cwd(), "app/(wallet)/layout.tsx"),
      "utf8",
    );
    expect(layoutSource).toContain("h-dvh");
    expect(layoutSource).toContain("overflow-y-auto");
  });

  it("wraps main and drawer slot in a clipped 20px content card", () => {
    const layoutSource = readFileSync(
      join(process.cwd(), "app/(wallet)/layout.tsx"),
      "utf8",
    );
    expect(layoutSource).toContain("rounded-[20px]");
    expect(layoutSource).toContain("mb-2.5 mr-2.5");
    expect(layoutSource).toContain("dark:bg-surface-canvas");
  });
});
