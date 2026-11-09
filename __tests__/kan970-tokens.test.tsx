/// <reference types="jest" />

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { PortfolioHolding, PortfolioSummary } from "../app/lib/portfolio/types";
import { isAllowedWalletTokenSymbol } from "../app/lib/wallet-token-allowlist";
import {
  TokensPageContent,
  aggregateTokenHoldings,
  computeTodaysPnlUsd,
  sortTokenHoldingsByUsd,
} from "../app/(wallet)/components/tokens/TokensPageContent";
import { TokenDetailContent } from "../app/(wallet)/components/tokens/TokenDetailContent";
import {
  formatChartSampleDate,
  formatTooltipUnitPrice,
  nearestSampleIndex,
  parseChartSamples,
  tooltipCardPosition,
} from "../app/(wallet)/components/tokens/TokenPriceChart";

jest.mock("../app/hooks/usePortfolio", () => ({
  usePortfolio: jest.fn(),
}));

jest.mock("../app/hooks/useBridgeStatusTracker", () => ({
  useBridgeStatusTracker: jest.fn(() => ({
    trackBridge: jest.fn(),
    pendingBridges: [],
  })),
}));

jest.mock("../app/(wallet)/components/tokens/TokensPageContent", () => {
  const actual = jest.requireActual(
    "../app/(wallet)/components/tokens/TokensPageContent",
  );
  return {
    ...actual,
    useTokenMarketQuotes: jest.fn(() => ({
      quotesById: {},
      isLoading: false,
    })),
    useTokenMarketSnapshot: jest.fn(),
    useTokenMarketHistory: jest.fn(),
  };
});

jest.mock("@privy-io/react-auth", () => ({
  usePrivy: jest.fn(() => ({ ready: true, authenticated: true })),
}));

jest.mock("@/components/drawer", () => ({
  ActionDrawer: ({
    isOpen,
    title,
    children,
  }: {
    isOpen: boolean;
    title: string;
    children: React.ReactNode;
  }) =>
    isOpen ? (
      <div data-testid="action-drawer">
        <h2>{title}</h2>
        {children}
      </div>
    ) : null,
}));

jest.mock("@/components/deposit/DepositDrawer", () => ({
  DepositDrawer: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="deposit-drawer" /> : null,
}));

jest.mock("@/components/deposit/DepositTokenModal", () => ({
  DepositTokenModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="deposit-token-modal" /> : null,
}));

jest.mock("@/components/TransferForm", () => ({
  TransferForm: ({
    preferredTokenSymbol,
  }: {
    preferredTokenSymbol?: string;
  }) => (
    <div
      data-testid="transfer-form"
      data-preferred-token={preferredTokenSymbol}
    />
  ),
}));

jest.mock("@/components/bridge/BridgeForm", () => ({
  BridgeForm: ({ preferredTokenSymbol }: { preferredTokenSymbol?: string }) => (
    <div
      data-testid="bridge-form"
      data-preferred-token={preferredTokenSymbol}
    />
  ),
}));

jest.mock("@/components/wallet-mobile-modal/ReferralHubView", () => ({
  ReferralHubView: () => null,
}));

jest.mock("@/components/CopyAddressWarningModal", () => ({
  CopyAddressWarningModal: () => null,
}));

jest.mock("@/hooks/useWalletAddress", () => ({
  useWalletAddress: jest.fn(() => "0xabc"),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: { alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={props.alt} />
  ),
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

jest.mock("../app/lib/flags", () => ({
  getFeatureFlags: jest.fn(() => ({
    stocks: false,
    "noblocks-earn-v2": false,
    "noblocks-swap": true,
    "noblocks-marketplace": false,
    "noblocks-kyb": false,
    "noblocks-tx-protection": false,
  })),
}));

jest.mock("../app/utils", () => {
  const actual = jest.requireActual("../app/utils");
  return {
    ...actual,
    isReferralEnabled: jest.fn(() => false),
    copyToClipboard: jest.fn(() => Promise.resolve(true)),
  };
});

const { usePortfolio } = jest.requireMock("../app/hooks/usePortfolio");
const {
  useTokenMarketSnapshot,
  useTokenMarketHistory,
  useTokenMarketQuotes,
} = jest.requireMock("../app/(wallet)/components/tokens/TokensPageContent");

function holding(partial: Partial<PortfolioHolding> & Pick<PortfolioHolding, "symbol" | "amount" | "usd">): PortfolioHolding {
  return {
    id: partial.id ?? partial.symbol,
    chain: partial.chain ?? "Base",
    asOf: partial.asOf ?? "2026-11-05T12:00:00.000Z",
    ...partial,
  };
}

function mockTokenDetailMarket({
  points = [
    [1, "1"],
    [2, "1.01"],
  ] as Array<[number, string]>,
  unavailable = false,
  price = "1",
}: {
  points?: Array<[number, string]>;
  unavailable?: boolean;
  price?: string;
} = {}) {
  useTokenMarketSnapshot.mockReturnValue({
    data: unavailable
      ? null
      : {
          id: "usdc",
          price,
          change24h: { pct: "0.01", abs: "0.0001" },
          asOf: "2026-11-05T12:00:00.000Z",
          stale: false,
          stats: null,
        },
    isLoading: false,
    unavailable,
    error: unavailable,
    refetch: jest.fn(),
  });
  useTokenMarketHistory.mockReturnValue({
    data: unavailable
      ? null
      : {
          id: "usdc",
          range: "1D",
          points,
          stale: false,
        },
    isLoading: false,
    unavailable,
    error: false,
    refetch: jest.fn(),
  });
}

function mockVisibleChart(width = 640, height = 320) {
  const chart = screen.getByTestId("token-price-chart");
  jest.spyOn(chart, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    width,
    height,
    right: width,
    bottom: height,
    toJSON() {
      return {};
    },
  });
  return chart;
}

const tokenSummary = (holdings: PortfolioHolding[]): PortfolioSummary => ({
  success: true,
  totalUsd: "1257.94",
  stale: false,
  asOf: "2026-11-05T12:00:00.000Z",
  buckets: {
    tokens: {
      totalUsd: "1257.94",
      stale: false,
      asOf: "2026-11-05T12:00:00.000Z",
      holdings,
    },
    earn: {
      totalUsd: "0",
      stale: false,
      asOf: "2026-11-05T12:00:00.000Z",
      holdings: [],
    },
    stocks: {
      totalUsd: "0",
      stale: false,
      asOf: "2026-11-05T12:00:00.000Z",
      holdings: [],
    },
  },
});

describe("KAN-970 token holdings helpers", () => {
  it("sorts rows by USD value descending", () => {
    const rows = sortTokenHoldingsByUsd([
      {
        symbol: "USDT",
        name: "Tether",
        amount: "1",
        usd: "10",
        priceUnavailable: false,
      },
      {
        symbol: "USDC",
        name: "USD Coin",
        amount: "1",
        usd: "1000",
        priceUnavailable: false,
      },
    ]);
    expect(rows.map((r) => r.symbol)).toEqual(["USDC", "USDT"]);
  });

  it("aggregates cross-chain amounts for the same symbol", () => {
    const rows = aggregateTokenHoldings([
      holding({ symbol: "USDC", amount: "10", usd: "10", id: "1" }),
      holding({ symbol: "USDC", amount: "5", usd: "5", id: "2", chain: "Arbitrum One" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.amount).toBe("15");
    expect(rows[0]?.usd).toBe("15");
  });

  it("computes today's PnL as balance × signed 24h unit price change (up day)", () => {
    const result = computeTodaysPnlUsd("1000", { pct: "0.01", abs: "0.0001" });
    expect(result).toEqual({
      status: "ok",
      usd: "0.1",
      pct: "0.01",
    });
  });

  it("computes negative USD PnL when pct is down (signed API delta)", () => {
    const result = computeTodaysPnlUsd("1000", { pct: "-0.5", abs: "-0.005" });
    expect(result).toEqual({
      status: "ok",
      usd: "-5",
      pct: "-0.5",
    });
  });

  it("computes negative USD PnL when abs is magnitude-only but pct is down", () => {
    const result = computeTodaysPnlUsd("1000", { pct: "-0.01", abs: "0.0001" });
    expect(result).toEqual({
      status: "ok",
      usd: "-0.1",
      pct: "-0.01",
    });
  });

  it("returns unavailable PnL when change24h is missing", () => {
    expect(computeTodaysPnlUsd("1000", null)).toEqual({
      status: "unavailable",
    });
  });

  it("rejects unsupported token symbols for dynamic routes", () => {
    expect(isAllowedWalletTokenSymbol("NOTATOKEN")).toBe(false);
    expect(isAllowedWalletTokenSymbol("USDC")).toBe(true);
  });

  it("rejects malformed percent-encoded symbols without throwing", () => {
    expect(() => isAllowedWalletTokenSymbol("100%")).not.toThrow();
    expect(isAllowedWalletTokenSymbol("100%")).toBe(false);
    expect(isAllowedWalletTokenSymbol("USDC")).toBe(true);
  });
});

describe("TokensPageContent", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/market/tokens/usdc")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              id: "usdc",
              price: "1",
              change24h: { pct: "-0.07", abs: "0" },
              asOf: "2026-11-05T12:00:00.000Z",
              stale: false,
              stats: null,
            },
          }),
        } as Response;
      }
      if (url.includes("/api/market/tokens/usdt")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              id: "usdt",
              price: "1",
              change24h: { pct: "0.94", abs: "0" },
              asOf: "2026-11-05T12:00:00.000Z",
              stale: false,
              stats: null,
            },
          }),
        } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("shows empty state when the tokens bucket has no holdings", () => {
    usePortfolio.mockReturnValue({
      data: tokenSummary([]),
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<TokensPageContent />);
    expect(screen.getByText("No tokens yet")).toBeInTheDocument();
    const addFunds = screen.getByRole("button", { name: "Add funds" });
    expect(addFunds).toBeInTheDocument();
    expect(addFunds).toHaveClass("h-11", "rounded-xl", "dark:bg-white/10");
  });

  it("adds focus ring classes to portfolio error retry", () => {
    usePortfolio.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error("fail"),
      refetch: jest.fn(),
    });

    render(<TokensPageContent />);
    const retry = screen.getByRole("button", { name: /Try again/i });
    expect(retry.className).toMatch(/focus-visible:ring/);
    expect(retry).toHaveClass("rounded-md");
  });

  it("lists holdings sorted by USD with 24h change", async () => {
    usePortfolio.mockReturnValue({
      data: tokenSummary([
        holding({ symbol: "USDT", amount: "201.09", usd: "201.09", id: "u" }),
        holding({ symbol: "USDC", amount: "1000.48", usd: "1000.48", id: "c" }),
      ]),
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<TokensPageContent />);
    await waitFor(() => {
      expect(screen.getByText("-0.07%")).toBeInTheDocument();
    });
    const links = screen.getAllByRole("link");
    const tokenLinks = links.filter((link) =>
      link.getAttribute("href")?.startsWith("/tokens/"),
    );
    expect(tokenLinks[0]).toHaveAttribute("href", "/tokens/USDC");
    expect(screen.getByText("-0.07%")).toBeInTheDocument();
    expect(screen.getByText("+0.94%")).toBeInTheDocument();
  });

  it("keeps non-allowlisted holdings visible without a detail link", () => {
    usePortfolio.mockReturnValue({
      data: tokenSummary([
        holding({ symbol: "USDC", amount: "10", usd: "10", id: "c" }),
        holding({ symbol: "NOTATOKEN", amount: "5", usd: "5", id: "n" }),
      ]),
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<TokensPageContent />);
    expect(screen.getByText("5 NOTATOKEN")).toBeInTheDocument();
    expect(screen.getByText("$5.00")).toBeInTheDocument();
    const tokenLinks = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href")?.startsWith("/tokens/"));
    expect(tokenLinks.map((link) => link.getAttribute("href"))).toEqual([
      "/tokens/USDC",
    ]);
    expect(screen.queryByRole("link", { name: /NOTATOKEN/i })).toBeNull();
  });

  it("keeps malformed symbols visible without a detail link", () => {
    usePortfolio.mockReturnValue({
      data: tokenSummary([
        holding({ symbol: "USDC", amount: "10", usd: "10", id: "c" }),
        holding({ symbol: "100%", amount: "3", usd: "3", id: "p" }),
      ]),
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    expect(() => render(<TokensPageContent />)).not.toThrow();
    expect(screen.getByText("3 100%")).toBeInTheDocument();
    expect(screen.getByText("$3.00")).toBeInTheDocument();
    const tokenLinks = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href")?.startsWith("/tokens/"));
    expect(tokenLinks.map((link) => link.getAttribute("href"))).toEqual([
      "/tokens/USDC",
    ]);
    expect(screen.queryByRole("link", { name: /100%/ })).toBeNull();
  });

  it("opens the deposit drawer from the Add funds button", () => {
    usePortfolio.mockReturnValue({
      data: tokenSummary([
        holding({ symbol: "USDC", amount: "10", usd: "10", id: "c" }),
      ]),
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<TokensPageContent />);
    fireEvent.click(screen.getByRole("button", { name: "Add funds" }));
    expect(screen.getByTestId("deposit-drawer")).toBeInTheDocument();
  });

  it("opens the deposit drawer from the empty-state Add funds button", () => {
    usePortfolio.mockReturnValue({
      data: tokenSummary([]),
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<TokensPageContent />);
    fireEvent.click(screen.getByRole("button", { name: "Add funds" }));
    expect(screen.getByTestId("deposit-drawer")).toBeInTheDocument();
  });
});

describe("TokenDetailContent", () => {
  beforeEach(() => {
    usePortfolio.mockReturnValue({
      data: tokenSummary([
        holding({ symbol: "USDC", amount: "1000.4831", usd: "1000.48", id: "c" }),
      ]),
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  it("shows balance when market data is unavailable", () => {
    useTokenMarketSnapshot.mockReturnValue({
      data: null,
      isLoading: false,
      unavailable: true,
      error: true,
      refetch: jest.fn(),
    });
    useTokenMarketHistory.mockReturnValue({
      data: null,
      isLoading: false,
      unavailable: true,
      error: false,
      refetch: jest.fn(),
    });

    render(<TokenDetailContent symbol="USDC" />);
    expect(screen.getByTestId("token-balance-amount")).toHaveTextContent(
      "1,000.4831",
    );
    expect(screen.getByTestId("token-pnl-unavailable")).toBeInTheDocument();
    expect(screen.getByText("Chart unavailable")).toBeInTheDocument();
  });

  it("reloads chart range via hook dependency", async () => {
    useTokenMarketSnapshot.mockReturnValue({
      data: {
        id: "usdc",
        price: "1",
        change24h: { pct: "0.01", abs: "0.0001" },
        asOf: "2026-11-05T12:00:00.000Z",
        stale: false,
        stats: null,
      },
      isLoading: false,
      unavailable: false,
      error: false,
      refetch: jest.fn(),
    });
    useTokenMarketHistory.mockReturnValue({
      data: {
        id: "usdc",
        range: "1D",
        points: [
          [1, "1"],
          [2, "1.01"],
        ],
        stale: false,
      },
      isLoading: false,
      unavailable: false,
      error: false,
      refetch: jest.fn(),
    });

    render(<TokenDetailContent symbol="USDC" />);
    fireEvent.click(screen.getByRole("button", { name: "1W" }));
    await waitFor(() => {
      expect(useTokenMarketHistory).toHaveBeenCalledWith(
        "usdc",
        "1W",
        expect.anything(),
      );
    });
  });

  it("formats positive sub-cent market prices without collapsing to $0.00", () => {
    useTokenMarketSnapshot.mockReturnValue({
      data: {
        id: "usdc",
        price: "0.00072286",
        change24h: { pct: "0.01", abs: "0.0001" },
        asOf: "2026-11-05T12:00:00.000Z",
        stale: false,
        stats: null,
      },
      isLoading: false,
      unavailable: false,
      error: false,
      refetch: jest.fn(),
    });
    useTokenMarketHistory.mockReturnValue({
      data: {
        id: "usdc",
        range: "1D",
        points: [
          [1, "0.0007"],
          [2, "0.0008"],
        ],
        stale: false,
      },
      isLoading: false,
      unavailable: false,
      error: false,
      refetch: jest.fn(),
    });

    render(<TokenDetailContent symbol="USDC" />);
    const header = screen.getByTestId("token-price-header");
    expect(header.textContent).not.toMatch(/\$0\.00(?!\d)/);
    expect(header.textContent).toMatch(/\$0\.00072/);
  });

  it("shows PnL trend caret when market data is available", () => {
    useTokenMarketSnapshot.mockReturnValue({
      data: {
        id: "usdc",
        price: "1",
        change24h: { pct: "0.01", abs: "0.0001" },
        asOf: "2026-11-05T12:00:00.000Z",
        stale: false,
        stats: null,
      },
      isLoading: false,
      unavailable: false,
      error: false,
      refetch: jest.fn(),
    });
    useTokenMarketHistory.mockReturnValue({
      data: {
        id: "usdc",
        range: "1D",
        points: [
          [1, "1"],
          [2, "1.01"],
        ],
        stale: false,
      },
      isLoading: false,
      unavailable: false,
      error: false,
      refetch: jest.fn(),
    });

    const { container } = render(<TokenDetailContent symbol="USDC" />);
    expect(screen.getByTestId("token-pnl-value")).toBeInTheDocument();
    expect(container.querySelector('[data-testid="token-pnl-value"] svg')).toBeTruthy();

    const header = screen.getByTestId("token-price-header");
    expect(header).toHaveClass("px-5", "pt-4", "pb-4");
    expect(header).toContainElement(screen.getByTestId("token-pnl-value"));

    const chart = screen.getByTestId("token-price-chart");
    expect(chart).toHaveClass("w-full", "h-[320px]");

    const legend = screen.getByTestId("token-market-legend");
    expect(legend.className).toContain("gap-x-[95px]");
    expect(legend.className).not.toMatch(/grid-cols-3/);
  });

  it("renders the price chart full-bleed with a non-scaling stroke", () => {
    useTokenMarketSnapshot.mockReturnValue({
      data: {
        id: "usdc",
        price: "1",
        change24h: { pct: "0.01", abs: "0.0001" },
        asOf: "2026-11-05T12:00:00.000Z",
        stale: false,
        stats: null,
      },
      isLoading: false,
      unavailable: false,
      error: false,
      refetch: jest.fn(),
    });
    useTokenMarketHistory.mockReturnValue({
      data: {
        id: "usdc",
        range: "1D",
        points: [
          [1, "1"],
          [2, "1.01"],
        ],
        stale: false,
      },
      isLoading: false,
      unavailable: false,
      error: false,
      refetch: jest.fn(),
    });

    render(<TokenDetailContent symbol="USDC" />);

    const chart = screen.getByTestId("token-price-chart");
    expect(chart).toHaveClass("w-full", "h-[320px]");

    const svg = screen.getByTestId("token-price-chart-svg");
    expect(svg).toHaveAttribute("preserveAspectRatio", "none");
    expect(svg).toHaveAttribute("viewBox", "0 0 640 320");
    expect(svg).toHaveClass("w-full");

    const line = svg.querySelector('path[fill="none"]');
    expect(line).toHaveAttribute("vector-effect", "non-scaling-stroke");
    expect(line?.getAttribute("d")).toMatch(/^M 0\.00 /);
    expect(line?.getAttribute("d")).toMatch(/ L 640\.00 /);

    const area = svg.querySelector('path[fill="url(#token-price-fill)"]');
    expect(area?.getAttribute("d")).toMatch(/ L 640 320 L 0 320 Z$/);
  });

  it("scrubs the nearest real sample and shows unit price, range delta, and timestamp", () => {
    const t0 = 1_700_000_000;
    const t1 = t0 + 15 * 60;
    const t2 = t0 + 30 * 60;
    mockTokenDetailMarket({
      points: [
        [t0, "0.9988"],
        [t1, "0.9991"],
        [t2, "1.0012"],
      ],
    });

    render(<TokenDetailContent symbol="USDC" />);
    const chart = mockVisibleChart(640);

    fireEvent.mouseMove(chart, { clientX: 0, clientY: 160 });
    expect(screen.getByTestId("token-price-chart-tooltip-price")).toHaveTextContent(
      "$0.9988",
    );
    expect(screen.getByTestId("token-price-chart-tooltip-delta")).toHaveTextContent(
      "$0.00 (0.00%)",
    );
    expect(screen.getByTestId("token-price-chart-tooltip-date")).toHaveTextContent(
      formatChartSampleDate(t0, "1D"),
    );
    expect(
      screen.getByTestId("token-price-chart-tooltip-price").textContent,
    ).not.toMatch(/USDC/);

    fireEvent.mouseMove(chart, { clientX: 640, clientY: 160 });
    expect(screen.getByTestId("token-price-chart-tooltip-price")).toHaveTextContent(
      "$1.0012",
    );
    expect(screen.getByTestId("token-price-chart-tooltip-delta")).toHaveTextContent(
      "$0.0024 (0.24%)",
    );
    expect(screen.getByTestId("token-price-chart-tooltip-date")).toHaveTextContent(
      formatChartSampleDate(t2, "1D"),
    );
    expect(screen.getByTestId("token-price-chart-marker")).toBeInTheDocument();
    expect(screen.getByTestId("token-price-chart-guide")).toBeInTheDocument();
  });

  it("clamps the tooltip card at the left and right chart edges", () => {
    mockTokenDetailMarket({
      points: [
        [1_700_000_000, "1"],
        [1_700_000_900, "1.01"],
      ],
    });
    render(<TokenDetailContent symbol="USDC" />);
    const chart = mockVisibleChart(640);

    fireEvent.mouseMove(chart, { clientX: 0, clientY: 160 });
    expect(screen.getByTestId("token-price-chart-tooltip")).toHaveStyle({
      left: "0px",
    });

    fireEvent.mouseMove(chart, { clientX: 640, clientY: 160 });
    expect(screen.getByTestId("token-price-chart-tooltip")).toHaveStyle({
      left: "384px",
    });
  });

  it("hides the tooltip on pointer leave, Escape, and touch end", () => {
    mockTokenDetailMarket({
      points: [
        [1_700_000_000, "1"],
        [1_700_000_900, "1.01"],
      ],
    });
    render(<TokenDetailContent symbol="USDC" />);
    const chart = mockVisibleChart(640);

    fireEvent.mouseMove(chart, { clientX: 320, clientY: 160 });
    expect(screen.getByTestId("token-price-chart-tooltip")).toBeInTheDocument();

    fireEvent.mouseLeave(chart);
    expect(
      screen.queryByTestId("token-price-chart-tooltip"),
    ).not.toBeInTheDocument();

    fireEvent.mouseMove(chart, { clientX: 320, clientY: 160 });
    chart.focus();
    fireEvent.keyDown(chart, { key: "Escape" });
    expect(
      screen.queryByTestId("token-price-chart-tooltip"),
    ).not.toBeInTheDocument();

    fireEvent.touchStart(chart, {
      touches: [{ clientX: 320, clientY: 160 }],
    });
    expect(screen.getByTestId("token-price-chart-tooltip")).toBeInTheDocument();
    fireEvent.touchEnd(chart);
    expect(
      screen.queryByTestId("token-price-chart-tooltip"),
    ).not.toBeInTheDocument();
  });

  it("moves the selected sample with keyboard arrows", () => {
    const t0 = 1_700_000_000;
    mockTokenDetailMarket({
      points: [
        [t0, "1.00"],
        [t0 + 900, "1.10"],
        [t0 + 1800, "1.20"],
      ],
    });
    render(<TokenDetailContent symbol="USDC" />);
    const chart = mockVisibleChart(640);
    chart.focus();

    fireEvent.keyDown(chart, { key: "ArrowRight" });
    expect(screen.getByTestId("token-price-chart-tooltip-price")).toHaveTextContent(
      "$1.20",
    );

    fireEvent.keyDown(chart, { key: "ArrowLeft" });
    expect(screen.getByTestId("token-price-chart-tooltip-price")).toHaveTextContent(
      "$1.10",
    );

    fireEvent.keyDown(chart, { key: "Home" });
    expect(screen.getByTestId("token-price-chart-tooltip-price")).toHaveTextContent(
      "$1.00",
    );
  });

  it("resets the active point when the chart range changes", async () => {
    mockTokenDetailMarket({
      points: [
        [1_700_000_000, "1"],
        [1_700_000_900, "1.01"],
      ],
    });
    render(<TokenDetailContent symbol="USDC" />);
    const chart = mockVisibleChart(640);
    fireEvent.mouseMove(chart, { clientX: 320, clientY: 160 });
    expect(screen.getByTestId("token-price-chart-tooltip")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "1W" }));
    await waitFor(() => {
      expect(
        screen.queryByTestId("token-price-chart-tooltip"),
      ).not.toBeInTheDocument();
    });
  });

  it("keeps timestamps aligned after dropping invalid prices", () => {
    const tValid = 1_700_001_800;
    mockTokenDetailMarket({
      points: [
        [1_700_000_000, "1"],
        [1_700_000_900, "not-a-price"],
        [tValid, "1.50"],
      ],
    });
    render(<TokenDetailContent symbol="USDC" />);
    const chart = mockVisibleChart(640);
    fireEvent.mouseMove(chart, { clientX: 640, clientY: 160 });
    expect(screen.getByTestId("token-price-chart-tooltip-price")).toHaveTextContent(
      "$1.50",
    );
    expect(screen.getByTestId("token-price-chart-tooltip-date")).toHaveTextContent(
      formatChartSampleDate(tValid, "1D"),
    );
  });

  it("does not show a tooltip for loading, unavailable, or single-point series", () => {
    useTokenMarketSnapshot.mockReturnValue({
      data: {
        id: "usdc",
        price: "1",
        change24h: { pct: "0.01", abs: "0.0001" },
        asOf: "2026-11-05T12:00:00.000Z",
        stale: false,
        stats: null,
      },
      isLoading: true,
      unavailable: false,
      error: false,
      refetch: jest.fn(),
    });
    useTokenMarketHistory.mockReturnValue({
      data: null,
      isLoading: true,
      unavailable: false,
      error: false,
      refetch: jest.fn(),
    });
    const { unmount } = render(<TokenDetailContent symbol="USDC" />);
    fireEvent.mouseMove(screen.getByTestId("token-price-chart"), {
      clientX: 10,
      clientY: 10,
    });
    expect(screen.getByText("Loading chart…")).toBeInTheDocument();
    expect(
      screen.queryByTestId("token-price-chart-tooltip"),
    ).not.toBeInTheDocument();
    unmount();

    mockTokenDetailMarket({
      unavailable: true,
      points: [],
    });
    const second = render(<TokenDetailContent symbol="USDC" />);
    expect(screen.getByText("Chart unavailable")).toBeInTheDocument();
    fireEvent.mouseMove(screen.getByTestId("token-price-chart"), {
      clientX: 10,
      clientY: 10,
    });
    expect(
      screen.queryByTestId("token-price-chart-tooltip"),
    ).not.toBeInTheDocument();
    second.unmount();

    mockTokenDetailMarket({
      points: [[1_700_000_000, "1"]],
    });
    render(<TokenDetailContent symbol="USDC" />);
    expect(screen.getByText("Chart unavailable")).toBeInTheDocument();
    expect(
      screen.queryByTestId("token-price-chart-tooltip"),
    ).not.toBeInTheDocument();
  });

  it("shows price and leaves PnL unavailable when change24h is missing", () => {
    useTokenMarketSnapshot.mockReturnValue({
      data: {
        id: "usdc",
        price: "1",
        change24h: null,
        asOf: "2026-11-05T12:00:00.000Z",
        stale: false,
        stats: null,
      },
      isLoading: false,
      unavailable: false,
      error: false,
      refetch: jest.fn(),
    });
    useTokenMarketHistory.mockReturnValue({
      data: {
        id: "usdc",
        range: "1D",
        points: [
          [1, "1"],
          [2, "1.01"],
        ],
        stale: false,
      },
      isLoading: false,
      unavailable: false,
      error: false,
      refetch: jest.fn(),
    });

    render(<TokenDetailContent symbol="USDC" />);
    expect(screen.getByTestId("token-price-header")).toHaveTextContent("$1.00");
    expect(screen.getByTestId("token-pnl-unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Chart unavailable")).not.toBeInTheDocument();
  });

  it("shows PortfolioError and unavailable balance/PnL when portfolio fails", () => {
    const refetch = jest.fn();
    usePortfolio.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error("fail"),
      refetch,
    });
    useTokenMarketSnapshot.mockReturnValue({
      data: {
        id: "usdc",
        price: "1",
        change24h: { pct: "0.01", abs: "0.0001" },
        asOf: "2026-11-05T12:00:00.000Z",
        stale: false,
        stats: null,
      },
      isLoading: false,
      unavailable: false,
      error: false,
      refetch: jest.fn(),
    });
    useTokenMarketHistory.mockReturnValue({
      data: {
        id: "usdc",
        range: "1D",
        points: [
          [1, "1"],
          [2, "1.01"],
        ],
        stale: false,
      },
      isLoading: false,
      unavailable: false,
      error: false,
      refetch: jest.fn(),
    });

    render(<TokenDetailContent symbol="USDC" />);
    expect(screen.getByTestId("token-balance-amount")).toHaveTextContent("—");
    expect(screen.getByTestId("token-pnl-unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("token-pnl-value")).not.toBeInTheDocument();
    expect(
      screen.getByText("We couldn't load your token balances."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Try again/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it("opens ActionDrawer with preselected token for Transfer", () => {
    useTokenMarketSnapshot.mockReturnValue({
      data: null,
      isLoading: false,
      unavailable: true,
      error: true,
      refetch: jest.fn(),
    });
    useTokenMarketHistory.mockReturnValue({
      data: null,
      isLoading: false,
      unavailable: true,
      error: false,
      refetch: jest.fn(),
    });

    render(<TokenDetailContent symbol="USDC" />);
    fireEvent.click(screen.getByRole("button", { name: "Token actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Transfer" }));

    expect(screen.getByTestId("action-drawer")).toBeInTheDocument();
    expect(screen.getByTestId("transfer-form")).toHaveAttribute(
      "data-preferred-token",
      "USDC",
    );
  });

  it("opens the centred Add TOKEN modal from the Add funds button", () => {
    useTokenMarketSnapshot.mockReturnValue({
      data: null,
      isLoading: false,
      unavailable: true,
      error: true,
      refetch: jest.fn(),
    });
    useTokenMarketHistory.mockReturnValue({
      data: null,
      isLoading: false,
      unavailable: true,
      error: false,
      refetch: jest.fn(),
    });

    render(<TokenDetailContent symbol="USDC" />);
    fireEvent.click(screen.getByRole("button", { name: "Add funds" }));
    expect(screen.getByTestId("deposit-token-modal")).toBeInTheDocument();
  });
});

describe("TokenPriceChart helpers", () => {
  it("drops invalid prices without shifting timestamps", () => {
    const samples = parseChartSamples([
      [100, "1"],
      [101, "nope"],
      [102, "2"],
    ]);
    expect(samples).toHaveLength(2);
    expect(samples[0]?.t).toBe(100);
    expect(samples[1]?.t).toBe(102);
    expect(samples[0]?.x).toBe(0);
    expect(samples[1]?.x).toBe(640);
  });

  it("selects the nearest sample and clamps the tooltip card", () => {
    expect(nearestSampleIndex(0, { left: 0, width: 640 }, 3)).toBe(0);
    expect(nearestSampleIndex(640, { left: 0, width: 640 }, 3)).toBe(2);
    expect(nearestSampleIndex(320, { left: 0, width: 640 }, 3)).toBe(1);

    expect(tooltipCardPosition(0, 160, 640, 320).left).toBe(0);
    expect(tooltipCardPosition(640, 160, 640, 320).left).toBe(384);
    expect(tooltipCardPosition(0, 8, 640, 320).top).toBe(0);
    expect(tooltipCardPosition(100, 160, 200, 320).width).toBe(200);
  });

  it("formats sub-dollar unit prices without collapsing a tiny change to $0.00", () => {
    expect(formatTooltipUnitPrice("0.9988")).toBe("$0.9988");
    expect(formatTooltipUnitPrice("1.0012")).toBe("$1.0012");
    expect(formatTooltipUnitPrice("0.00004")).toBe("$0.00004");
    expect(formatChartSampleDate(1_700_000_000, "1D")).toMatch(/Nov/);
    expect(formatChartSampleDate(1_700_000_000, "1W")).toMatch(/2023/);
  });
});

describe("useTokenMarketSnapshot", () => {
  const originalFetch = global.fetch;
  const { useTokenMarketSnapshot: useRealSnapshot } = jest.requireActual(
    "../app/(wallet)/components/tokens/TokensPageContent",
  ) as typeof import("../app/(wallet)/components/tokens/TokensPageContent");

  function Harness({ marketId }: { marketId: string }) {
    const { data, unavailable, isLoading } = useRealSnapshot(marketId);
    if (isLoading) return <div>loading</div>;
    return (
      <div>
        <span data-testid="snap-price">{data?.price ?? ""}</span>
        <span data-testid="snap-unavailable">{String(unavailable)}</span>
      </div>
    );
  }

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("does not mark a priced snapshot unavailable when change24h is missing", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          id: "usdc",
          price: "1",
          change24h: null,
          asOf: "2026-11-05T12:00:00.000Z",
          stale: false,
          stats: null,
        },
      }),
    })) as typeof fetch;

    render(<Harness marketId="usdc" />);
    await waitFor(() => {
      expect(screen.getByTestId("snap-price")).toHaveTextContent("1");
    });
    expect(screen.getByTestId("snap-unavailable")).toHaveTextContent("false");
  });
});
