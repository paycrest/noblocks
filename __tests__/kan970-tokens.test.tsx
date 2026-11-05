/// <reference types="jest" />

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { PortfolioHolding, PortfolioSummary } from "../app/lib/portfolio/types";
import {
  aggregateTokenHoldings,
  sortTokenHoldingsByUsd,
} from "../app/lib/tokens/aggregate-holdings";
import { computeTodaysPnlUsd } from "../app/lib/tokens/todays-pnl";
import { isAllowedWalletTokenSymbol } from "../app/lib/wallet-token-allowlist";
import { TokensPageContent } from "../app/(wallet)/components/tokens/TokensPageContent";
import { TokenDetailContent } from "../app/(wallet)/components/tokens/TokenDetailContent";

jest.mock("../app/hooks/usePortfolio", () => ({
  usePortfolio: jest.fn(),
}));

jest.mock("../app/hooks/useTokenMarket", () => ({
  useTokenMarketQuotes: jest.fn(() => ({ quotesById: {}, isLoading: false })),
  useTokenMarketSnapshot: jest.fn(),
  useTokenMarketHistory: jest.fn(),
}));

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
} = jest.requireMock("../app/hooks/useTokenMarket");

function holding(partial: Partial<PortfolioHolding> & Pick<PortfolioHolding, "symbol" | "amount" | "usd">): PortfolioHolding {
  return {
    id: partial.id ?? partial.symbol,
    chain: partial.chain ?? "Base",
    asOf: partial.asOf ?? "2026-11-05T12:00:00.000Z",
    ...partial,
  };
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

  it("rejects unsupported token symbols for dynamic routes", () => {
    expect(isAllowedWalletTokenSymbol("NOTATOKEN")).toBe(false);
    expect(isAllowedWalletTokenSymbol("USDC")).toBe(true);
  });
});

describe("TokensPageContent", () => {
  beforeEach(() => {
    useTokenMarketQuotes.mockReturnValue({
      quotesById: {
        usdc: { pct: "-0.07", unavailable: false },
        usdt: { pct: "0.94", unavailable: false },
      },
      isLoading: false,
    });
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
    expect(
      screen.getByRole("button", { name: "Add funds" }),
    ).toBeInTheDocument();
  });

  it("lists holdings sorted by USD with 24h change", () => {
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
    const links = screen.getAllByRole("link");
    const tokenLinks = links.filter((link) =>
      link.getAttribute("href")?.startsWith("/tokens/"),
    );
    expect(tokenLinks[0]).toHaveAttribute("href", "/tokens/USDC");
    expect(screen.getByText("-0.07%")).toBeInTheDocument();
    expect(screen.getByText("+0.94%")).toBeInTheDocument();
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
      expect(useTokenMarketHistory).toHaveBeenCalled();
    });
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
});
