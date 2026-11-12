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

jest.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({
    user: null,
    getAccessToken: async () => "test-access-token",
  }),
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

jest.mock("@/context/NetworksContext", () => ({
  useNetwork: () => ({
    selectedNetwork: {
      chain: { name: "Base" },
      imageUrl: "/logos/base-logo.svg",
    },
  }),
}));

jest.mock("@/context/StarknetContext", () => ({
  useStarknet: () => ({
    walletId: null,
    publicKey: null,
    address: null,
    deployed: false,
  }),
}));

jest.mock("@/context", () => ({
  useBalance: () => ({
    refreshBalance: jest.fn(),
    starknetWalletBalance: { total: 0, balances: {} },
  }),
  useTokens: () => ({
    allTokens: {
      Base: [
        {
          name: "USD Coin",
          symbol: "USDC",
          decimals: 6,
          address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
          imageUrl: "/logos/usdc-logo.svg",
        },
        {
          name: "Tether USD",
          symbol: "USDT",
          decimals: 6,
          address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
          imageUrl: "/logos/usdt-logo.svg",
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
        {
          name: "Tether USD",
          symbol: "USDT",
          decimals: 6,
          address: "0xdac17f958d2ee523a2206206994597c13d831ec7",
          imageUrl: "/logos/usdt-logo.svg",
        },
      ],
    },
  }),
}));

jest.mock("@/lib/validation", () => ({
  validateWalletAddress: (value: string) =>
    value.startsWith("0x") ? true : "Invalid address",
}));

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
      balances: { USDC: 1000, USDT: 500, cNGN: 200000 },
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
      getTxExplorerLink: () => undefined,
      error: state.error,
    }),
  };
});

const { __transfer: mockTransfer, __state: transferState } = jest.requireMock(
  "@/hooks/useSmartWalletTransfer",
);
const { saveRecipient: mockSaveRecipient } = jest.requireMock(
  "../app/api/aggregator",
);

import { TransferForm } from "../app/components/TransferForm";

function renderForm() {
  const onClose = jest.fn();
  const utils = render(<TransferForm onClose={onClose} />);
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
  mockSaveRecipient.mockClear();
  transferState.isLoading = false;
  transferState.isSuccess = false;
  transferState.error = "";
});

describe("TransferForm", () => {
  it("opens the confirm modal from Continue and does not send", async () => {
    renderForm();
    await fillForm();

    const continueButton = screen.getByRole("button", { name: "Continue" });
    await waitFor(() => expect(continueButton).toBeEnabled());
    fireEvent.click(continueButton);

    expect(
      await screen.findByText(/Confirm transfer to/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Verify transaction details before you send"),
    ).not.toBeInTheDocument();
    const confirmDialog = screen.getByRole("dialog");
    expect(within(confirmDialog).getByText("100 USDC")).toBeInTheDocument();
    expect(
      within(confirmDialog).getAllByText("Ethereum").length,
    ).toBeGreaterThan(0);
    expect(within(confirmDialog).getByText("Fees")).toBeInTheDocument();
    expect(within(confirmDialog).getByText("$0")).toBeInTheDocument();
    expect(
      within(confirmDialog).getByText("Save recipient to contacts"),
    ).toBeInTheDocument();
    const dividers = confirmDialog.querySelectorAll("hr");
    expect(dividers).toHaveLength(2);
    dividers.forEach((divider) => {
      expect(divider).not.toHaveClass("border-dashed");
      expect(divider).toHaveClass("border-border-light");
    });
    expect(
      screen.getByText(
        "Transfers cannot be reversed. Check the transaction details above before confirming.",
      ),
    ).toBeInTheDocument();
    expect(mockTransfer).not.toHaveBeenCalled();
  });

  it("sends exactly once from the confirm primary, with unchanged arguments", async () => {
    renderForm();
    await fillForm();

    const continueButton = screen.getByRole("button", { name: "Continue" });
    await waitFor(() => expect(continueButton).toBeEnabled());
    fireEvent.click(continueButton);
    fireEvent.click(
      await screen.findByRole("button", { name: "Transfer $100" }),
    );

    await waitFor(() => expect(mockTransfer).toHaveBeenCalledTimes(1));
    const arg = mockTransfer.mock.calls[0][0];
    expect(arg).toEqual(
      expect.objectContaining({
        token: "USDC",
        recipientAddress: RECIPIENT,
        recipientNetwork: "Ethereum",
        recipientNetworkImageUrl: "/logos/eth-logo.svg",
      }),
    );
    expect(String(arg.amount)).toBe("100");
    expect(typeof arg.resetForm).toBe("function");
  });

  it("double-clicking the confirm primary calls transfer once", async () => {
    renderForm();
    await fillForm();

    const continueButton = screen.getByRole("button", { name: "Continue" });
    await waitFor(() => expect(continueButton).toBeEnabled());
    fireEvent.click(continueButton);

    const primary = await screen.findByTestId("transfer-confirm-primary");
    fireEvent.click(primary);
    fireEvent.click(primary);
    fireEvent.click(primary);

    await waitFor(() => expect(mockTransfer).toHaveBeenCalledTimes(1));

    // The lock also survives an Enter repeat.
    fireEvent.keyDown(primary, { key: "Enter", code: "Enter" });
    fireEvent.click(primary);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockTransfer).toHaveBeenCalledTimes(1);
  });

  it("does not transfer when the amount exceeds the balance on confirm", async () => {
    renderForm();
    await fillForm();

    const continueButton = screen.getByRole("button", { name: "Continue" });
    await waitFor(() => expect(continueButton).toBeEnabled());
    fireEvent.click(continueButton);
    expect(await screen.findByTestId("transfer-confirm-primary")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Amount"), {
      target: { value: "5000" },
    });
    expect(await screen.findByText("Max. amount is 1000")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("transfer-confirm-primary"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockTransfer).not.toHaveBeenCalled();
  });

  it("recovers from an invalid confirm and transfers once after the amount is fixed", async () => {
    renderForm();
    await fillForm();

    const continueButton = screen.getByRole("button", { name: "Continue" });
    await waitFor(() => expect(continueButton).toBeEnabled());
    fireEvent.click(continueButton);
    expect(await screen.findByTestId("transfer-confirm-primary")).toBeInTheDocument();

    const amountInput = screen.getByLabelText("Amount");
    fireEvent.change(amountInput, { target: { value: "5000" } });
    // Confirm immediately: either the guard blocks or handleSubmit's onInvalid
    // releases the in-flight lock. Neither may send.
    fireEvent.click(screen.getByTestId("transfer-confirm-primary"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockTransfer).not.toHaveBeenCalled();
    expect(screen.getByTestId("transfer-confirm-primary")).toBeInTheDocument();

    fireEvent.change(amountInput, { target: { value: "100" } });
    await waitFor(() =>
      expect(screen.queryByText("Max. amount is 1000")).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId("transfer-confirm-primary"));

    await waitFor(() => expect(mockTransfer).toHaveBeenCalledTimes(1));
  });

  it("opens Create beneficiary from the save switch and saves the wallet recipient", async () => {
    renderForm();
    await fillForm();

    const continueButton = screen.getByRole("button", { name: "Continue" });
    await waitFor(() => expect(continueButton).toBeEnabled());
    fireEvent.click(continueButton);

    const toggle = await screen.findByRole("switch", {
      name: "Save recipient to contacts",
    });
    expect(toggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(await screen.findByText("Create beneficiary")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Enter beneficiary name"), {
      target: { value: "Ada" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save beneficiary" }));

    await waitFor(() => expect(mockSaveRecipient).toHaveBeenCalledTimes(1));
    expect(mockSaveRecipient).toHaveBeenCalledWith(
      { type: "wallet", walletAddress: RECIPIENT, name: "Ada" },
      "test-access-token",
    );
    await waitFor(() =>
      expect(screen.queryByText("Create beneficiary")).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("switch", { name: "Save recipient to contacts" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(mockTransfer).not.toHaveBeenCalled();
  });

  it("cancelling Create beneficiary resets the switch and leaves transfer working", async () => {
    renderForm();
    await fillForm();

    const continueButton = screen.getByRole("button", { name: "Continue" });
    await waitFor(() => expect(continueButton).toBeEnabled());
    fireEvent.click(continueButton);

    fireEvent.click(
      await screen.findByRole("switch", {
        name: "Save recipient to contacts",
      }),
    );
    const createDialog = (await screen.findByText("Create beneficiary")).closest(
      '[role="dialog"]',
    );
    expect(createDialog).not.toBeNull();
    fireEvent.click(
      within(createDialog as HTMLElement).getByRole("button", {
        name: "Close",
      }),
    );

    await waitFor(() =>
      expect(screen.queryByText("Create beneficiary")).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("switch", { name: "Save recipient to contacts" }),
    ).toHaveAttribute("aria-checked", "false");
    expect(mockSaveRecipient).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("transfer-confirm-primary"));
    await waitFor(() => expect(mockTransfer).toHaveBeenCalledTimes(1));
  });

  it("Back closes confirm and keeps the filled form", async () => {
    renderForm();
    await fillForm();

    const continueButton = screen.getByRole("button", { name: "Continue" });
    await waitFor(() => expect(continueButton).toBeEnabled());
    fireEvent.click(continueButton);
    expect(
      await screen.findByText(/Confirm transfer to/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.queryByText(/Confirm transfer to/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Amount")).toHaveValue(100);
    expect(screen.getByLabelText("Wallet address")).toHaveValue(RECIPIENT);
    expect(mockTransfer).not.toHaveBeenCalled();
  });

  it("filters the token picker and sets the selected token", async () => {
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Select token" }));
    expect(await screen.findByTestId("transfer-token-picker")).toBeInTheDocument();

    const search = screen.getByPlaceholderText("Search token");
    fireEvent.change(search, { target: { value: "USDT" } });

    expect(
      screen.queryByTestId("transfer-token-option-USDC"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId("transfer-token-option-USDT"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("transfer-token-option-USDT"));
    expect(
      screen.queryByTestId("transfer-token-picker"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Select token, USDT" }),
    ).toBeInTheDocument();
  });

  it("filters the network picker and sets the selected network", async () => {
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Select network" }));
    expect(
      await screen.findByTestId("transfer-network-picker"),
    ).toBeInTheDocument();

    const search = screen.getByPlaceholderText("Search network");
    fireEvent.change(search, { target: { value: "poly" } });

    expect(screen.getByTestId("transfer-network-option-Polygon")).toBeInTheDocument();
    expect(
      screen.queryByTestId("transfer-network-option-Base"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("transfer-network-option-Polygon"));
    expect(
      screen.queryByTestId("transfer-network-picker"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select network" })).toHaveTextContent(
      "Polygon",
    );
  });

  it("fills quick amounts only for USD-pegged stablecoins", async () => {
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Select token" }));
    fireEvent.click(
      await screen.findByTestId("transfer-token-option-USDC"),
    );
    fireEvent.click(screen.getByRole("button", { name: "$100" }));
    expect(screen.getByLabelText("Amount")).toHaveValue(100);
  });

  it("shows the pending and success modals from the hook state", async () => {
    const { rerender, onClose } = renderForm();
    await fillForm();

    const continueButton = screen.getByRole("button", { name: "Continue" });
    await waitFor(() => expect(continueButton).toBeEnabled());
    fireEvent.click(continueButton);
    fireEvent.click(
      await screen.findByRole("button", { name: "Transfer $100" }),
    );
    await waitFor(() => expect(mockTransfer).toHaveBeenCalledTimes(1));

    transferState.isLoading = true;
    rerender(<TransferForm onClose={onClose} />);

    expect(
      await screen.findByText("Transferring your crypto..."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "You can leave this screen, we will proceed to completing your transfer",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Sec")).toBeInTheDocument();

    transferState.isLoading = false;
    transferState.isSuccess = true;
    rerender(<TransferForm onClose={onClose} />);

    const successDialog = await screen.findByRole("dialog");
    expect(
      within(successDialog).getByText("Transfer successful"),
    ).toBeInTheDocument();
    expect(
      within(successDialog).getByText("Transaction status"),
    ).toBeInTheDocument();
    expect(within(successDialog).getByText("Completed")).toBeInTheDocument();
    expect(within(successDialog).getByText("Transferred")).toBeInTheDocument();
    expect(within(successDialog).getByText("Time spent")).toBeInTheDocument();
    expect(
      within(successDialog).getByText(/\d+ seconds?/),
    ).toBeInTheDocument();
    expect(
      within(successDialog).getByText("Onchain receipt"),
    ).toBeInTheDocument();
    expect(
      within(successDialog).getByText("Help spread the word"),
    ).toBeInTheDocument();
    expect(
      within(successDialog).getByRole("link", { name: "Share on Twitter" }),
    ).toBeInTheDocument();
    expect(
      within(successDialog).getByRole("link", { name: "Share on Warpcast" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "New payment" }));
    expect(screen.queryByText("Transfer successful")).not.toBeInTheDocument();
  });

});
