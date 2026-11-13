/// <reference types="jest" />

import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useForm } from "react-hook-form";

// ---------------------------------------------------------------------------
// All `jest.mock` calls are hoisted to the top of the file by babel-jest and
// are registered once per resolved module path for the WHOLE file (not per
// `describe` block) — so every mock below has to serve every test case that
// transitively imports that module.
// ---------------------------------------------------------------------------

jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    custom: jest.fn(),
  },
}));

jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: { alt: string; src?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={props.alt} src={typeof props.src === "string" ? props.src : ""} />
  ),
}));

jest.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

const mockPrivyValue = {
  ready: true,
  authenticated: true,
  user: null as unknown,
  getAccessToken: jest.fn(async () => "test-access-token"),
};
jest.mock("@privy-io/react-auth", () => ({
  usePrivy: () => mockPrivyValue,
}));

jest.mock("../app/hooks/useWalletAddress", () => ({
  useWalletAddress: () => "0xabc123def456",
}));

jest.mock("../app/hooks/usePortfolio", () => ({
  usePortfolio: () => ({
    data: {
      totalUsd: "100",
      buckets: {
        tokens: { totalUsd: "100", holdings: [] },
        earn: { totalUsd: "0", holdings: [] },
        stocks: { totalUsd: "0", holdings: [] },
      },
    },
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
}));

jest.mock("../app/hooks/useBridgeStatusTracker", () => ({
  useBridgeStatusTracker: () => ({ trackBridge: jest.fn() }),
}));

// Real `ActionDrawer` drives framer-motion spring animations that never
// settle under jsdom's rAF polyfill without fake timers (OOMs the test
// process) — stub just that, keep every other drawer-kit export (used for
// real by MakePayment/TransactionPreview below) untouched.
jest.mock("../app/components/drawer", () => {
  const actual = jest.requireActual("../app/components/drawer");
  return {
    ...actual,
    ActionDrawer: ({
      isOpen,
      title,
      children,
    }: {
      isOpen: boolean;
      title: string;
      children: ReactNode;
    }) =>
      isOpen ? (
        <div role="dialog" aria-label={title}>
          <h2>{title}</h2>
          {children}
        </div>
      ) : null,
  };
});

jest.mock("../app/components/ramp/RampDrawerFlow", () => ({
  RampDrawerFlow: ({ mode }: { mode: "onramp" | "offramp" }) => (
    <div data-testid={`ramp-drawer-flow-${mode}`}>
      empty {mode === "onramp" ? "Buy" : "Sell"} form
    </div>
  ),
}));

jest.mock("../app/components/swap/SwapForm", () => ({
  SwapForm: () => null,
  SWAP_COPY: {
    from: "You sell",
    to: "You receive",
    reviewCta: "Review swap",
    subtitle: "",
    sell: "You sell",
    receive: "You receive",
    swapCta: "Swap",
  },
}));

jest.mock("../app/components/TransferForm", () => ({
  TransferForm: () => null,
}));

jest.mock("../app/components/deposit/DepositDrawer", () => ({
  DepositDrawer: () => null,
}));

jest.mock("../app/components/wallet-mobile-modal/ReferralHubView", () => ({
  ReferralHubView: () => null,
}));

jest.mock("../app/components/CopyAddressWarningModal", () => ({
  CopyAddressWarningModal: () => null,
}));

// A stable function reference matters here, not just a stable return value:
// `resolveAuth` is a dependency of a `useEffect` in MakePayment/TransactionPreview,
// so a fresh `jest.fn()` on every `useApiAuth()` call re-fires that effect on
// every render it triggers — an infinite effect -> setState -> render loop
// that hangs the test process (reproduced while writing this suite).
const mockResolveAuth = jest.fn(async () => ({
  accessToken: "test-token",
  injectedToken: null,
}));
jest.mock("../app/hooks/useApiAuth", () => ({
  useApiAuth: () => ({ resolveAuth: mockResolveAuth }),
}));

const mockFetchAccountName = jest.fn();
jest.mock("../app/api/aggregator", () => ({
  fetchV2SenderPaymentOrderById: jest.fn(async () => ({
    status: "success",
    data: { status: "pending" },
  })),
  isOnrampUnderReview: () => false,
  resolveOnrampOrderStatusFromV2Response: () => undefined,
  fetchAccountName: (...args: unknown[]) => mockFetchAccountName(...args),
  fetchSavedRecipients: jest.fn(async () => []),
  deleteSavedRecipient: jest.fn(),
}));

// Stable objects/fns across renders — same reason as `mockResolveAuth` above:
// an unstable `useNetwork()`/`useStep()` return value re-fires any effect
// that depends on it (e.g. RecipientDetailsForm's currency-change effect),
// looping forever.
const mockStepValue = {
  currentStep: "make_payment" as const,
  setCurrentStep: jest.fn(),
  isFormStep: false,
  isOnrampProviderDetailsOpen: false,
  setIsOnrampProviderDetailsOpen: jest.fn(),
};
const mockNetworkValue = {
  selectedNetwork: {
    chain: { name: "Base" },
    imageUrl: "/logos/base-logo.svg",
  },
};
jest.mock("../app/context", () => ({
  useStep: () => mockStepValue,
  useNetwork: () => mockNetworkValue,
}));

jest.mock("../app/hooks/useActualTheme", () => ({
  useActualTheme: () => false,
}));

// ===========================================================================
// 1. Entry points: Home and Tokens open the Buy/Sell drawer (KAN-971)
// ===========================================================================
describe("Buy/Sell drawer entry points", () => {
  it("opens the Buy drawer with title 'Buy' and the empty onramp form from Home", async () => {
    const { WalletHomeContent } = await import(
      "../app/(wallet)/components/home/WalletHomeContent"
    );
    render(<WalletHomeContent />);

    fireEvent.click(
      screen.getByRole("button", { name: /More add funds options/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Buy \(onramp\)/i }));

    expect(screen.getByRole("heading", { name: "Buy" })).toBeInTheDocument();
    expect(screen.getByTestId("ramp-drawer-flow-onramp")).toBeInTheDocument();
    expect(
      screen.queryByText(/Full onramp steps will appear here/i),
    ).not.toBeInTheDocument();
  });

  it("opens the Sell drawer with title 'Sell' and the empty offramp form from Home", async () => {
    const { WalletHomeContent } = await import(
      "../app/(wallet)/components/home/WalletHomeContent"
    );
    render(<WalletHomeContent />);

    fireEvent.click(
      screen.getByRole("button", { name: /More add funds options/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Sell \(offramp\)/i }));

    expect(screen.getByRole("heading", { name: "Sell" })).toBeInTheDocument();
    expect(screen.getByTestId("ramp-drawer-flow-offramp")).toBeInTheDocument();
  });
});

// ===========================================================================
// 2. MakePayment (Buy "Make payment" step — Figma b16/b18)
// ===========================================================================
describe("MakePayment (Buy make-payment step)", () => {
  async function renderMakePayment() {
    const { MakePayment } = await import("../app/pages/MakePayment");

    const stateProps: any = {
      formValues: { amountSent: 19000, currency: "NGN" },
      orderId: "order-1",
      onrampPaymentAccount: {
        institution: "Providus Bank",
        accountIdentifier: "9521578152",
        accountName: "4Bay7 Enterprise",
        validUntil: new Date(Date.now() + 29 * 60 * 1000).toISOString(),
        amountToTransfer: "19000",
        currency: "NGN",
      },
      setTransactionStatus: jest.fn(),
      setCreatedAt: jest.fn(),
    };

    render(
      <MakePayment stateProps={stateProps} handleBackButtonClick={jest.fn()} />,
    );
    return stateProps;
  }

  it("shows the self-attestation checkbox using the order amount and a mm:ss countdown (AC4)", async () => {
    await renderMakePayment();

    await waitFor(() => {
      expect(screen.getByText(/I sent exactly/)).toBeInTheDocument();
    });
    // The order amount appears both in the account-details rows and in the
    // self-attestation checkbox copy — assert it's in the latter specifically
    // (the leaf <span>, not an ancestor whose textContent also bubbles it up).
    expect(
      screen.getByText(
        (_, el) =>
          el?.children.length === 0 &&
          /I sent exactly/.test(el?.textContent ?? ""),
      ),
    ).toHaveTextContent("₦19,000");
    await waitFor(() => {
      expect(screen.getByText(/^\d{2}:\d{2}$/)).toBeInTheDocument();
    });
  });

  it('disables "I have sent the money" until the checkbox is checked, without blocking the real auto-poll', async () => {
    const aggregator = await import("../app/api/aggregator");
    await renderMakePayment();

    const cta = await screen.findByRole("button", {
      name: /I have sent the money/i,
    });
    expect(cta).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(cta).not.toBeDisabled();

    // The real status poll already runs unconditionally — it must not be
    // gated by the cosmetic checkbox.
    await waitFor(() => {
      expect(aggregator.fetchV2SenderPaymentOrderById).toHaveBeenCalled();
    });
  });

  it('shows the "Watching for your transfer" view on click (UI-only), and the real poll — already in flight — still advances the step once it resolves non-pending', async () => {
    const aggregator = await import("../app/api/aggregator");

    // Controls exactly when the in-flight poll (fired on mount, before the
    // click below) resolves, so the test can prove the click doesn't cancel
    // or wait on it.
    let resolvePoll!: (value: unknown) => void;
    (
      aggregator.fetchV2SenderPaymentOrderById as jest.Mock
    ).mockImplementationOnce(
      () => new Promise((resolve) => (resolvePoll = resolve)),
    );

    const stateProps = await renderMakePayment();

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(
      await screen.findByRole("button", { name: /I have sent the money/i }),
    );

    expect(
      await screen.findByText("Watching for your transfer"),
    ).toBeInTheDocument();
    expect(screen.getByText("Waiting for your transfer")).toBeInTheDocument();

    // The poll that was already running resolves non-pending — it must still
    // advance the step, proving the UI-only click above never touched it.
    resolvePoll({ status: "success", data: { status: "fulfilling" } });

    await waitFor(() => {
      expect(stateProps.setTransactionStatus).toHaveBeenCalledWith(
        "fulfilling",
      );
    });
    expect(mockStepValue.setCurrentStep).toHaveBeenCalledWith("status");
  });
});

// ===========================================================================
// 3. RecipientDetailsForm (AC2 address validation, AC10 unresolved account)
// ===========================================================================
describe("RecipientDetailsForm", () => {
  function OnrampHarness({
    connectedWalletAddress,
  }: {
    connectedWalletAddress: string;
  }) {
    const formMethods = useForm<any>({
      mode: "onChange",
      defaultValues: {
        token: "USDT",
        currency: "NGN",
        walletAddress: "",
        institution: "",
        accountIdentifier: "",
        recipientName: "",
        kesChannel: "",
        businessNumber: "",
      },
    });
    const stateProps: any = {
      isFetchingInstitutions: false,
      institutions: [],
      selectedRecipient: null,
      setSelectedRecipient: jest.fn(),
    };
    return (
      <RecipientDetailsFormUnderTest
        formMethods={formMethods}
        stateProps={stateProps}
        swapMode="onramp"
        token="USDT"
        networkName="Base"
        connectedWalletAddress={connectedWalletAddress}
      />
    );
  }

  function OfframpHarness() {
    const formMethods = useForm<any>({
      mode: "onChange",
      defaultValues: {
        token: "USDT",
        currency: "NGN",
        walletAddress: "",
        institution: "ZEN",
        accountIdentifier: "",
        recipientName: "",
        kesChannel: "",
        businessNumber: "",
      },
    });
    const stateProps: any = {
      isFetchingInstitutions: false,
      institutions: [{ name: "Zenith Bank", code: "ZEN", type: "bank" }],
      selectedRecipient: null,
      setSelectedRecipient: jest.fn(),
    };
    return (
      <RecipientDetailsFormUnderTest
        formMethods={formMethods}
        stateProps={stateProps}
        swapMode="offramp"
        token="USDT"
        networkName="Base"
      />
    );
  }

  let RecipientDetailsFormUnderTest: any;
  beforeAll(async () => {
    RecipientDetailsFormUnderTest = (
      await import("../app/components/recipient/RecipientDetailsForm")
    ).RecipientDetailsForm;
  });

  beforeEach(() => {
    mockFetchAccountName.mockReset();
  });

  it("shows an inline error for an invalid external wallet address and fills the connected wallet via 'My wallet' (AC2)", async () => {
    render(
      <OnrampHarness connectedWalletAddress="0x1111111111111111111111111111111111111111" />,
    );

    const input = screen.getByPlaceholderText(/Enter USDT wallet address/i);
    fireEvent.change(input, { target: { value: "not-an-address" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(
        screen.getByText(/Address must start with 0x/i),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "My wallet" }));
    await waitFor(() => {
      expect(input).toHaveValue("0x1111111111111111111111111111111111111111");
    });
  });

  it("keeps the account field flagged and shows the red 'no match' pill when the aggregator can't resolve a name (AC10)", async () => {
    mockFetchAccountName.mockRejectedValue(
      new Error("No recipient account found."),
    );
    render(<OfframpHarness />);

    const accountInput = screen.getByPlaceholderText(/account number/i);
    fireEvent.change(accountInput, { target: { value: "9047382649" } });

    await waitFor(
      () => {
        expect(
          screen.getByText("No recipient account found."),
        ).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
    expect(accountInput.className).toMatch(/border-input-destructive/);
    expect(mockFetchAccountName).toHaveBeenCalled();
  });

  it("resolves and shows a green check for a valid account (AC9/AC10 happy path)", async () => {
    mockFetchAccountName.mockResolvedValue("Chukwuemeka David Okafor");
    render(<OfframpHarness />);

    const accountInput = screen.getByPlaceholderText(/account number/i);
    fireEvent.change(accountInput, { target: { value: "3082649820" } });

    await waitFor(
      () => {
        expect(
          screen.getByText(/chukwuemeka david okafor/i),
        ).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });
});

// ===========================================================================
// 4. SelectBankModal (AC9 no-match)
// ===========================================================================
describe("SelectBankModal", () => {
  it("shows 'No exact match found' copy when the search has no results (AC9)", async () => {
    const { SelectBankModal } = await import(
      "../app/components/recipient/SelectBankModal"
    );
    render(
      <SelectBankModal
        isOpen
        onClose={jest.fn()}
        filteredInstitutions={[]}
        selectedInstitution={null}
        setSelectedInstitution={jest.fn()}
        setValue={jest.fn()}
        setIsManualEntry={jest.fn()}
        currency="NGN"
        bankSearchTerm="zzz-no-such-bank"
        setBankSearchTerm={jest.fn()}
        isFetchingInstitutions={false}
      />,
    );

    expect(screen.getByText("No exact match found")).toBeInTheDocument();
    expect(
      screen.getByText(
        /No bank with that name found\. Please try another search input/i,
      ),
    ).toBeInTheDocument();
  });
});
