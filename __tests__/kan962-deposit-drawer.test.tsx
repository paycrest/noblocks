/// <reference types="jest" />

import type React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({ user: null }),
  useWallets: () => ({ wallets: [] }),
}));

jest.mock("@/context/InjectedWalletContext", () => ({
  useInjectedWallet: () => ({
    isInjectedWallet: false,
    injectedAddress: null,
  }),
}));

jest.mock("@/context/StarknetContext", () => ({
  useStarknet: () => ({ address: null }),
}));

jest.mock("@/context/TronContext", () => ({
  useTron: () => ({ address: null }),
}));

jest.mock("@/hooks/useEIP7702Account", () => ({
  useShouldUseEOA: () => true,
}));

jest.mock("@/hooks/useActualTheme", () => ({
  useActualTheme: () => false,
}));

jest.mock("../app/api/aggregator", () => ({
  fetchRate: jest.fn(() => Promise.reject(new Error("no rate"))),
}));

import { DepositDrawerView } from "../app/components/deposit/DepositDrawer";
import { DepositTokenModalView } from "../app/components/deposit/DepositTokenModal";
import { WALLET_DRAWER_SLOT_ID } from "../app/components/drawer/walletDrawerSlot";
import {
  DEPOSIT_DRAWER_COPY,
  formatDecimalAmountDisplay,
  sanitizeDecimalAmountInput,
} from "../app/lib/deposit/deposit-drawer-config";
import {
  getDepositAddress,
  resolveSessionWalletAddress,
  type DepositAddressSources,
} from "../app/lib/deposit/getDepositAddress";
import { normalizeStarknetAddress } from "../app/utils";

jest.mock("react-qrcode-logo", () => ({
  QRCode: ({ value }: { value: string }) => (
    <div data-testid="deposit-qr" data-value={value} />
  ),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: { alt: string; src?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={props.alt} src={typeof props.src === "string" ? props.src : ""} />
  ),
}));

jest.mock("../app/utils", () => {
  const actual = jest.requireActual("../app/utils");
  return {
    ...actual,
    copyToClipboard: jest.fn(() => Promise.resolve(true)),
  };
});

jest.mock("framer-motion", () => {
  const React = require("react");
  function MockMotionAside(
    props: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode },
    ref: React.Ref<HTMLElement>,
  ) {
    return <aside ref={ref as React.Ref<HTMLDivElement>} {...props} />;
  }
  MockMotionAside.displayName = "MockMotionAside";
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    useReducedMotion: () => false,
    motion: {
      aside: React.forwardRef(MockMotionAside),
      div: (
        props: React.HTMLAttributes<HTMLDivElement> & {
          children?: React.ReactNode;
        },
      ) => <div {...props} />,
    },
  };
});

jest.mock("../app/components/AnimatedComponents", () => {
  const React = require("react");
  return {
    AnimatedModal: ({
      isOpen,
      onClose,
      children,
    }: {
      isOpen: boolean;
      onClose: () => void;
      children: React.ReactNode;
    }) =>
      isOpen ? (
        <div role="dialog" aria-modal="true" data-testid="deposit-overlay">
          {children}
          <button type="button" onClick={onClose} className="sr-only">
            Dismiss overlay
          </button>
        </div>
      ) : null,
    acquireBodyScrollLock: jest.fn(),
    releaseBodyScrollLock: jest.fn(),
    dropdownVariants: {},
  };
});

const { copyToClipboard } = jest.requireMock("../app/utils");

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: query.includes("min-width: 768px"),
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    })),
  });
});

function renderDrawer(ui: React.ReactElement) {
  return render(
    <div className="flex">
      <div>{ui}</div>
      <div id={WALLET_DRAWER_SLOT_ID} />
    </div>,
  );
}

const evmAddress = "0x7a3f9c111111111111111111111111111111a91f4";
const USE_ONCE_COPY = DEPOSIT_DRAWER_COPY.onceOnlyBullet;

function mockGetDepositAddress(
  impl?: (network: string) => Promise<{ address: string }>,
) {
  return jest.fn(impl ?? (async () => ({ address: evmAddress })));
}

describe("DEPOSIT_DRAWER_COPY", () => {
  it("keeps Figma copy including use-once and lowercase ethereum in body/banner", () => {
    expect(DEPOSIT_DRAWER_COPY.onceOnlyBullet).toBe(USE_ONCE_COPY);
    expect(DEPOSIT_DRAWER_COPY.acknowledgement).toContain(
      "use this address only once",
    );
    expect(DEPOSIT_DRAWER_COPY.qrScanCopyFunds("ethereum")).toContain(
      "receive funds on the ethereum network",
    );
    expect(DEPOSIT_DRAWER_COPY.qrScanCopyToken("USDC", "ethereum")).toContain(
      "receive USDC on the ethereum network",
    );
    expect(DEPOSIT_DRAWER_COPY.sendOnlyWarning("USDC", "ethereum")).toBe(
      "Make sure to only send USDC on the ethereum network.",
    );
    expect(DEPOSIT_DRAWER_COPY.qrNetworkLine("Ethereum")).toBe(
      "On the Ethereum network",
    );
    expect(DEPOSIT_DRAWER_COPY.searchToken).toBe("Search token");
    expect(DEPOSIT_DRAWER_COPY.searchNetwork).toBe("Search network");
  });
});

describe("sanitizeDecimalAmountInput and display commas", () => {
  it("keeps decimal strings intact and formats thousands without JS numbers", () => {
    expect(sanitizeDecimalAmountInput("0.1")).toBe("0.1");
    expect(sanitizeDecimalAmountInput("1000000.123456")).toBe("1000000.123456");
    expect(sanitizeDecimalAmountInput("12.34.56")).toBe("12.3456");
    expect(formatDecimalAmountDisplay("1000")).toBe("1,000");
    expect(formatDecimalAmountDisplay("1000000.123456")).toBe("1,000,000.123456");
  });
});

describe("getDepositAddress session wallet", () => {
  const embeddedLinked = "0xembeddedlinked000000000000000000000001";
  const embeddedWallet = "0xembeddedwallet00000000000000000000002";
  const smartWallet = "0xsmartwallet00000000000000000000000003";
  const injected = "0xinjected00000000000000000000000000004";
  const starknetShort = "0x1234";
  const tron = "TN3W4H6rK2ce4vX9YnFQHwKEUgCTuG4dSz";

  const base: DepositAddressSources = {
    isInjectedWallet: false,
    injectedAddress: injected,
    starknetAddress: starknetShort,
    tronAddress: tron,
    evmEmbeddedLinkedAddress: embeddedLinked,
    evmEmbeddedWalletAddress: embeddedWallet,
    evmSmartWalletAddress: smartWallet,
    shouldUseEOA: true,
  };

  it("returns the embedded EOA for EVM networks when shouldUseEOA is true", async () => {
    await expect(getDepositAddress("Base", base)).resolves.toEqual({
      address: embeddedLinked,
    });
    await expect(getDepositAddress("Ethereum", base)).resolves.toEqual({
      address: embeddedLinked,
    });
  });

  it("falls back to the Privy embedded wallet when linked EOA is missing", async () => {
    await expect(
      getDepositAddress("Arbitrum One", {
        ...base,
        evmEmbeddedLinkedAddress: null,
      }),
    ).resolves.toEqual({ address: embeddedWallet });
  });

  it("returns the smart wallet for EVM when shouldUseEOA is false", async () => {
    await expect(
      getDepositAddress("BNB Smart Chain", {
        ...base,
        shouldUseEOA: false,
      }),
    ).resolves.toEqual({ address: smartWallet });
  });

  it("returns the Starknet session wallet, normalized", async () => {
    const result = await getDepositAddress("Starknet", base);
    expect(result.address).toBe(normalizeStarknetAddress(starknetShort));
  });

  it("returns the Tron session wallet", async () => {
    await expect(getDepositAddress("Tron", base)).resolves.toEqual({
      address: tron,
    });
  });

  it("prefers the injected wallet over every family", async () => {
    const injectedSources = { ...base, isInjectedWallet: true };
    await expect(getDepositAddress("Base", injectedSources)).resolves.toEqual({
      address: injected,
    });
  });

  it("throws when Solana has no v1 wallet context", async () => {
    await expect(getDepositAddress("Solana", base)).rejects.toThrow(
      "Wallet address unavailable for this network",
    );
    expect(resolveSessionWalletAddress("Solana", base)).toBeUndefined();
  });
});

describe("Home DepositDrawerView", () => {
  it("opens as a drawer, keeps Continue disabled until token and network, and has no checkbox", () => {
    renderDrawer(
      <DepositDrawerView
        isOpen
        onRequestClose={jest.fn()}
        getDepositAddress={mockGetDepositAddress()}
      />,
    );

    expect(screen.getByTestId("deposit-drawer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(screen.queryByText("Before you continue")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/Powered by/i)).not.toBeInTheDocument();
  });

  it("opens a centred token picker from the Select token pill", () => {
    renderDrawer(
      <DepositDrawerView
        isOpen
        onRequestClose={jest.fn()}
        getDepositAddress={mockGetDepositAddress()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select token" }));
    expect(screen.getByTestId("deposit-token-picker")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search token")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "USDT" }));
    expect(screen.queryByTestId("deposit-token-picker")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("enables Continue after token and network are chosen via pickers", () => {
    renderDrawer(
      <DepositDrawerView
        isOpen
        onRequestClose={jest.fn()}
        getDepositAddress={mockGetDepositAddress()}
        preview={{ token: "USDT", chainName: "Ethereum" }}
      />,
    );

    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("hides the rate when none is available and still shows swap time", () => {
    renderDrawer(
      <DepositDrawerView
        isOpen
        onRequestClose={jest.fn()}
        getDepositAddress={mockGetDepositAddress()}
        preview={{ token: "USDT", chainName: "Ethereum" }}
      />,
    );

    expect(screen.queryByTestId("deposit-rate")).not.toBeInTheDocument();
    expect(
      screen.getByText("Swap usually completes in 15 sec"),
    ).toBeInTheDocument();
  });

  it("blocks unsupported token+network combos inline", () => {
    renderDrawer(
      <DepositDrawerView
        isOpen
        onRequestClose={jest.fn()}
        getDepositAddress={mockGetDepositAddress()}
        preview={{ token: "ETH", chainName: "Polygon" }}
      />,
    );

    expect(screen.getByTestId("deposit-unsupported-reason")).toHaveTextContent(
      DEPOSIT_DRAWER_COPY.unsupportedReason("ETH", "Polygon"),
    );
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("preserves decimal-string amounts and displays thousands separators", async () => {
    const user = userEvent.setup();
    renderDrawer(
      <DepositDrawerView
        isOpen
        onRequestClose={jest.fn()}
        getDepositAddress={mockGetDepositAddress()}
      />,
    );

    const input = screen.getByTestId("deposit-amount-input");
    await user.type(input, "0.1");
    expect(input).toHaveValue("0.1");

    await user.clear(input);
    await user.type(input, "1000");
    expect(input).toHaveValue("1,000");
  });

  it("opens a stacked QR modal with address, banner, no bullets, lowercase ethereum", async () => {
    const getAddress = mockGetDepositAddress();
    renderDrawer(
      <DepositDrawerView
        isOpen
        onRequestClose={jest.fn()}
        getDepositAddress={getAddress}
        preview={{ token: "USDC", chainName: "Ethereum" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(getAddress).toHaveBeenCalledWith("Ethereum");
    });
    expect(screen.getByTestId("deposit-qr-step")).toBeInTheDocument();
    expect(screen.getByTestId("deposit-drawer")).toBeInTheDocument();
    expect(screen.getByText(evmAddress)).toBeInTheDocument();
    expect(
      screen.getByText(DEPOSIT_DRAWER_COPY.qrScanCopyFunds("ethereum")),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        DEPOSIT_DRAWER_COPY.sendOnlyWarning("USDC", "ethereum"),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("On the Ethereum network")).toBeInTheDocument();
    expect(screen.queryByText(USE_ONCE_COPY)).not.toBeInTheDocument();
    expect(screen.queryByText(/Minimum deposit value/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => {
      expect(copyToClipboard).toHaveBeenCalledWith(evmAddress, "Address");
    });
  });

  it("shows an error overlay when getDepositAddress fails", async () => {
    const getAddress = mockGetDepositAddress(async () => {
      throw new Error("Wallet address unavailable for this network");
    });
    renderDrawer(
      <DepositDrawerView
        isOpen
        onRequestClose={jest.fn()}
        getDepositAddress={getAddress}
        preview={{ token: "USDC", chainName: "Base" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => {
      expect(screen.getByTestId("deposit-error")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("deposit-qr")).not.toBeInTheDocument();
  });
});

describe("Token-detail DepositTokenModalView", () => {
  it("opens a centred Add TOKEN modal with checkbox gating Continue", () => {
    render(
      <DepositTokenModalView
        isOpen
        onRequestClose={jest.fn()}
        tokenSymbol="USDC"
        getDepositAddress={mockGetDepositAddress()}
        preview={{ token: "USDC", chainName: "Ethereum" }}
      />,
    );

    expect(screen.getByTestId("deposit-token-modal")).toBeInTheDocument();
    expect(screen.getByText("Add USDC")).toBeInTheDocument();
    expect(
      screen.getByText("Deposit USDC into your noblocks wallet"),
    ).toBeInTheDocument();
    expect(screen.getByText("Before you continue")).toBeInTheDocument();
    expect(screen.getByText(USE_ONCE_COPY)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("uses black inner tick/cross with unchanged green and red outer fills", () => {
    render(
      <DepositTokenModalView
        isOpen
        onRequestClose={jest.fn()}
        tokenSymbol="USDC"
        getDepositAddress={mockGetDepositAddress()}
        preview={{ token: "USDC", chainName: "Ethereum" }}
      />,
    );

    const okIcons = screen.getAllByTestId("deposit-ack-ok-icon");
    const warnIcons = screen.getAllByTestId("deposit-ack-warn-icon");
    expect(okIcons).toHaveLength(1);
    expect(warnIcons).toHaveLength(1);
    expect(okIcons[0]).toHaveClass(
      "bg-[#227738]",
      "dark:bg-[#39c65d]",
      "text-[#2B2B2B]",
    );
    expect(okIcons[0]).not.toHaveClass("text-white");
    expect(warnIcons[0]).toHaveClass("bg-[#ff1e57]", "text-[#2B2B2B]");
    expect(warnIcons[0]).not.toHaveClass("text-white");
  });

  it("keeps Continue disabled when checked but network is empty", () => {
    render(
      <DepositTokenModalView
        isOpen
        onRequestClose={jest.fn()}
        tokenSymbol="USDC"
        getDepositAddress={mockGetDepositAddress()}
        preview={{ token: "USDC", acknowledged: true }}
      />,
    );

    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("opens compact QR with address, banner, and per-frame bullets", async () => {
    const getAddress = mockGetDepositAddress();
    render(
      <DepositTokenModalView
        isOpen
        onRequestClose={jest.fn()}
        tokenSymbol="USDC"
        getDepositAddress={getAddress}
        preview={{
          token: "USDC",
          chainName: "Ethereum",
          acknowledged: true,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => {
      expect(getAddress).toHaveBeenCalledWith("Ethereum");
    });
    expect(screen.getByTestId("deposit-qr-step")).toBeInTheDocument();
    expect(
      screen.getByText(
        DEPOSIT_DRAWER_COPY.qrScanCopyToken("USDC", "ethereum"),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        DEPOSIT_DRAWER_COPY.sendOnlyWarning("USDC", "ethereum"),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(USE_ONCE_COPY)).toBeInTheDocument();
    expect(
      screen.getByText("Minimum deposit value $1 USD"),
    ).toBeInTheDocument();

    const okIcons = screen.getAllByTestId("deposit-ack-ok-icon");
    const warnIcons = screen.getAllByTestId("deposit-ack-warn-icon");
    expect(okIcons.length).toBeGreaterThan(0);
    expect(warnIcons.length).toBeGreaterThan(0);
    for (const icon of [...okIcons, ...warnIcons]) {
      expect(icon).toHaveClass("text-[#2B2B2B]");
      expect(icon).not.toHaveClass("text-white");
    }
    for (const icon of okIcons) {
      expect(icon).toHaveClass("bg-[#227738]", "dark:bg-[#39c65d]");
    }
    for (const icon of warnIcons) {
      expect(icon).toHaveClass("bg-[#ff1e57]");
    }
  });
});
