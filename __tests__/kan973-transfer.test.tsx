/// <reference types="jest" />

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const RECIPIENT = "0x7a3f9c2b8e41d5b06a7ce9f1243b8d0e5c6a91f4";
const STARKNET_RECIPIENT =
  "0x04a6e8a2b1f9c3d7e5a0b4c8f1d2e3a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1";

const mockPrivyValue = {
  user: null,
  getAccessToken: async () => "test-access-token",
};
jest.mock("@privy-io/react-auth", () => ({
  usePrivy: () => mockPrivyValue,
  useWallets: () => ({
    wallets: [
      {
        walletClientType: "privy",
        address: "0x1111111111111111111111111111111111111111",
      },
    ],
  }),
}));

jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: { alt: string; src?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={props.alt} src={typeof props.src === "string" ? props.src : ""} />
  ),
}));

jest.mock("@/hooks/useEIP7702Account", () => ({
  useShouldUseEOA: () => true,
}));

jest.mock("@/hooks/useActualTheme", () => ({
  useActualTheme: () => true,
}));

// Mock return values are module-level constants: TransferForm's effects depend
// on these objects, so a fresh object per render would loop forever.
const mockNetworkValue = {
  selectedNetwork: {
    chain: { name: "Base" },
    imageUrl: "/logos/base-logo.svg",
  },
};
jest.mock("@/context/NetworksContext", () => ({
  useNetwork: () => mockNetworkValue,
}));

const mockStarknetValue = {
  walletId: null,
  publicKey: null,
  address: null,
  deployed: false,
};
jest.mock("@/context/StarknetContext", () => ({
  useStarknet: () => mockStarknetValue,
}));

const mockBalanceValue = {
  refreshBalance: jest.fn(),
  starknetWalletBalance: { total: 1000, balances: { USDC: 1000 } },
};
const mockTokensValue = {
    allTokens: {
      Base: [
        {
          name: "USD Coin",
          symbol: "USDC",
          decimals: 6,
          address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
          imageUrl: "/logos/usdc-logo.svg",
        },
      ],
      Ethereum: [
        {
          name: "USD Coin",
          symbol: "USDC",
          decimals: 6,
          address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
          imageUrl: "/logos/usdc-logo.svg",
        },
      ],
      Starknet: [
        {
          name: "USD Coin",
          symbol: "USDC",
          decimals: 6,
          address:
            "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a",
          imageUrl: "/logos/usdc-logo.svg",
        },
      ],
    },
  };
jest.mock("@/context", () => ({
  useBalance: () => mockBalanceValue,
  useTokens: () => mockTokensValue,
}));

// Real validateWalletAddress (not mocked) — AC3 needs the real EVM/Starknet
// format rules exercised, not the loose "starts with 0x" stand-in kan962 uses.

jest.mock("../app/api/aggregator", () => ({
  fetchRate: jest.fn(() => Promise.reject(new Error("no rate"))),
  saveRecipient: jest.fn(async () => true),
  fetchSavedRecipients: jest.fn(async () => []),
}));

jest.mock("../app/utils", () => {
  const actual = jest.requireActual("../app/utils");
  return {
    ...actual,
    fetchBalanceForNetwork: jest.fn(async () => ({
      total: 1700,
      balances: { USDC: 1000 },
    })),
  };
});

jest.mock("../app/components/AnimatedComponents", () => {
  const React = require("react");
  return {
    __esModule: true,
    AnimatedModal: ({
      isOpen,
      children,
    }: {
      isOpen: boolean;
      children: React.ReactNode;
    }) =>
      isOpen ? (
        <div role="dialog" aria-modal="true">
          {children}
        </div>
      ) : null,
    AnimatedComponent: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    slideInOut: {},
    slideInDown: {},
    dropdownVariants: {},
    acquireBodyScrollLock: jest.fn(),
    releaseBodyScrollLock: jest.fn(),
  };
});

jest.mock("@/hooks/useSmartWalletTransfer", () => {
  const transfer = jest.fn();
  const state = { isLoading: false, isSuccess: false, error: "" };
  return {
    __transfer: transfer,
    __state: state,
    useSmartWalletTransfer: () => ({
      isLoading: state.isLoading,
      isSuccess: state.isSuccess,
      transferAmount: "",
      transferToken: "",
      transfer,
      getTxExplorerLink: () => "https://explorer.example/tx/0xabc",
      error: state.error,
    }),
  };
});

const { __transfer: mockTransfer, __state: transferState } = jest.requireMock(
  "@/hooks/useSmartWalletTransfer",
);
const { toast: mockToast } = jest.requireMock("sonner");
const { fetchSavedRecipients: mockFetchSavedRecipients } = jest.requireMock(
  "../app/api/aggregator",
);

import { TransferForm } from "../app/components/TransferForm";
import { TransferConfirmModal } from "../app/components/transfer/TransferConfirmModal";
import {
  formatArrivalTime,
  formatBridgeFeeLabel,
  isAddressAlreadySaved,
} from "../app/components/transfer/transferConfig";
import type { BridgeQuote } from "../app/lib/bridge";

function renderForm({
  preferredTokenSymbol,
  chrome,
}: { preferredTokenSymbol?: string; chrome?: "drawer" | "page" } = {}) {
  const onClose = jest.fn();
  const utils = render(
    <TransferForm
      onClose={onClose}
      preferredTokenSymbol={preferredTokenSymbol}
      chrome={chrome}
    />,
  );
  return { ...utils, onClose };
}

async function fillForm({
  address = RECIPIENT,
  amount = "100",
  token = "USDC",
  network = "Ethereum",
}: {
  address?: string;
  amount?: string;
  token?: string;
  network?: string;
} = {}) {
  const user = userEvent.setup();

  fireEvent.click(screen.getByRole("button", { name: "Select network" }));
  await screen.findByTestId("transfer-network-picker");
  fireEvent.click(screen.getByTestId(`transfer-network-option-${network}`));

  fireEvent.click(screen.getByRole("button", { name: "Select token" }));
  await screen.findByTestId("transfer-token-picker");
  fireEvent.click(screen.getByTestId(`transfer-token-option-${token}`));

  await user.type(screen.getByLabelText("Wallet address"), address);
  const amountInput = screen.getByLabelText("Amount");
  await user.type(amountInput, amount);

  return user;
}

beforeEach(() => {
  mockTransfer.mockClear();
  mockFetchSavedRecipients.mockReset();
  mockFetchSavedRecipients.mockResolvedValue([]);
  mockToast.success.mockClear();
  mockToast.error.mockClear();
  transferState.isLoading = false;
  transferState.isSuccess = false;
  transferState.error = "";
});

describe("TransferForm — address format validation (AC3)", () => {
  it("keeps Continue disabled with a message for an EVM address on an EVM network", async () => {
    renderForm();
    const user = userEvent.setup();

    fireEvent.click(screen.getByRole("button", { name: "Select network" }));
    await screen.findByTestId("transfer-network-picker");
    fireEvent.click(screen.getByTestId("transfer-network-option-Ethereum"));

    await user.type(screen.getByLabelText("Wallet address"), "not-an-address");
    fireEvent.blur(screen.getByLabelText("Wallet address"));

    expect(
      await screen.findByText("Address must start with 0x"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("keeps Continue disabled with a message for an EVM-format address on Starknet", async () => {
    renderForm();
    const user = userEvent.setup();

    fireEvent.click(screen.getByRole("button", { name: "Select network" }));
    await screen.findByTestId("transfer-network-picker");
    fireEvent.click(screen.getByTestId("transfer-network-option-Starknet"));

    await user.type(screen.getByLabelText("Wallet address"), RECIPIENT);
    fireEvent.blur(screen.getByLabelText("Wallet address"));

    expect(
      await screen.findByText(
        "This address is an EVM address. Enter a Starknet address.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("accepts a well-formed Starknet address on the Starknet network", async () => {
    renderForm();
    await fillForm({
      network: "Starknet",
      address: STARKNET_RECIPIENT,
      amount: "10",
    });

    expect(
      screen.queryByText(
        "This address is an EVM address. Enter a Starknet address.",
      ),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled(),
    );
  });
});

describe("TransferForm — sponsorship refused (AC5)", () => {
  it("shows the refusal reason, never reaches success, and sends only once", async () => {
    const { rerender, onClose } = renderForm();
    await fillForm();

    const continueButton = screen.getByRole("button", { name: "Continue" });
    await waitFor(() => expect(continueButton).toBeEnabled());
    fireEvent.click(continueButton);
    fireEvent.click(
      await screen.findByRole("button", { name: "Transfer $100" }),
    );
    await waitFor(() => expect(mockTransfer).toHaveBeenCalledTimes(1));

    // Pending, exactly like a real sponsored-execution attempt in flight.
    transferState.isLoading = true;
    rerender(<TransferForm onClose={onClose} />);
    expect(
      await screen.findByText("Transferring your crypto..."),
    ).toBeInTheDocument();

    // The bundler/executeSponsored path refuses the gas sponsorship — the
    // existing hook surfaces this via `error`, never sets `isSuccess`.
    transferState.isLoading = false;
    transferState.isSuccess = false;
    transferState.error = "Gas sponsorship was refused for this transaction.";
    rerender(<TransferForm onClose={onClose} />);

    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith(
        "Gas sponsorship was refused for this transaction.",
      ),
    );
    expect(screen.queryByText("Transfer successful")).not.toBeInTheDocument();
    // No funds moved — the review step is shown again instead of a receipt.
    expect(
      await screen.findByText(/Confirm transfer to/),
    ).toBeInTheDocument();
    expect(mockTransfer).toHaveBeenCalledTimes(1);
  });
});

describe("TransferForm — save beneficiary already-saved check (AC6)", () => {
  it("hides the confirm-step toggle and the receipt offer for an already-saved address", async () => {
    mockFetchSavedRecipients.mockResolvedValue([
      {
        id: "1",
        type: "wallet",
        walletAddress: RECIPIENT.toUpperCase(),
        name: "Ada",
      },
    ]);

    const { rerender, onClose } = renderForm();
    await fillForm();

    const continueButton = screen.getByRole("button", { name: "Continue" });
    await waitFor(() => expect(continueButton).toBeEnabled());
    fireEvent.click(continueButton);

    await waitFor(() => expect(mockFetchSavedRecipients).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        screen.queryByRole("switch", { name: "Save recipient to contacts" }),
      ).not.toBeInTheDocument(),
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Transfer $100" }),
    );
    await waitFor(() => expect(mockTransfer).toHaveBeenCalledTimes(1));

    transferState.isLoading = true;
    rerender(<TransferForm onClose={onClose} />);
    transferState.isLoading = false;
    transferState.isSuccess = true;
    rerender(<TransferForm onClose={onClose} />);

    const successDialog = await screen.findByRole("dialog");
    expect(
      within(successDialog).getByText("Transfer successful"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save beneficiary" }),
    ).not.toBeInTheDocument();
  });

  it("offers the receipt Save beneficiary for a new address, and the fetch failure keeps it offered", async () => {
    mockFetchSavedRecipients.mockRejectedValue(new Error("network error"));

    const { rerender, onClose } = renderForm();
    await fillForm();

    const continueButton = screen.getByRole("button", { name: "Continue" });
    await waitFor(() => expect(continueButton).toBeEnabled());
    fireEvent.click(continueButton);
    await waitFor(() => expect(mockFetchSavedRecipients).toHaveBeenCalled());

    // Fetch failed — the toggle still shows (no new error UI, per AC6).
    expect(
      await screen.findByRole("switch", { name: "Save recipient to contacts" }),
    ).toBeInTheDocument();

    fireEvent.click(
      await screen.findByRole("button", { name: "Transfer $100" }),
    );
    await waitFor(() => expect(mockTransfer).toHaveBeenCalledTimes(1));

    transferState.isLoading = true;
    rerender(<TransferForm onClose={onClose} />);
    transferState.isLoading = false;
    transferState.isSuccess = true;
    rerender(<TransferForm onClose={onClose} />);

    const successDialog = await screen.findByRole("dialog");
    expect(
      within(successDialog).getByText("Transfer successful"),
    ).toBeInTheDocument();
    expect(
      within(successDialog).getByRole("button", { name: "Save beneficiary" }),
    ).toBeInTheDocument();
  });

  it("saving via the confirm toggle hides the receipt's own Save beneficiary offer", async () => {
    const { rerender, onClose } = renderForm();
    await fillForm();

    const continueButton = screen.getByRole("button", { name: "Continue" });
    await waitFor(() => expect(continueButton).toBeEnabled());
    fireEvent.click(continueButton);

    fireEvent.click(
      await screen.findByRole("switch", { name: "Save recipient to contacts" }),
    );
    fireEvent.change(screen.getByPlaceholderText("Enter beneficiary name"), {
      target: { value: "Ada" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save beneficiary" }));
    await waitFor(() =>
      expect(mockToast.success).toHaveBeenCalledWith("Recipient saved"),
    );

    fireEvent.click(screen.getByTestId("transfer-confirm-primary"));
    await waitFor(() => expect(mockTransfer).toHaveBeenCalledTimes(1));

    transferState.isLoading = true;
    rerender(<TransferForm onClose={onClose} />);
    transferState.isLoading = false;
    transferState.isSuccess = true;
    rerender(<TransferForm onClose={onClose} />);

    const successDialog = await screen.findByRole("dialog");
    expect(
      within(successDialog).getByText("Transfer successful"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save beneficiary" }),
    ).not.toBeInTheDocument();
  });
});

describe("TransferForm — token-detail entry preselects the token", () => {
  it("preselects the preferred token symbol", async () => {
    renderForm({ preferredTokenSymbol: "USDC" });

    expect(
      await screen.findByRole("button", { name: "Select token, USDC" }),
    ).toBeInTheDocument();
  });
});

describe("TransferForm — Home full-page chrome (KAN-973)", () => {
  it("replaces the form with an inline confirm panel, with the subtitle the drawer omits", async () => {
    renderForm({ chrome: "page" });
    await fillForm();

    const continueButton = screen.getByRole("button", { name: "Continue" });
    await waitFor(() => expect(continueButton).toBeEnabled());
    fireEvent.click(continueButton);

    expect(await screen.findByText(/Confirm transfer to/)).toBeInTheDocument();
    expect(
      screen.getByText("Verify transaction details before you send"),
    ).toBeInTheDocument();
    // Not a modal — no dialog role, no X close button, Back returns to the form.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Close" }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("transfer-confirm-primary")).toBeInTheDocument();
  });

  it("shows the compact success modal instead of the rich receipt, and Close calls onClose", async () => {
    const { rerender, onClose } = renderForm({ chrome: "page" });
    await fillForm();

    const continueButton = screen.getByRole("button", { name: "Continue" });
    await waitFor(() => expect(continueButton).toBeEnabled());
    fireEvent.click(continueButton);
    fireEvent.click(
      await screen.findByRole("button", { name: "Transfer $100" }),
    );
    await waitFor(() => expect(mockTransfer).toHaveBeenCalledTimes(1));

    transferState.isLoading = true;
    rerender(
      <TransferForm onClose={onClose} chrome="page" />,
    );
    transferState.isLoading = false;
    transferState.isSuccess = true;
    rerender(
      <TransferForm onClose={onClose} chrome="page" />,
    );

    const successDialog = await screen.findByRole("dialog");
    expect(
      within(successDialog).getByText("Transfer successful"),
    ).toBeInTheDocument();
    expect(
      within(successDialog).getByText(
        /has been successfully transferred to the recipient\./,
      ),
    ).toBeInTheDocument();
    expect(
      within(successDialog).queryByText("Back home"),
    ).not.toBeInTheDocument();
    expect(
      within(successDialog).queryByText("New payment"),
    ).not.toBeInTheDocument();
    expect(
      within(successDialog).queryByText("Help spread the word"),
    ).not.toBeInTheDocument();

    fireEvent.click(within(successDialog).getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("offers the compact success's Save beneficiary for a new address (AC6)", async () => {
    mockFetchSavedRecipients.mockRejectedValue(new Error("network error"));
    const { rerender, onClose } = renderForm({ chrome: "page" });
    await fillForm();

    const continueButton = screen.getByRole("button", { name: "Continue" });
    await waitFor(() => expect(continueButton).toBeEnabled());
    fireEvent.click(continueButton);
    await waitFor(() => expect(mockFetchSavedRecipients).toHaveBeenCalled());

    fireEvent.click(
      await screen.findByRole("button", { name: "Transfer $100" }),
    );
    await waitFor(() => expect(mockTransfer).toHaveBeenCalledTimes(1));

    transferState.isLoading = true;
    rerender(<TransferForm onClose={onClose} chrome="page" />);
    transferState.isLoading = false;
    transferState.isSuccess = true;
    rerender(<TransferForm onClose={onClose} chrome="page" />);

    const successDialog = await screen.findByRole("dialog");
    expect(
      within(successDialog).getByRole("button", { name: "Save beneficiary" }),
    ).toBeInTheDocument();
  });
});

describe("TransferConfirmModal — bridge quote support rows", () => {
  const baseProps = {
    isOpen: true,
    onClose: jest.fn(),
    onConfirm: jest.fn(),
    shortAddress: "0x7a3...91f4",
    amountLabel: "100",
    tokenSymbol: "USDT",
    networkName: "Ethereum",
    feeLabel: "$0",
    ctaLabel: "Transfer $100",
  };

  it("renders the arrival-time row only when the prop is passed", () => {
    const { rerender } = render(
      <TransferConfirmModal {...baseProps} arrivalTimeLabel={null} />,
    );
    expect(screen.queryByText("Arrival time")).not.toBeInTheDocument();

    rerender(<TransferConfirmModal {...baseProps} arrivalTimeLabel="~2 min" />);
    expect(screen.getByText("Arrival time")).toBeInTheDocument();
    expect(screen.getByText("~2 min")).toBeInTheDocument();
  });
});

describe("transferConfig — pure helpers", () => {
  const nearQuote: BridgeQuote = {
    kind: "near-deposit",
    depositAddress: "0xdeposit",
    amountOut: "99.5",
    deadline: Date.now() + 600_000,
    timeEstimate: "~30 seconds",
    fee: "0.5",
    raw: {},
  };

  const lifiQuote: BridgeQuote = {
    kind: "lifi-tx",
    amountOut: "99",
    feeReceivingToken: "1.2",
    estimate: {
      fromAmount: "100",
      toAmount: "99",
      approvalAddress: "0xapprove",
      executionDuration: "180",
      feeCosts: [],
    },
    transactionRequest: { to: "0xto", data: "0x", value: "0" },
    raw: {},
  };

  it("formatArrivalTime reads the NEAR time estimate as-is", () => {
    expect(formatArrivalTime(nearQuote)).toBe("~30 seconds");
  });

  it("formatArrivalTime converts LI.FI executionDuration (seconds) to minutes", () => {
    expect(formatArrivalTime(lifiQuote)).toBe("~3 min");
  });

  it("formatArrivalTime returns null without a quote", () => {
    expect(formatArrivalTime(null)).toBeNull();
    expect(formatArrivalTime(undefined)).toBeNull();
  });

  it("formatBridgeFeeLabel reads the fee in the receiving token", () => {
    expect(formatBridgeFeeLabel(nearQuote, "USDC")).toBe("0.5 USDC");
    expect(formatBridgeFeeLabel(lifiQuote, "USDC")).toBe("1.2 USDC");
    expect(formatBridgeFeeLabel(null, "USDC")).toBeNull();
  });

  it("isAddressAlreadySaved matches case-insensitively on wallet recipients only", () => {
    const saved = [
      { id: "1", type: "wallet" as const, walletAddress: RECIPIENT.toUpperCase(), name: "Ada" },
      {
        id: "2",
        type: "bank" as const,
        name: "Bank One",
        institution: "GTBank",
        institutionCode: "058",
        accountIdentifier: "0123456789",
      },
    ];
    expect(isAddressAlreadySaved(saved, RECIPIENT)).toBe(true);
    expect(isAddressAlreadySaved(saved, "0xsomeoneelse")).toBe(false);
    expect(isAddressAlreadySaved(null, RECIPIENT)).toBe(false);
    expect(isAddressAlreadySaved(saved, undefined)).toBe(false);
  });
});
