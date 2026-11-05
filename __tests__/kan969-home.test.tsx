/// <reference types="jest" />

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { PortfolioSummary } from "../app/lib/portfolio/types";
import {
  bucketSubtitle,
  formatPortfolioUsd,
  isPortfolioEmpty,
} from "../app/lib/portfolio/display";
import {
  isWalletHomeActionVisible,
  shouldShowEarnExploreCard,
  shouldShowStocksBucketRow,
  shouldShowStocksExploreCard,
} from "../app/lib/portfolio/home-visibility";
import { getFeatureFlags } from "../app/lib/flags";
import { isReferralEnabled, copyToClipboard } from "../app/utils";
import {
  ExploreCards,
  WalletHomeContent,
} from "../app/(wallet)/components/home/WalletHomeContent";

jest.mock("../app/utils", () => {
  const actual = jest.requireActual("../app/utils");
  return {
    ...actual,
    isReferralEnabled: jest.fn(() => true),
    copyToClipboard: jest.fn(() => Promise.resolve(true)),
  };
});

jest.mock("../app/lib/flags", () => ({
  getFeatureFlags: jest.fn(),
}));

jest.mock("../app/hooks/usePortfolio", () => ({
  usePortfolio: jest.fn(),
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
  TransferForm: () => null,
}));

jest.mock("@/components/bridge/BridgeForm", () => ({
  BridgeForm: () => null,
}));

jest.mock("@/components/wallet-mobile-modal/ReferralHubView", () => ({
  ReferralHubView: () => null,
}));

jest.mock("@/components/CopyAddressWarningModal", () => ({
  CopyAddressWarningModal: ({
    isOpen,
    onClose,
  }: {
    isOpen: boolean;
    onClose: () => void;
  }) => {
    React.useEffect(() => {
      const preference = localStorage.getItem("hideAddressWarningModal");
      if (preference === "true" && isOpen) {
        onClose();
      }
    }, [isOpen, onClose]);
    return isOpen ? <div data-testid="copy-address-warning-modal" /> : null;
  },
}));

jest.mock("@/hooks/useWalletAddress", () => ({
  useWalletAddress: jest.fn(() => null),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: { alt: string; src?: string | { src: string } }) => {
    const src =
      typeof props.src === "string"
        ? props.src
        : props.src && typeof props.src === "object"
          ? props.src.src
          : undefined;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img alt={props.alt} src={src} />
    );
  },
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const mockedGetFeatureFlags = getFeatureFlags as jest.MockedFunction<
  typeof getFeatureFlags
>;
const { usePortfolio } = jest.requireMock("../app/hooks/usePortfolio");

const emptySummary: PortfolioSummary = {
  success: true,
  totalUsd: "0",
  stale: false,
  asOf: "2026-11-05T12:00:00.000Z",
  buckets: {
    tokens: { totalUsd: "0", stale: false, asOf: "2026-11-05T12:00:00.000Z", holdings: [] },
    earn: { totalUsd: "0", stale: false, asOf: "2026-11-05T12:00:00.000Z", holdings: [] },
    stocks: { totalUsd: "0", stale: false, asOf: "2026-11-05T12:00:00.000Z", holdings: [] },
  },
};

const loadedSummary: PortfolioSummary = {
  success: true,
  totalUsd: "1257.94",
  stale: false,
  asOf: "2026-11-05T12:00:00.000Z",
  buckets: {
    tokens: {
      totalUsd: "1090.56",
      stale: false,
      asOf: "2026-11-05T12:00:00.000Z",
      holdings: [
        {
          id: "t1",
          chain: "Base",
          symbol: "USDC",
          amount: "100",
          usd: "1090.56",
          asOf: "2026-11-05T12:00:00.000Z",
        },
        {
          id: "t2",
          chain: "Base",
          symbol: "ETH",
          amount: "1",
          usd: "0",
          asOf: "2026-11-05T12:00:00.000Z",
        },
      ],
    },
    earn: {
      totalUsd: "129.05",
      stale: false,
      asOf: "2026-11-05T12:00:00.000Z",
      holdings: [
        {
          id: "e1",
          chain: "Starknet",
          symbol: "USDC",
          amount: "120",
          usd: "129.05",
          asOf: "2026-11-05T12:00:00.000Z",
        },
      ],
    },
    stocks: {
      totalUsd: "250.17",
      stale: false,
      asOf: "2026-11-05T12:00:00.000Z",
      holdings: [
        {
          id: "s1",
          chain: "Base",
          symbol: "AAPL",
          amount: "1",
          usd: "250.17",
          asOf: "2026-11-05T12:00:00.000Z",
        },
      ],
    },
  },
};

const mockedIsReferralEnabled = isReferralEnabled as jest.MockedFunction<
  typeof isReferralEnabled
>;
const mockedCopyToClipboard = copyToClipboard as jest.MockedFunction<
  typeof copyToClipboard
>;
const { useWalletAddress } = jest.requireMock("@/hooks/useWalletAddress");

function openReceiveFromHome() {
  fireEvent.click(
    screen.getByRole("button", { name: /More add funds options/i }),
  );
  fireEvent.click(screen.getByRole("button", { name: /^Receive$/i }));
}

beforeEach(() => {
  mockedIsReferralEnabled.mockReturnValue(true);
  mockedCopyToClipboard.mockResolvedValue(true);
  localStorage.clear();
  useWalletAddress.mockReturnValue(null);
  mockedGetFeatureFlags.mockReturnValue({
    stocks: true,
    "noblocks-earn-v2": true,
    "noblocks-swap": true,
    "noblocks-marketplace": false,
    "noblocks-kyb": false,
    "noblocks-tx-protection": false,
  });
});

describe("portfolio display helpers", () => {
  it("formats USD totals for Home header", () => {
    expect(formatPortfolioUsd("1257.94")).toBe("$1,257.94");
    expect(formatPortfolioUsd("0")).toBe("$0.00");
  });

  it("detects empty portfolio", () => {
    expect(isPortfolioEmpty(emptySummary)).toBe(true);
    expect(isPortfolioEmpty(loadedSummary)).toBe(false);
  });

  it("builds bucket subtitles", () => {
    expect(
      bucketSubtitle("tokens", emptySummary.buckets.tokens, "4.4%"),
    ).toBe("No assets yet");
    expect(
      bucketSubtitle("tokens", loadedSummary.buckets.tokens, "4.4%"),
    ).toBe("2 Assets");
  });
});

describe("home visibility flags", () => {
  const allOn = mockedGetFeatureFlags.mock.results[0]?.value ?? {
    stocks: true,
    "noblocks-earn-v2": true,
    "noblocks-swap": true,
    "noblocks-marketplace": false,
    "noblocks-kyb": false,
    "noblocks-tx-protection": false,
  };

  it("hides stocks explore when flag off", () => {
    expect(
      shouldShowStocksExploreCard({ ...allOn, stocks: false }),
    ).toBe(false);
  });

  it("shows stocks row when holdings exist and flag off", () => {
    expect(
      shouldShowStocksBucketRow(
        { ...allOn, stocks: false },
        loadedSummary.buckets.stocks,
      ),
    ).toBe(true);
  });

  it("hides earn explore when earn v2 off", () => {
    expect(
      shouldShowEarnExploreCard({ ...allOn, "noblocks-earn-v2": false }),
    ).toBe(false);
  });

  it("hides swap menu item when swap flag off", () => {
    expect(
      isWalletHomeActionVisible("swap", { ...allOn, "noblocks-swap": false }),
    ).toBe(false);
  });
});

describe("WalletHomeContent", () => {
  it("shows empty state with add funds card and zero rows", () => {
    usePortfolio.mockReturnValue({
      data: emptySummary,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<WalletHomeContent />);
    expect(screen.getByText("$0.00")).toBeInTheDocument();
    expect(screen.getByText("Add funds to get started")).toBeInTheDocument();
    expect(screen.getAllByText("No assets yet")).toHaveLength(3);
  });

  it("shows loaded portfolio total and bucket links", () => {
    usePortfolio.mockReturnValue({
      data: loadedSummary,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<WalletHomeContent />);
    expect(screen.getByText("$1,257.94")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /My tokens/i })).toHaveAttribute(
      "href",
      "/tokens",
    );
    expect(screen.getByText("Add funds")).toBeInTheDocument();
  });

  it("shows skeletons while loading without zero total", () => {
    usePortfolio.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
      refetch: jest.fn(),
    });

    render(<WalletHomeContent />);
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
    expect(document.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("shows inline retry on error without zero total", () => {
    const refetch = jest.fn();
    usePortfolio.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error("fail"),
      refetch,
    });

    render(<WalletHomeContent />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
    expect(
      document.querySelector(".divide-y"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Try again/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it("hides stocks explore card when stocks flag off", async () => {
    mockedGetFeatureFlags.mockReturnValue({
      stocks: false,
      "noblocks-earn-v2": true,
      "noblocks-swap": true,
      "noblocks-marketplace": false,
      "noblocks-kyb": false,
      "noblocks-tx-protection": false,
    });
    usePortfolio.mockReturnValue({
      data: emptySummary,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<WalletHomeContent />);
    expect(screen.queryByText(/Own popular stocks/i)).not.toBeInTheDocument();
  });

  it("renders earn row read-only when earn v2 flag off", () => {
    mockedGetFeatureFlags.mockReturnValue({
      stocks: true,
      "noblocks-earn-v2": false,
      "noblocks-swap": true,
      "noblocks-marketplace": false,
      "noblocks-kyb": false,
      "noblocks-tx-protection": false,
    });
    usePortfolio.mockReturnValue({
      data: loadedSummary,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<WalletHomeContent />);
    const earnRow = screen.getByText("Earn positions").closest("[data-readonly]");
    expect(earnRow).toHaveAttribute("data-readonly", "true");
    expect(screen.queryByText(/Earn up to/i)).not.toBeInTheDocument();
  });

  it("opens receive drawer with deposit address and copy control", () => {
    useWalletAddress.mockReturnValue("0xabc123def456");
    usePortfolio.mockReturnValue({
      data: loadedSummary,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<WalletHomeContent />);
    openReceiveFromHome();

    expect(screen.getByTestId("action-drawer")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Receive" })).toBeInTheDocument();
    expect(screen.getByText("0xabc123def456")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Copy wallet address/i }),
    ).toBeInTheDocument();
  });

  it("shows receive error state when wallet address is missing", () => {
    useWalletAddress.mockReturnValue(null);
    usePortfolio.mockReturnValue({
      data: loadedSummary,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<WalletHomeContent />);
    openReceiveFromHome();

    expect(screen.getByRole("alert")).toHaveTextContent(
      /Wallet address unavailable/i,
    );
    expect(
      screen.queryByRole("button", { name: /Copy wallet address/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps receive drawer visible when address warning is opted out", () => {
    localStorage.setItem("hideAddressWarningModal", "true");
    useWalletAddress.mockReturnValue("0xabc123def456");
    usePortfolio.mockReturnValue({
      data: loadedSummary,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<WalletHomeContent />);
    openReceiveFromHome();

    expect(screen.getByText("0xabc123def456")).toBeInTheDocument();
    expect(
      screen.queryByTestId("copy-address-warning-modal"),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /Copy wallet address/i }),
    );
    expect(screen.getByText("0xabc123def456")).toBeInTheDocument();
    expect(
      screen.queryByTestId("copy-address-warning-modal"),
    ).not.toBeInTheDocument();
  });

  it("does not open address warning after receive closes before copy resolves", async () => {
    let resolveCopy: ((value: boolean) => void) | undefined;
    mockedCopyToClipboard.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveCopy = resolve;
        }),
    );
    useWalletAddress.mockReturnValue("0xabc123def456");
    usePortfolio.mockReturnValue({
      data: loadedSummary,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    render(<WalletHomeContent />);
    openReceiveFromHome();
    fireEvent.click(
      screen.getByRole("button", { name: /Copy wallet address/i }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: /More add funds options/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Buy \(onramp\)/i }));
    expect(screen.getByRole("heading", { name: "Buy" })).toBeInTheDocument();

    resolveCopy?.(true);
    await waitFor(() => {
      expect(
        screen.queryByTestId("copy-address-warning-modal"),
      ).not.toBeInTheDocument();
    });
  });
});

describe("ExploreCards", () => {
  it("uses neutral card shell with top banner art", () => {
    render(<ExploreCards onInviteClick={jest.fn()} />);
    const stocksLink = screen.getByRole("link", {
      name: /Own popular stocks/i,
    });
    expect(stocksLink.className).toMatch(/rounded-\[20px\]/);
    expect(stocksLink.className).toMatch(/h-\[233px\]/);
    expect(stocksLink.className).toMatch(/dark:bg-white\/5|bg-accent-gray/);
    expect(stocksLink.className).toMatch(/focus-visible:ring-lavender-500/);
    expect(
      stocksLink.querySelector('img[src*="explore-stocks-banner"]'),
    ).toBeTruthy();
    expect(screen.getByText(/Earn up to/i).closest("a")?.className).toMatch(
      /rounded-\[20px\]/,
    );
  });
});
