/// <reference types="jest" />

import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { BridgeLeg, BridgeQuote } from "../app/lib/bridge";

// ---------------------------------------------------------------------------
// Mocks. Module-level constants so SwapForm's memo/effect deps stay stable.
// Quotes, execution and status all come from the existing bridge hooks; this
// suite only drives their return values.
// ---------------------------------------------------------------------------

const mockGetAccessToken = jest.fn(async () => "test-access-token");
const mockPrivyValue = {
  ready: true,
  authenticated: true,
  user: null,
  getAccessToken: mockGetAccessToken,
};
const mockWalletsValue = {
  wallets: [
    {
      walletClientType: "privy",
      address: "0x1111111111111111111111111111111111111111",
      switchChain: jest.fn(),
      getEthereumProvider: jest.fn(),
    },
  ],
};
jest.mock("@privy-io/react-auth", () => ({
  usePrivy: () => mockPrivyValue,
  useWallets: () => mockWalletsValue,
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: { alt: string; src?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={props.alt} src={typeof props.src === "string" ? props.src : ""} />
  ),
}));

jest.mock("../app/hooks/useWalletAddress", () => ({
  useWalletAddress: () => "0x1111111111111111111111111111111111111111",
}));

const mockNetworkValue = {
  selectedNetwork: {
    chain: { name: "Base", id: 8453 },
    imageUrl: "/logos/base-logo.svg",
  },
};
jest.mock("../app/context/NetworksContext", () => ({
  useNetwork: () => mockNetworkValue,
}));

const mockStarknetValue = {
  walletId: null,
  publicKey: null,
  address: null,
  deployed: false,
};
jest.mock("../app/context/StarknetContext", () => ({
  useStarknet: () => mockStarknetValue,
}));

const mockBalanceValue = {
  refreshBalance: jest.fn(),
  isLoading: false,
  crossChainBalances: [
    {
      network: { chain: { name: "Base" } },
      balances: {
        total: 578,
        balances: { USDT: 578, USDC: 120 },
        rawBalances: { USDT: 578, USDC: 120 },
      },
    },
  ],
};
const mockTokensValue = {
  allTokens: {
    Base: [
      {
        name: "Tether USD",
        symbol: "USDT",
        decimals: 6,
        address: "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2",
        imageUrl: "/logos/usdt-logo.svg",
      },
      {
        name: "USD Coin",
        symbol: "USDC",
        decimals: 6,
        address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
        imageUrl: "/logos/usdc-logo.svg",
      },
    ],
  },
};
const mockInjectedValue = {
  isInjectedWallet: false,
  injectedAddress: null,
  injectedReady: false,
  injectedProvider: null,
  getInjectedToken: jest.fn(async () => null),
};
jest.mock("../app/context", () => ({
  useBalance: () => mockBalanceValue,
  useTokens: () => mockTokensValue,
  useInjectedWallet: () => mockInjectedValue,
}));

jest.mock("../app/hooks/useEIP7702Account", () => ({
  useDelegationContractAuth: () => ({ signDelegationAuthorization: jest.fn() }),
  get7702AuthorizedImplementationForAddress: jest.fn(),
  useShouldUseEOA: () => true,
}));

// Existing bridge hooks — the only quote/execute/status source Swap uses.
const mockQuoteState: {
  quote: BridgeQuote | null;
  isLoading: boolean;
  isFetched: boolean;
  error: unknown;
  refetch: jest.Mock;
} = { quote: null, isLoading: false, isFetched: false, error: null, refetch: jest.fn() };
const mockStatusState: { result: { status: string; destinationTxHash?: string } | null } = {
  result: null,
};
const mockExecute = jest.fn();
const mockUseBridgeQuote = jest.fn();
const mockUseBridgeStatus = jest.fn();
jest.mock("../app/hooks/bridge", () => ({
  useBridgeQuote: (params: unknown) => {
    mockUseBridgeQuote(params);
    return mockQuoteState;
  },
  useBridgeExecute: () => ({ execute: mockExecute }),
  useBridgeStatus: (params: unknown) => {
    mockUseBridgeStatus(params);
    return mockStatusState;
  },
}));

jest.mock("../app/api/aggregator", () => ({
  saveTransaction: jest.fn(async () => ({ data: { id: "saved-tx-1" } })),
}));

jest.mock("../app/lib/toastMappedError", () => ({
  mapReportAndAct: jest.fn((_err: unknown, opts: { onUserMessage?: (m: string) => void }) =>
    opts.onUserMessage?.("Swap could not be completed"),
  ),
}));

jest.mock("../app/components/AnimatedComponents", () => ({
  __esModule: true,
  AnimatedModal: ({
    isOpen,
    onClose,
    children,
  }: {
    isOpen: boolean;
    onClose?: () => void;
    children: React.ReactNode;
  }) =>
    isOpen ? (
      <div role="dialog" aria-modal="true">
        {/* Stand-in for Escape / scrim dismissal. */}
        <button type="button" data-testid="mock-modal-dismiss" onClick={() => onClose?.()} />
        {children}
      </div>
    ) : null,
  AnimatedComponent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  slideInOut: {},
  slideInDown: {},
  dropdownVariants: {},
  acquireBodyScrollLock: jest.fn(),
  releaseBodyScrollLock: jest.fn(),
}));

// Lightweight picker: same trigger/option contract as BridgePicker, without
// the framer-motion portal.
jest.mock("../app/components/bridge/BridgePicker", () => {
  const React = require("react");
  return {
    __esModule: true,
    BridgePicker: ({
      title,
      items,
      onSelect,
      trigger,
    }: {
      title: string;
      items: Array<{ id: string; label: string }>;
      onSelect: (id: string) => void;
      trigger: (p: { isOpen: boolean; toggle: () => void }) => React.ReactNode;
    }) => {
      const [open, setOpen] = React.useState(false);
      return (
        <div>
          {trigger({ isOpen: open, toggle: () => setOpen((v: boolean) => !v) })}
          {open ? (
            <div role="listbox" aria-label={title}>
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => {
                    onSelect(item.id);
                    setOpen(false);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      );
    },
  };
});

// Entry-point hosts (Home drawer + token-page drawer). ActionDrawer is reduced
// to the props this ticket changes: title, subtitle and the Powered-by footer.
jest.mock("../app/components/drawer", () => ({
  ...jest.requireActual("../app/components/drawer"),
  ActionDrawer: ({
    isOpen,
    title,
    subtitle,
    showPoweredByFooter = true,
    children,
  }: {
    isOpen: boolean;
    title: string;
    subtitle?: string;
    showPoweredByFooter?: boolean;
    children: React.ReactNode;
  }) =>
    isOpen ? (
      <div data-testid="action-drawer">
        <h2>{title}</h2>
        {subtitle ? <p data-testid="action-drawer-subtitle">{subtitle}</p> : null}
        {children}
        {showPoweredByFooter ? <p>Powered by Paycrest</p> : null}
      </div>
    ) : null,
}));

jest.mock("../app/hooks/usePortfolio", () => ({
  usePortfolio: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

jest.mock("../app/components/deposit/DepositDrawer", () => ({
  DepositDrawer: () => null,
}));
jest.mock("../app/components/TransferForm", () => ({
  TransferForm: () => <div data-testid="transfer-form" />,
}));
jest.mock("../app/components/wallet-mobile-modal/ReferralHubView", () => ({
  ReferralHubView: () => null,
}));
jest.mock("../app/components/CopyAddressWarningModal", () => ({
  CopyAddressWarningModal: () => null,
}));

import {
  SwapForm,
  type SwapFormProps,
  SWAP_COPY,
  buildSwapLeg,
  canSubmitSwap,
  formatSwapRateLabel,
  getSwapQuoteDeadline,
  isSwapQuoteExpired,
  noSwapRailAvailable,
  pickFundedSwapNetwork,
  SwapTokenAmountPill,
} from "../app/components/swap/SwapForm";
import { TransferPendingModal } from "../app/components/transfer/TransferPendingModal";
import { TRANSFER_COPY } from "../app/components/transfer/transferConfig";
import { isWalletHomeActionVisible } from "../app/lib/portfolio/home-visibility";
import { getFeatureFlags, isFeatureEnabled } from "../app/lib/flags";
import { WalletHomeContent } from "../app/(wallet)/components/home/WalletHomeContent";
import { TokenActionDrawerHost } from "../app/(wallet)/components/tokens/TokensPageContent";

const { usePortfolio: mockUsePortfolio } = jest.requireMock("../app/hooks/usePortfolio");

const { saveTransaction: mockSaveTransaction } = jest.requireMock("../app/api/aggregator");

const QUOTE: BridgeQuote = {
  kind: "near-deposit",
  depositAddress: "",
  amountOut: "99.5",
  deadline: Date.now() + 60_000,
  timeEstimate: "~15 seconds",
  fee: "0.5",
  raw: {},
};

const HOME_PROPS: Omit<SwapFormProps, "onClose"> = {
  showNetworkPicker: true,
  fromLabel: SWAP_COPY.from,
  toLabel: SWAP_COPY.to,
  ctaLabel: SWAP_COPY.reviewCta,
  confirmBeforeSubmit: true,
  successPresentation: "overlay",
};

const TOKEN_PAGE_PROPS: Omit<SwapFormProps, "onClose"> = {
  preferredTokenSymbol: "USDT",
  showNetworkPicker: false,
  fromLabel: SWAP_COPY.sell,
  toLabel: SWAP_COPY.receive,
  ctaLabel: SWAP_COPY.swapCta,
  confirmBeforeSubmit: false,
  successPresentation: "inline",
  innerHeading: SWAP_COPY.swapCta,
};

function renderSwap(props: Omit<SwapFormProps, "onClose">) {
  const onClose = jest.fn();
  const utils = render(<SwapForm onClose={onClose} {...props} />);
  return { ...utils, onClose };
}

function pick(triggerName: string | RegExp, option: string) {
  fireEvent.click(screen.getAllByRole("button", { name: triggerName })[0]);
  fireEvent.click(screen.getByRole("option", { name: option }));
}

/** Home: pick Base, then the "to" token; From defaults to USDT. */
function fillHome(amount = "100") {
  pick(SWAP_COPY.selectNetwork, "Base");
  pick(SWAP_COPY.selectToken, "USDC");
  fireEvent.change(screen.getByLabelText(`${SWAP_COPY.from} amount`), {
    target: { value: amount },
  });
}

/** Token page: network fixed to the page, From preselected; pick Receive token. */
function fillTokenPage(amount = "100") {
  pick(SWAP_COPY.selectToken, "USDC");
  fireEvent.change(screen.getByLabelText(`${SWAP_COPY.sell} amount`), {
    target: { value: amount },
  });
}

const OLD_ENV = process.env;

beforeEach(() => {
  mockQuoteState.quote = null;
  mockQuoteState.isLoading = false;
  mockQuoteState.isFetched = false;
  mockQuoteState.error = null;
  mockQuoteState.refetch = jest.fn();
  mockUseBridgeStatus.mockClear();
  mockStatusState.result = null;
  mockExecute.mockReset();
  mockUseBridgeQuote.mockClear();
  mockSaveTransaction.mockClear();
  process.env = { ...OLD_ENV };
});

afterAll(() => {
  process.env = OLD_ENV;
});

// ---------------------------------------------------------------------------

describe("KAN-964 feature flag", () => {
  it("defaults noblocks-swap to off and reads NEXT_PUBLIC_FF_NOBLOCKS_SWAP", () => {
    delete process.env.NEXT_PUBLIC_FF_NOBLOCKS_SWAP;
    expect(isFeatureEnabled("noblocks-swap")).toBe(false);
    expect(getFeatureFlags()["noblocks-swap"]).toBe(false);

    process.env.NEXT_PUBLIC_FF_NOBLOCKS_SWAP = "true";
    expect(isFeatureEnabled("noblocks-swap")).toBe(true);
    expect(getFeatureFlags()["noblocks-swap"]).toBe(true);
  });

  it("hides the Swap action when the flag is off and shows it when on", () => {
    delete process.env.NEXT_PUBLIC_FF_NOBLOCKS_SWAP;
    expect(isWalletHomeActionVisible("swap", getFeatureFlags())).toBe(false);
    process.env.NEXT_PUBLIC_FF_NOBLOCKS_SWAP = "true";
    expect(isWalletHomeActionVisible("swap", getFeatureFlags())).toBe(true);
    // Other actions are not gated by the swap flag.
    delete process.env.NEXT_PUBLIC_FF_NOBLOCKS_SWAP;
    expect(isWalletHomeActionVisible("transfer", getFeatureFlags())).toBe(true);
  });
});

describe("swapConfig helpers", () => {
  const allTokens = mockTokensValue.allTokens as unknown as Parameters<typeof buildSwapLeg>[2];

  it("builds a same-network leg from network + symbol", () => {
    const leg = buildSwapLeg("Base", "usdc", allTokens);
    expect(leg).toMatchObject({
      network: "Base",
      token: "USDC",
      decimals: 6,
      tokenAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      amount: "0",
      rawAmount: "0",
    });
    expect(typeof leg?.chainId).toBe("number");
  });

  it("returns null when the network or token is missing or unknown", () => {
    expect(buildSwapLeg(null, "USDC", allTokens)).toBeNull();
    expect(buildSwapLeg("Base", null, allTokens)).toBeNull();
    expect(buildSwapLeg("Base", "DOGE", allTokens)).toBeNull();
    expect(buildSwapLeg("Nowhere", "USDC", allTokens)).toBeNull();
  });

  it("formats the live rate label and rejects unusable inputs", () => {
    expect(formatSwapRateLabel("USDT", "USDC", "100", "99.5")).toBe("1 USDT ~ 0.995 USDC");
    expect(formatSwapRateLabel(undefined, "USDC", "100", "99.5")).toBeNull();
    expect(formatSwapRateLabel("USDT", "USDC", "0", "99.5")).toBeNull();
    expect(formatSwapRateLabel("USDT", "USDC", "", "")).toBeNull();
  });

  it("keeps the Figma fee, eta and pending copy", () => {
    expect(SWAP_COPY.fee).toBe("Fee");
    expect(SWAP_COPY.fees).toBe("Fees");
    expect(SWAP_COPY.etaFallback).toBe("Swap usually completes in 15 sec");
    expect(SWAP_COPY.pendingTitle).toBe("Swapping your tokens...");
    expect(SWAP_COPY.pendingNote).toMatch(/completing your swap/);
  });

  describe("canSubmitSwap", () => {
    const leg = (token: string): BridgeLeg => ({
      network: "Base",
      chainId: 8453,
      token,
      tokenAddress: "0x0",
      decimals: 6,
      amount: "0",
      rawAmount: "0",
    });
    const ok = {
      from: leg("USDT"),
      to: leg("USDC"),
      parsedAmount: 100,
      quote: QUOTE,
      quoteLoading: false,
      quoteError: null,
      isQuoteExpired: false,
      hasInsufficientBalance: false,
    };

    it("allows submit only with a valid, current quote", () => {
      expect(canSubmitSwap(ok)).toBe(true);
    });

    it.each([
      ["no from leg", { from: null }],
      ["no to leg", { to: null }],
      ["zero amount", { parsedAmount: 0 }],
      ["NaN amount", { parsedAmount: Number.NaN }],
      ["insufficient balance", { hasInsufficientBalance: true }],
      ["quote expired", { isQuoteExpired: true }],
      ["no quote", { quote: null }],
      ["quote loading", { quoteLoading: true }],
      ["quote error", { quoteError: new Error("boom") }],
    ])("blocks submit when %s", (_label, patch) => {
      expect(canSubmitSwap({ ...ok, ...patch })).toBe(false);
    });
  });

  it("flags no route only after a quote attempt returned nothing", () => {
    const base = {
      from: buildSwapLeg("Base", "USDT", allTokens),
      to: buildSwapLeg("Base", "USDC", allTokens),
      parsedAmount: 10,
      quote: null,
      quoteFetched: true,
      quoteLoading: false,
      quoteError: null,
      hasInsufficientBalance: false,
    };
    expect(noSwapRailAvailable(base)).toBe(true);
    expect(noSwapRailAvailable({ ...base, quoteFetched: false })).toBe(false);
    expect(noSwapRailAvailable({ ...base, quoteLoading: true })).toBe(false);
    expect(noSwapRailAvailable({ ...base, quote: QUOTE })).toBe(false);
  });
});

describe("SwapForm — Home chrome", () => {
  it("renders the network picker, From/to labels and a disabled Review swap CTA", () => {
    renderSwap(HOME_PROPS);
    expect(screen.getByTestId("swap-network-card")).toBeInTheDocument();
    expect(screen.getByText(SWAP_COPY.from)).toBeInTheDocument();
    expect(screen.getByText(SWAP_COPY.to)).toBeInTheDocument();
    const cta = screen.getByTestId("swap-submit-cta");
    expect(cta).toHaveTextContent(SWAP_COPY.reviewCta);
    expect(cta).toBeDisabled();
    expect(screen.queryByText(/Powered by/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Recipient/i)).not.toBeInTheDocument();
  });

  it("asks the existing bridge quote hook for a same-network quote", () => {
    mockQuoteState.quote = QUOTE;
    mockQuoteState.isFetched = true;
    renderSwap(HOME_PROPS);
    fillHome();
    const last = mockUseBridgeQuote.mock.calls.at(-1)?.[0] as {
      from: BridgeLeg;
      to: BridgeLeg;
      amount: string;
    };
    expect(last.from).toMatchObject({ network: "Base", token: "USDT" });
    expect(last.to).toMatchObject({ network: "Base", token: "USDC" });
    expect(last.amount).toBe("100");
  });

  it("shows the quote card and enables Review swap once a quote is back", () => {
    mockQuoteState.quote = QUOTE;
    mockQuoteState.isFetched = true;
    renderSwap(HOME_PROPS);
    fillHome();
    const card = screen.getByTestId("swap-quote-card");
    expect(within(card).getByText(SWAP_COPY.exchangeRate)).toBeInTheDocument();
    expect(within(card).getByText("1 USDT ~ 0.995 USDC")).toBeInTheDocument();
    expect(within(card).getByText("0.5 USDC")).toBeInTheDocument();
    expect(screen.getByTestId("swap-submit-cta")).toBeEnabled();
    // footer: live rate + eta
    expect(screen.getByText(SWAP_COPY.etaFallback)).toBeInTheDocument();
  });

  it("shows the flip icon, not a spinner, when no quote is loading", () => {
    renderSwap(HOME_PROPS);
    const flip = screen.getByRole("button", { name: "Flip from and to tokens" });
    expect(flip).toBeEnabled();
    expect(flip).toHaveAttribute("aria-busy", "false");
    expect(flip.querySelector("svg")).not.toHaveClass("animate-spin");
    expect(screen.queryByRole("button", { name: "Loading quote" })).not.toBeInTheDocument();
  });

  it("turns the flip control into a disabled spinner while the quote loads", () => {
    mockQuoteState.isLoading = true;
    renderSwap(HOME_PROPS);
    fillHome();
    const flip = screen.getByRole("button", { name: "Loading quote" });
    expect(flip).toBeDisabled();
    expect(flip).toHaveAttribute("aria-busy", "true");
    expect(flip.querySelector("svg")).toHaveClass("animate-spin");
    expect(screen.queryByTestId("swap-quote-card")).not.toBeInTheDocument();
    expect(screen.getByTestId("swap-submit-cta")).toBeDisabled();
  });

  it("flips From and to tokens when not loading", () => {
    renderSwap(HOME_PROPS);
    pick(SWAP_COPY.selectNetwork, "Base");
    pick(SWAP_COPY.selectToken, "USDC");
    fireEvent.click(screen.getByRole("button", { name: "Flip from and to tokens" }));
    const fromCard = screen.getByTestId("swap-from-card");
    const toCard = screen.getByTestId("swap-to-card");
    expect(within(fromCard).getByRole("button", { name: "USDC token" })).toBeInTheDocument();
    expect(within(toCard).getByRole("button", { name: "USDT token" })).toBeInTheDocument();
  });

  it("keeps the CTA disabled on insufficient balance", () => {
    mockQuoteState.quote = QUOTE;
    renderSwap(HOME_PROPS);
    fillHome("5000");
    expect(screen.getByText("Insufficient balance")).toBeInTheDocument();
    expect(screen.getByTestId("swap-submit-cta")).toBeDisabled();
  });

  it("opens the Review swap modal before executing", () => {
    mockQuoteState.quote = QUOTE;
    renderSwap(HOME_PROPS);
    fillHome();
    fireEvent.click(screen.getByTestId("swap-submit-cta"));
    const review = screen.getByTestId("swap-review-content");
    expect(within(review).getByText(SWAP_COPY.reviewTitle)).toBeInTheDocument();
    expect(within(review).getByText(SWAP_COPY.warning)).toBeInTheDocument();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("shows the Swap pending modal as soon as confirm starts, then the success modal", async () => {
    mockQuoteState.quote = QUOTE;
    let resolveExecute: (v: { txHash: string; depositRefId: string }) => void = () => {};
    mockExecute.mockImplementation(
      () =>
        new Promise((res) => {
          resolveExecute = res;
        }),
    );
    const { rerender, onClose } = renderSwap(HOME_PROPS);
    fillHome();
    fireEvent.click(screen.getByTestId("swap-submit-cta"));
    fireEvent.click(screen.getByTestId("swap-review-confirm"));

    // Pending is the shared TransferPendingModal with Swap copy, not a spinner.
    const pending = await screen.findByTestId("swap-pending-content");
    expect(within(pending).getByText(SWAP_COPY.pendingTitle)).toBeInTheDocument();
    expect(within(pending).getByText(SWAP_COPY.pendingNote)).toBeInTheDocument();
    expect(within(pending).getByText("99.5 USDC")).toBeInTheDocument();
    expect(screen.queryByText(TRANSFER_COPY.pendingTitle)).not.toBeInTheDocument();
    expect(mockExecute).toHaveBeenCalledTimes(1);
    const [quoteArg, fromArg] = mockExecute.mock.calls[0];
    expect(quoteArg).toBe(QUOTE);
    expect(fromArg).toMatchObject({ token: "USDT", amount: "100", rawAmount: "100000000" });

    await act(async () => {
      resolveExecute({ txHash: "0xabc", depositRefId: "ref-1" });
    });
    expect(mockSaveTransaction).toHaveBeenCalled();
    expect(screen.getByTestId("swap-pending-content")).toBeInTheDocument();

    mockStatusState.result = { status: "SUCCESS", destinationTxHash: "0xdef" };
    rerender(<SwapForm onClose={onClose} {...HOME_PROPS} />);
    const success = await screen.findByTestId("swap-success-content");
    expect(within(success).getByText(SWAP_COPY.successTitle)).toBeInTheDocument();
    expect(within(success).getByText(SWAP_COPY.completed)).toBeInTheDocument();
    expect(screen.queryByTestId("swap-pending-content")).not.toBeInTheDocument();
    // Home success is a centered modal over the still-mounted form.
    expect(screen.getByTestId("swap-form-body")).toBeInTheDocument();
    fireEvent.click(within(success).getByRole("button", { name: SWAP_COPY.close }));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows Swap failed when execution throws", async () => {
    mockQuoteState.quote = QUOTE;
    mockExecute.mockRejectedValue(new Error("user rejected"));
    renderSwap(HOME_PROPS);
    fillHome();
    fireEvent.click(screen.getByTestId("swap-submit-cta"));
    fireEvent.click(screen.getByTestId("swap-review-confirm"));
    const failed = await screen.findByTestId("swap-failed-content");
    expect(within(failed).getByText(SWAP_COPY.failedTitle)).toBeInTheDocument();
    expect(within(failed).getByRole("button", { name: SWAP_COPY.tryAgain })).toBeInTheDocument();
  });
});

describe("SwapForm — token-page chrome", () => {
  it("has no network picker, uses Sell/Receive labels, the inner Swap heading and a Swap CTA", () => {
    renderSwap(TOKEN_PAGE_PROPS);
    expect(screen.queryByTestId("swap-network-card")).not.toBeInTheDocument();
    expect(screen.getByText(SWAP_COPY.sell)).toBeInTheDocument();
    expect(screen.getByText(SWAP_COPY.receive)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: SWAP_COPY.swapCta })).toBeInTheDocument();
    expect(screen.getByTestId("swap-submit-cta")).toHaveTextContent(/^Swap$/);
    // From is preselected to the page's token on the page's network.
    expect(
      within(screen.getByTestId("swap-from-card")).getByRole("button", { name: "USDT token" }),
    ).toBeInTheDocument();
  });

  it("executes directly on Swap (no review), then shows the inline Swap Complete receipt", async () => {
    mockQuoteState.quote = QUOTE;
    let resolveExecute: (v: { txHash: string; depositRefId: string }) => void = () => {};
    mockExecute.mockImplementation(
      () =>
        new Promise((res) => {
          resolveExecute = res;
        }),
    );
    const { rerender, onClose } = renderSwap(TOKEN_PAGE_PROPS);
    fillTokenPage();
    fireEvent.click(screen.getByTestId("swap-submit-cta"));
    expect(screen.queryByTestId("swap-review-content")).not.toBeInTheDocument();
    expect(await screen.findByTestId("swap-pending-content")).toBeInTheDocument();
    expect(mockExecute).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveExecute({ txHash: "0xabc", depositRefId: "ref-1" });
    });
    mockStatusState.result = { status: "SUCCESS" };
    rerender(<SwapForm onClose={onClose} {...TOKEN_PAGE_PROPS} />);

    const success = await screen.findByTestId("swap-success-content");
    expect(within(success).getByText(SWAP_COPY.completeTitle)).toBeInTheDocument();
    expect(within(success).getByText(SWAP_COPY.transactionFee)).toBeInTheDocument();
    // Inline: the receipt replaces the form inside the drawer, no modal.
    expect(screen.queryByTestId("swap-form-body")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(within(success).getByRole("button", { name: SWAP_COPY.done }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("TransferPendingModal optional Swap props", () => {
  it("keeps Transfer copy by default", () => {
    render(
      <TransferPendingModal
        isOpen
        onClose={jest.fn()}
        amountLabel="100"
        tokenSymbol="USDC"
        shortAddress="0x7a3f…91f4"
        elapsedSeconds={3}
      />,
    );
    expect(screen.getByText(TRANSFER_COPY.pendingTitle)).toBeInTheDocument();
    expect(screen.getByText(TRANSFER_COPY.pendingNote)).toBeInTheDocument();
  });

  it("renders Swap title, note, destination icon and test id when passed", () => {
    render(
      <TransferPendingModal
        isOpen
        onClose={jest.fn()}
        amountLabel="100"
        tokenSymbol="USDT"
        shortAddress="99.5 USDC"
        destinationImageUrl="/logos/usdc-logo.svg"
        elapsedSeconds={3}
        title={SWAP_COPY.pendingTitle}
        note={SWAP_COPY.pendingNote}
        testId="swap-pending-content"
      />,
    );
    const root = screen.getByTestId("swap-pending-content");
    expect(within(root).getByText(SWAP_COPY.pendingTitle)).toBeInTheDocument();
    expect(within(root).getByText(SWAP_COPY.pendingNote)).toBeInTheDocument();
    expect(root.querySelector('img[src="/logos/usdc-logo.svg"]')).toBeTruthy();
  });
});

describe("Swap entry points", () => {
  const ASOF = "2026-11-12T12:00:00.000Z";
  const loadedSummary = {
    success: true,
    totalUsd: "578",
    stale: false,
    asOf: ASOF,
    buckets: {
      tokens: {
        totalUsd: "578",
        stale: false,
        asOf: ASOF,
        holdings: [
          { id: "t1", chain: "Base", symbol: "USDT", amount: "578", usd: "578", asOf: ASOF },
        ],
      },
      earn: { totalUsd: "0", stale: false, asOf: ASOF, holdings: [] },
      stocks: { totalUsd: "0", stale: false, asOf: ASOF, holdings: [] },
    },
  };

  beforeEach(() => {
    mockUsePortfolio.mockReturnValue({
      data: loadedSummary,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  function openHomeMenu() {
    render(<WalletHomeContent />);
    fireEvent.click(screen.getByRole("button", { name: /More add funds options/i }));
  }

  it("hides Swap in the Home add-funds menu when the flag is off", () => {
    delete process.env.NEXT_PUBLIC_FF_NOBLOCKS_SWAP;
    openHomeMenu();
    expect(screen.getByRole("button", { name: /^Receive$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Swap$/i })).not.toBeInTheDocument();
  });

  it("opens the Home Swap drawer with subtitle, Home chrome and no Powered-by footer", () => {
    process.env.NEXT_PUBLIC_FF_NOBLOCKS_SWAP = "true";
    openHomeMenu();
    fireEvent.click(screen.getByRole("button", { name: /^Swap$/i }));
    const drawer = screen.getByTestId("action-drawer");
    expect(within(drawer).getByRole("heading", { name: "Swap" })).toBeInTheDocument();
    expect(within(drawer).getByTestId("action-drawer-subtitle")).toHaveTextContent(
      SWAP_COPY.subtitle,
    );
    expect(within(drawer).getByTestId("swap-network-card")).toBeInTheDocument();
    expect(within(drawer).getByTestId("swap-submit-cta")).toHaveTextContent(SWAP_COPY.reviewCta);
    expect(within(drawer).queryByText(/Powered by/i)).not.toBeInTheDocument();
  });

  it("keeps the Powered-by footer on other Home drawers", () => {
    openHomeMenu();
    fireEvent.click(screen.getByRole("button", { name: /^Receive$/i }));
    expect(within(screen.getByTestId("action-drawer")).getByText(/Powered by/i)).toBeInTheDocument();
  });

  it("titles the token-page drawer 'Swap {symbol}' with token chrome and no Powered-by footer", () => {
    render(
      <TokenActionDrawerHost
        activeAction="swap"
        preferredTokenSymbol="USDT"
        onClose={jest.fn()}
        onBridgeSubmit={jest.fn()}
      />,
    );
    const drawer = screen.getByTestId("action-drawer");
    expect(within(drawer).getByRole("heading", { name: "Swap USDT" })).toBeInTheDocument();
    expect(within(drawer).queryByTestId("action-drawer-subtitle")).not.toBeInTheDocument();
    expect(within(drawer).queryByTestId("swap-network-card")).not.toBeInTheDocument();
    expect(within(drawer).getByText(SWAP_COPY.sell)).toBeInTheDocument();
    expect(within(drawer).getByTestId("swap-submit-cta")).toHaveTextContent(/^Swap$/);
    expect(within(drawer).queryByText(/Powered by/i)).not.toBeInTheDocument();
  });

  it("keeps the token-page Powered-by footer for Receive", () => {
    render(
      <TokenActionDrawerHost
        activeAction="receive"
        preferredTokenSymbol="USDT"
        onClose={jest.fn()}
        onBridgeSubmit={jest.fn()}
      />,
    );
    expect(within(screen.getByTestId("action-drawer")).getByText(/Powered by/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// CodeRabbit review follow-ups
// ---------------------------------------------------------------------------

describe("quote deadline helpers", () => {
  it("reads NEAR deadline and HyperFX expiresAt, and nothing for LI.FI", () => {
    expect(getSwapQuoteDeadline({ ...QUOTE, deadline: 1234 } as BridgeQuote)).toBe(1234);
    expect(
      getSwapQuoteDeadline({ kind: "hyperfx-intent", expiresAt: 5678 } as unknown as BridgeQuote),
    ).toBe(5678);
    expect(getSwapQuoteDeadline({ kind: "lifi-tx" } as unknown as BridgeQuote)).toBeNull();
    expect(getSwapQuoteDeadline(null)).toBeNull();
    expect(isSwapQuoteExpired({ ...QUOTE, deadline: 1000 } as BridgeQuote, 1000)).toBe(true);
    expect(isSwapQuoteExpired({ ...QUOTE, deadline: 1001 } as BridgeQuote, 1000)).toBe(false);
  });
});

describe("SwapForm — quote expiry", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("disables the CTA once the active quote's deadline passes", () => {
    jest.useFakeTimers();
    mockQuoteState.quote = { ...QUOTE, deadline: Date.now() + 5_000 } as BridgeQuote;
    renderSwap(TOKEN_PAGE_PROPS);
    fillTokenPage();
    expect(screen.getByTestId("swap-submit-cta")).toBeEnabled();
    act(() => {
      jest.advanceTimersByTime(5_001);
    });
    expect(screen.getByTestId("swap-submit-cta")).toBeDisabled();
    // No countdown UI is rendered for expiry.
    expect(screen.queryByText(/expires in/i)).not.toBeInTheDocument();
  });

  it("re-validates the deadline on Review confirm and refuses an expired quote", () => {
    jest.useFakeTimers();
    mockQuoteState.quote = { ...QUOTE, deadline: Date.now() + 5_000 } as BridgeQuote;
    renderSwap(HOME_PROPS);
    fillHome();
    fireEvent.click(screen.getByTestId("swap-submit-cta"));
    expect(screen.getByTestId("swap-review-content")).toBeInTheDocument();
    // Clock passes the deadline before the expiry timer has fired.
    jest.setSystemTime(Date.now() + 10_000);
    fireEvent.click(screen.getByTestId("swap-review-confirm"));
    expect(mockExecute).not.toHaveBeenCalled();
    expect(screen.queryByTestId("swap-review-content")).not.toBeInTheDocument();
    expect(screen.getByTestId("swap-form-notice")).toHaveTextContent(SWAP_COPY.quoteExpired);
    expect(screen.getByTestId("swap-submit-cta")).toBeDisabled();
    fireEvent.click(
      within(screen.getByTestId("swap-form-notice")).getByRole("button", { name: SWAP_COPY.retry }),
    );
    expect(mockQuoteState.refetch).toHaveBeenCalled();
  });
});

describe("SwapForm — Review confirm eligibility", () => {
  it("returns to the form instead of executing when the balance no longer covers the amount", () => {
    mockQuoteState.quote = QUOTE;
    const original = mockBalanceValue.crossChainBalances;
    const { rerender, onClose } = renderSwap(HOME_PROPS);
    fillHome();
    fireEvent.click(screen.getByTestId("swap-submit-cta"));
    expect(screen.getByTestId("swap-review-content")).toBeInTheDocument();
    try {
      mockBalanceValue.crossChainBalances = [
        {
          network: { chain: { name: "Base" } },
          balances: { total: 10, balances: { USDT: 10, USDC: 0 }, rawBalances: { USDT: 10, USDC: 0 } },
        },
      ];
      rerender(<SwapForm onClose={onClose} {...HOME_PROPS} />);
      fireEvent.click(screen.getByTestId("swap-review-confirm"));
      expect(mockExecute).not.toHaveBeenCalled();
      expect(screen.queryByTestId("swap-review-content")).not.toBeInTheDocument();
      expect(screen.getByText("Insufficient balance")).toBeInTheDocument();
    } finally {
      mockBalanceValue.crossChainBalances = original;
    }
  });
});

describe("SwapForm — execution attempts", () => {
  it("blocks a second execute() while the first is still waiting, even after dismissing pending", async () => {
    mockQuoteState.quote = QUOTE;
    let resolveExecute: (v: { txHash: string; depositRefId: string }) => void = () => {};
    mockExecute.mockImplementation(
      () =>
        new Promise((res) => {
          resolveExecute = res;
        }),
    );
    renderSwap(TOKEN_PAGE_PROPS);
    fillTokenPage();
    fireEvent.click(screen.getByTestId("swap-submit-cta"));
    await screen.findByTestId("swap-pending-content");
    // Escape / scrim on the pending modal → resetToForm().
    fireEvent.click(screen.getByTestId("mock-modal-dismiss"));
    expect(screen.queryByTestId("swap-pending-content")).not.toBeInTheDocument();
    const cta = screen.getByTestId("swap-submit-cta");
    expect(cta).toBeDisabled();
    expect(cta).toHaveAttribute("aria-busy", "true");
    fireEvent.click(cta);
    expect(mockExecute).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveExecute({ txHash: "0xabc", depositRefId: "ref-1" });
    });
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("releases the guard when execute() rejects", async () => {
    mockQuoteState.quote = QUOTE;
    mockExecute.mockRejectedValueOnce(new Error("user rejected"));
    renderSwap(TOKEN_PAGE_PROPS);
    fillTokenPage();
    fireEvent.click(screen.getByTestId("swap-submit-cta"));
    const failed = await screen.findByTestId("swap-failed-content");
    fireEvent.click(within(failed).getByRole("button", { name: SWAP_COPY.tryAgain }));
    mockExecute.mockImplementation(() => new Promise(() => {}));
    fireEvent.click(screen.getByTestId("swap-submit-cta"));
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it("does not show a previous attempt's result while the next attempt is pending", async () => {
    mockQuoteState.quote = QUOTE;
    mockExecute.mockResolvedValueOnce({ txHash: "0xaaa", depositRefId: "ref-A" });
    const { rerender, onClose } = renderSwap(TOKEN_PAGE_PROPS);
    fillTokenPage();
    fireEvent.click(screen.getByTestId("swap-submit-cta"));
    await waitFor(() =>
      expect(mockUseBridgeStatus).toHaveBeenLastCalledWith(
        expect.objectContaining({ refId: "ref-A", enabled: true }),
      ),
    );
    // Dismiss A's pending modal while it is still processing.
    fireEvent.click(screen.getByTestId("mock-modal-dismiss"));
    // A's poll later reports SUCCESS…
    mockStatusState.result = { status: "SUCCESS" };
    // …while attempt B is waiting on its wallet signature.
    mockExecute.mockImplementation(() => new Promise(() => {}));
    rerender(<SwapForm onClose={onClose} {...TOKEN_PAGE_PROPS} />);
    fireEvent.click(screen.getByTestId("swap-submit-cta"));
    expect(mockExecute).toHaveBeenCalledTimes(2);
    expect(await screen.findByTestId("swap-pending-content")).toBeInTheDocument();
    expect(screen.queryByTestId("swap-success-content")).not.toBeInTheDocument();
    expect(mockUseBridgeStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({ refId: null, enabled: false }),
    );
  });
});

describe("SwapForm — quote card copy and errors", () => {
  it("labels the quote output as an estimate, not a minimum", () => {
    mockQuoteState.quote = QUOTE;
    mockQuoteState.isFetched = true;
    renderSwap(HOME_PROPS);
    fillHome();
    const card = screen.getByTestId("swap-quote-card");
    expect(within(card).getByText("Estimated receive")).toBeInTheDocument();
    expect(within(card).queryByText(/Receive at least/i)).not.toBeInTheDocument();
  });

  it("explains a quote error and retries through the quote hook", () => {
    mockQuoteState.error = new Error("quote failed");
    mockQuoteState.isFetched = true;
    renderSwap(HOME_PROPS);
    fillHome();
    expect(screen.getByTestId("swap-submit-cta")).toBeDisabled();
    expect(screen.queryByTestId("swap-quote-card")).not.toBeInTheDocument();
    expect(screen.queryByText(SWAP_COPY.noRail)).not.toBeInTheDocument();
    const note = screen.getByTestId("swap-quote-error");
    expect(note).toHaveTextContent(SWAP_COPY.quoteError);
    fireEvent.click(within(note).getByRole("button", { name: SWAP_COPY.retry }));
    expect(mockQuoteState.refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the no-route message for an empty quote result", () => {
    mockQuoteState.isFetched = true;
    renderSwap(HOME_PROPS);
    fillHome();
    expect(screen.getByText(SWAP_COPY.noRail)).toBeInTheDocument();
    expect(screen.queryByTestId("swap-quote-error")).not.toBeInTheDocument();
  });
});

describe("SwapTokenAmountPill a11y", () => {
  it("exposes the token symbol to assistive tech without changing the visible amount", () => {
    const { container } = render(<SwapTokenAmountPill symbol="USDC" amount="99.5" />);
    expect(screen.getByText("99.5")).toBeInTheDocument();
    const hidden = screen.getByText("USDC");
    expect(hidden).toHaveClass("sr-only");
    expect(container.textContent).toBe("99.5USDC");
  });
});

describe("token-page Swap network default", () => {
  const allTokens = {
    ...mockTokensValue.allTokens,
    "Arbitrum One": [
      {
        name: "Tether USD",
        symbol: "USDT",
        decimals: 6,
        address: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
        imageUrl: "/logos/usdt-logo.svg",
      },
    ],
  } as unknown as Parameters<typeof pickFundedSwapNetwork>[2];
  const bal = (name: string, usdt: number) => ({
    network: { chain: { name } },
    balances: { balances: { USDT: usdt }, rawBalances: { USDT: usdt } },
  });

  it("picks the funded network, the largest when spread, and keeps the current on ties", () => {
    expect(pickFundedSwapNetwork("USDT", [bal("Base", 0), bal("Arbitrum One", 50)], allTokens, "Base")).toBe(
      "Arbitrum One",
    );
    expect(pickFundedSwapNetwork("USDT", [bal("Base", 10), bal("Arbitrum One", 50)], allTokens, "Base")).toBe(
      "Arbitrum One",
    );
    expect(pickFundedSwapNetwork("USDT", [bal("Arbitrum One", 50), bal("Base", 50)], allTokens, "Base")).toBe(
      "Base",
    );
    expect(pickFundedSwapNetwork("USDT", [bal("Base", 0)], allTokens, "Base")).toBeNull();
    expect(pickFundedSwapNetwork("DOGE", [bal("Base", 10)], allTokens, "Base")).toBeNull();
  });

  it("opens the token-page Swap on the network that actually holds the token", () => {
    const originalBalances = mockBalanceValue.crossChainBalances;
    const originalTokens = mockTokensValue.allTokens;
    try {
      mockBalanceValue.crossChainBalances = [
        {
          network: { chain: { name: "Base" } },
          balances: { total: 0, balances: { USDT: 0, USDC: 0 }, rawBalances: { USDT: 0, USDC: 0 } },
        },
        {
          network: { chain: { name: "Arbitrum One" } },
          balances: { total: 900, balances: { USDT: 900 }, rawBalances: { USDT: 900 } },
        } as unknown as (typeof originalBalances)[number],
      ];
      mockTokensValue.allTokens = {
        ...originalTokens,
        "Arbitrum One": [
          ...((allTokens as Record<string, unknown[]>)["Arbitrum One"] as typeof originalTokens.Base),
          { ...originalTokens.Base[1], address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831" },
        ],
      } as typeof originalTokens;
      renderSwap(TOKEN_PAGE_PROPS);
      expect(screen.queryByTestId("swap-network-card")).not.toBeInTheDocument();
      expect(within(screen.getByTestId("swap-from-card")).getByText(/900 USDT/)).toBeInTheDocument();
      fillTokenPage();
      const last = mockUseBridgeQuote.mock.calls.at(-1)?.[0] as { from: BridgeLeg; to: BridgeLeg };
      expect(last.from).toMatchObject({ network: "Arbitrum One", token: "USDT" });
      expect(last.to).toMatchObject({ network: "Arbitrum One", token: "USDC" });
    } finally {
      mockBalanceValue.crossChainBalances = originalBalances;
      mockTokensValue.allTokens = originalTokens;
    }
  });
});
