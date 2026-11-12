/// <reference types="jest" />

import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { toast } from "sonner";
import {
  formatMonthlyLimitLine,
  computeMonthlyProgressPercent,
  formatTierLimitLine,
} from "../app/hooks/useProfileViewModel";

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const mockShowMfaEnrollmentModal = jest.fn();
const mockUpdateEmail = jest.fn();
const mockLinkEmail = jest.fn();
const mockLogout = jest.fn(async () => {});
const mockDisconnectWallet = jest.fn(async () => true);
const mockExportWallet = jest.fn();
const mockRefreshStatus = jest.fn(async () => null);

let mockPrivyUser: Record<string, unknown> | null = null;

jest.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({
    user: mockPrivyUser,
    updateEmail: mockUpdateEmail,
  }),
  useLinkAccount: () => ({ linkEmail: mockLinkEmail }),
  useLogout: () => ({ logout: mockLogout }),
  useMfaEnrollment: () => ({
    showMfaEnrollmentModal: mockShowMfaEnrollmentModal,
  }),
}));

jest.mock("@/hooks/useWalletDisconnect", () => ({
  useWalletDisconnect: () => ({ disconnectWallet: mockDisconnectWallet }),
}));

jest.mock("@/hooks/useHandleExportEmbeddedWallet", () => ({
  useHandleExportEmbeddedWallet: () => mockExportWallet,
}));

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

let mockIsInjectedWallet = false;

jest.mock("@/context", () => ({
  useKYC: () => mockKycState,
  useInjectedWallet: () => ({
    isInjectedWallet: mockIsInjectedWallet,
    injectedAddress: undefined,
    injectedReady: false,
  }),
  useEmbed: () => ({ isEmbed: false }),
}));

jest.mock("@/components/TransactionLimitModal", () => ({
  __esModule: true,
  default: () => null,
}));

const mockSetTheme = jest.fn();
let mockTheme = "system";

jest.mock("next-themes", () => ({
  useTheme: () => ({ theme: mockTheme, setTheme: mockSetTheme }),
}));

type KycState = {
  tier: 0 | 1 | 2 | 3 | 4;
  pooledWalletCount: number;
  transactionSummary: { monthlySpent: number; dailySpent: number; lastTransactionDate: string | null };
  hasLoadedStatus: boolean;
  hasLoadedTransactionSummary: boolean;
  getCurrentLimits: () => { monthly: number; unlimited?: boolean };
  refreshStatus: typeof mockRefreshStatus;
  walletAddress: string;
};

let mockKycState: KycState;

function makeKycState(overrides: Partial<KycState> = {}): KycState {
  return {
    tier: 0,
    pooledWalletCount: 1,
    transactionSummary: { monthlySpent: 0, dailySpent: 0, lastTransactionDate: null },
    hasLoadedStatus: true,
    hasLoadedTransactionSummary: true,
    getCurrentLimits: () => ({ monthly: 0, unlimited: false }),
    refreshStatus: mockRefreshStatus,
    walletAddress: "0x1111111111111111111111111111111111111111",
    ...overrides,
  };
}

import { ProfilePageContent } from "../app/(wallet)/components/ProfilePageContent";
import { SettingsPageContent } from "../app/(wallet)/components/SettingsPageContent";
import ProfileView from "../app/components/ProfileView";
import { KYC_TIERS } from "../app/context/KYCContext";

const mockClipboardWriteText = jest.fn().mockResolvedValue(undefined);

beforeEach(() => {
  jest.clearAllMocks();
  mockPrivyUser = null;
  mockIsInjectedWallet = false;
  mockTheme = "system";
  // jsdom has no sendBeacon; the logout tracker falls back to fetch otherwise,
  // and the global fetch mock (jest.setup.js) returns undefined, not a thenable.
  (navigator as unknown as { sendBeacon: jest.Mock }).sendBeacon = jest.fn();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: mockClipboardWriteText },
    configurable: true,
  });
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("profile-limit-format", () => {
  it("formats the monthly limit line", () => {
    expect(formatMonthlyLimitLine(50, 100, false)).toBe("$50.00 / $100.00");
  });

  it("formats unlimited monthly limit line", () => {
    expect(formatMonthlyLimitLine(50, 0, true)).toBe("$50.00 / Unlimited");
  });

  it("computes monthly progress percent", () => {
    expect(computeMonthlyProgressPercent(50, 100, false)).toBe(50);
  });

  it("clamps progress at 100", () => {
    expect(computeMonthlyProgressPercent(150, 100, false)).toBe(100);
  });

  it("reads 0 progress when unlimited or the limit is non-positive", () => {
    expect(computeMonthlyProgressPercent(50, 100, true)).toBe(0);
    expect(computeMonthlyProgressPercent(50, 0, false)).toBe(0);
  });

  it("formats the tier limit line", () => {
    expect(formatTierLimitLine(50000, false)).toBe("$50,000.00 / month");
    expect(formatTierLimitLine(0, true)).toBe("Unlimited");
  });
});

// ---------------------------------------------------------------------------
// Profile page
// ---------------------------------------------------------------------------

describe("ProfilePageContent", () => {
  it("shows the Tier 0 'Verify to start swapping' CTA and no current-tier card", async () => {
    mockKycState = makeKycState({ tier: 0 });
    render(<ProfilePageContent />);

    expect(await screen.findByText("Verify to start swapping")).toBeInTheDocument();
    expect(screen.queryByText(/Current: Tier/)).not.toBeInTheDocument();
  });

  it("shows the current tier badge, monthly spend, and upgrade CTA for an intermediate tier", async () => {
    mockKycState = makeKycState({
      tier: 2,
      transactionSummary: { monthlySpent: 4000, dailySpent: 0, lastTransactionDate: null },
      getCurrentLimits: () => ({ monthly: 15000, unlimited: false }),
    });
    render(<ProfilePageContent />);

    expect(await screen.findByText("Current: Tier 2")).toBeInTheDocument();
    expect(
      screen.getByText(formatMonthlyLimitLine(4000, 15000, false)),
    ).toBeInTheDocument();
    expect(screen.getByText("Increase limit → Tier 3")).toBeInTheDocument();
  });

  it("shows Unlimited and no upgrade CTA for tier 4", async () => {
    mockKycState = makeKycState({
      tier: 4,
      transactionSummary: { monthlySpent: 4000, dailySpent: 0, lastTransactionDate: null },
      getCurrentLimits: () => ({ monthly: 0, unlimited: true }),
    });
    render(<ProfilePageContent />);

    expect(await screen.findByText("Current: Tier 4")).toBeInTheDocument();
    expect(screen.getByText(/Unlimited/)).toBeInTheDocument();
    expect(screen.queryByText(/Increase limit/)).not.toBeInTheDocument();
    // No tiers remain above 4 in KYC_TIERS, so the accordion is empty.
    expect(screen.queryByText("See more")).not.toBeInTheDocument();
  });

  it("expands and collapses an accordion tier row with its limit line", async () => {
    mockKycState = makeKycState({ tier: 2, getCurrentLimits: () => ({ monthly: 15000 }) });
    render(<ProfilePageContent />);

    const tier3Row = await screen.findByText("Tier 3");
    fireEvent.click(tier3Row);

    expect(await screen.findByText("Address verification")).toBeInTheDocument();
    const tier3Limits = KYC_TIERS[3].limits;
    expect(
      screen.getByText(
        formatTierLimitLine(tier3Limits.monthly, !!tier3Limits.unlimited),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("See less")).toBeInTheDocument();

    fireEvent.click(tier3Row);
    await waitFor(() =>
      expect(screen.queryByText("Address verification")).not.toBeInTheDocument(),
    );
  });

  it("does not render the referral block or Noblocks Play link (no Figma counterpart)", async () => {
    mockKycState = makeKycState({ tier: 2 });
    render(<ProfilePageContent />);
    await screen.findByText("Account");
    expect(screen.queryByText("Referral CTA")).not.toBeInTheDocument();
    expect(screen.queryByText(/Noblocks Play rewards/)).not.toBeInTheDocument();
  });

  it("signs out on click for a non-injected wallet", async () => {
    mockKycState = makeKycState({ tier: 1 });
    mockIsInjectedWallet = false;
    render(<ProfilePageContent />);

    const signOut = await screen.findByText("Sign out");
    fireEvent.click(signOut);

    await waitFor(() => expect(mockLogout).toHaveBeenCalledTimes(1));
  });

  it("hides Sign out for an injected wallet", async () => {
    mockKycState = makeKycState({ tier: 1 });
    mockIsInjectedWallet = true;
    render(<ProfilePageContent />);

    await screen.findByText("Account");
    expect(screen.queryByText("Sign out")).not.toBeInTheDocument();
  });

  it("still calls logout() when a localStorage.removeItem call throws", async () => {
    mockKycState = makeKycState({ tier: 1 });
    mockIsInjectedWallet = false;
    const removeItemMock = window.localStorage.removeItem as jest.Mock;
    removeItemMock.mockImplementation(() => {
      throw new Error("storage disabled");
    });

    render(<ProfilePageContent />);
    const signOut = await screen.findByText("Sign out");
    fireEvent.click(signOut);

    await waitFor(() => expect(mockLogout).toHaveBeenCalledTimes(1));

    removeItemMock.mockReset();
  });

  it("shows the skeleton (aria-busy) and no tier-0 CTA while status has not loaded", async () => {
    mockKycState = makeKycState({
      tier: 0,
      hasLoadedStatus: false,
      hasLoadedTransactionSummary: false,
    });
    render(<ProfilePageContent />);

    expect(await screen.findByLabelText("Loading")).toBeInTheDocument();
    expect(screen.queryByText("Verify to start swapping")).not.toBeInTheDocument();
    expect(screen.queryByText(/Current: Tier/)).not.toBeInTheDocument();
  });

  it("shows a skeleton in place of the amount/progress bar while the summary hasn't loaded, then the real amount once it has", async () => {
    mockKycState = makeKycState({
      tier: 2,
      hasLoadedStatus: true,
      hasLoadedTransactionSummary: false,
      getCurrentLimits: () => ({ monthly: 15000, unlimited: false }),
    });
    const { rerender } = render(<ProfilePageContent />);

    await screen.findByText("Current: Tier 2");
    expect(screen.queryByText(/\$0\.00/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(formatMonthlyLimitLine(0, 15000, false)),
    ).not.toBeInTheDocument();

    mockKycState = makeKycState({
      tier: 2,
      transactionSummary: { monthlySpent: 4000, dailySpent: 0, lastTransactionDate: null },
      hasLoadedStatus: true,
      hasLoadedTransactionSummary: true,
      getCurrentLimits: () => ({ monthly: 15000, unlimited: false }),
    });
    rerender(<ProfilePageContent />);

    expect(
      await screen.findByText(formatMonthlyLimitLine(4000, 15000, false)),
    ).toBeInTheDocument();
  });

  describe("quiet retry", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("does not start the retry cycle until the initial refresh settles", async () => {
      mockKycState = makeKycState({
        hasLoadedStatus: false,
        hasLoadedTransactionSummary: false,
      });
      let resolveInitial: (() => void) | undefined;
      mockRefreshStatus.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveInitial = () => resolve(null);
          }),
      );

      render(<ProfilePageContent />);
      await waitFor(() => expect(mockRefreshStatus).toHaveBeenCalledTimes(1));

      // Initial refresh is still in flight — advancing well past the first
      // retry delay must not consume a retry slot.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(10000);
      });
      expect(mockRefreshStatus).toHaveBeenCalledTimes(1);

      // Only once the initial refresh settles can the retry cycle begin.
      await act(async () => {
        resolveInitial?.();
        await Promise.resolve();
      });

      await act(async () => {
        await jest.advanceTimersByTimeAsync(2000);
      });
      expect(mockRefreshStatus).toHaveBeenCalledTimes(2);
    });

    it("retries refreshStatus with backoff after a failure, and stops after the bound", async () => {
      mockKycState = makeKycState({
        hasLoadedStatus: false,
        hasLoadedTransactionSummary: false,
      });
      render(<ProfilePageContent />);

      await waitFor(() => expect(mockRefreshStatus).toHaveBeenCalledTimes(1));

      // Let the initial refresh's `finally` settle before the retry cycle
      // can start.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });

      await act(async () => {
        await jest.advanceTimersByTimeAsync(2000);
      });
      expect(mockRefreshStatus).toHaveBeenCalledTimes(2);

      await act(async () => {
        await jest.advanceTimersByTimeAsync(4000);
      });
      expect(mockRefreshStatus).toHaveBeenCalledTimes(3);

      await act(async () => {
        await jest.advanceTimersByTimeAsync(8000);
      });
      expect(mockRefreshStatus).toHaveBeenCalledTimes(4);

      // Bound reached — no further retries even after waiting much longer.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(60000);
      });
      expect(mockRefreshStatus).toHaveBeenCalledTimes(4);
    });

    it("gives a new wallet its own retry budget after the previous wallet exhausts its retries", async () => {
      mockKycState = makeKycState({
        walletAddress: "0x1111111111111111111111111111111111111111",
        hasLoadedStatus: false,
        hasLoadedTransactionSummary: false,
      });
      const { rerender } = render(<ProfilePageContent />);

      await waitFor(() => expect(mockRefreshStatus).toHaveBeenCalledTimes(1));
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });

      // Wallet A exhausts its 3 retries (2s/4s/8s).
      await act(async () => {
        await jest.advanceTimersByTimeAsync(2000);
      });
      expect(mockRefreshStatus).toHaveBeenCalledTimes(2);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(4000);
      });
      expect(mockRefreshStatus).toHaveBeenCalledTimes(3);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(8000);
      });
      expect(mockRefreshStatus).toHaveBeenCalledTimes(4);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(60000);
      });
      expect(mockRefreshStatus).toHaveBeenCalledTimes(4);

      // Switch to wallet B — still failing — it must get its own full budget.
      mockKycState = makeKycState({
        walletAddress: "0x2222222222222222222222222222222222222222",
        hasLoadedStatus: false,
        hasLoadedTransactionSummary: false,
      });
      rerender(<ProfilePageContent />);

      // B's own initial refresh.
      await waitFor(() => expect(mockRefreshStatus).toHaveBeenCalledTimes(5));
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });

      await act(async () => {
        await jest.advanceTimersByTimeAsync(2000);
      });
      expect(mockRefreshStatus).toHaveBeenCalledTimes(6);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(4000);
      });
      expect(mockRefreshStatus).toHaveBeenCalledTimes(7);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(8000);
      });
      expect(mockRefreshStatus).toHaveBeenCalledTimes(8);
    });

    it("restarts the initial-refresh gate for a new wallet whose predecessor never settled", async () => {
      mockKycState = makeKycState({
        walletAddress: "0x1111111111111111111111111111111111111111",
        tier: 0,
        hasLoadedStatus: false,
        hasLoadedTransactionSummary: false,
      });
      // Wallet A's initial refresh never resolves.
      mockRefreshStatus.mockImplementationOnce(() => new Promise(() => {}));
      const { rerender } = render(<ProfilePageContent />);
      await waitFor(() => expect(mockRefreshStatus).toHaveBeenCalledTimes(1));

      // Switch to wallet B, whose initial refresh settles (fails) promptly.
      mockKycState = makeKycState({
        walletAddress: "0x2222222222222222222222222222222222222222",
        tier: 0,
        hasLoadedStatus: false,
        hasLoadedTransactionSummary: false,
      });
      rerender(<ProfilePageContent />);
      await waitFor(() => expect(mockRefreshStatus).toHaveBeenCalledTimes(2));

      // B's retry effect must schedule its own retries even though A's initial
      // refresh is still (permanently) in flight.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(2000);
      });
      expect(mockRefreshStatus).toHaveBeenCalledTimes(3);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(4000);
      });
      expect(mockRefreshStatus).toHaveBeenCalledTimes(4);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(8000);
      });
      expect(mockRefreshStatus).toHaveBeenCalledTimes(5);

      const signOut = await screen.findByText("Sign out");
      expect(signOut).toBeEnabled();
      expect(screen.getByTitle("Copy wallet address")).toBeInTheDocument();
    });

    it("bounds the initial-refresh gate with a timeout so a hung fetch doesn't trap account actions forever", async () => {
      mockKycState = makeKycState({
        tier: 0,
        hasLoadedStatus: false,
        hasLoadedTransactionSummary: false,
      });
      // The initial refresh never settles, and the retry chained behind it (fired once
      // the gate times out) never settles either — its `.finally` never runs, so
      // retryTick never bumps. Only the timeout's own retriesExhausted flip can unblock
      // the account card here.
      mockRefreshStatus
        .mockImplementationOnce(() => new Promise(() => {}))
        .mockImplementationOnce(() => new Promise(() => {}));
      render(<ProfilePageContent />);
      await waitFor(() => expect(mockRefreshStatus).toHaveBeenCalledTimes(1));

      // The initial-refresh timeout fires at 10s. No retry has been scheduled yet, so
      // the only thing that can be unblocking account actions here is the timeout
      // itself setting retriesExhausted.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(10000);
      });
      expect(mockRefreshStatus).toHaveBeenCalledTimes(1);

      const signOut = await screen.findByText("Sign out");
      expect(signOut).toBeEnabled();
      expect(screen.getByTitle("Copy wallet address")).toBeInTheDocument();

      expect(screen.queryByText("Verify to start swapping")).not.toBeInTheDocument();
      expect(screen.queryByText(/Current: Tier/)).not.toBeInTheDocument();
      expect(screen.queryByText(/\$0\.00/)).not.toBeInTheDocument();
      expect(screen.getByLabelText("Loading tier status")).toBeInTheDocument();

      // The chained retry fires next and also hangs forever — the unblocked state
      // must hold steady rather than flicker back to loading or reset.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(2000);
      });
      expect(mockRefreshStatus).toHaveBeenCalledTimes(2);

      expect(screen.getByText("Sign out")).toBeEnabled();
      expect(screen.getByTitle("Copy wallet address")).toBeInTheDocument();
      expect(screen.queryByText("Verify to start swapping")).not.toBeInTheDocument();
      expect(screen.queryByText(/Current: Tier/)).not.toBeInTheDocument();
      expect(screen.queryByText(/\$0\.00/)).not.toBeInTheDocument();
      expect(screen.getByLabelText("Loading tier status")).toBeInTheDocument();
    });

    it("unblocks account actions at the 10s deadline even when the initial refresh settled quickly but the first retry hangs", async () => {
      mockKycState = makeKycState({
        tier: 0,
        hasLoadedStatus: false,
        hasLoadedTransactionSummary: false,
      });
      // The initial refresh settles quickly (the default mock resolves immediately)
      // but status never loads. The retry effect then chains the first retry at 2s,
      // and that retry hangs forever — its `.finally` never fires, so retryTick never
      // bumps. The account-actions deadline must still fire at 10s from mount since
      // it's no longer cleared when the initial refresh settles.
      mockRefreshStatus
        .mockImplementationOnce(async () => null)
        .mockImplementationOnce(() => new Promise(() => {}));
      render(<ProfilePageContent />);

      await waitFor(() => expect(mockRefreshStatus).toHaveBeenCalledTimes(1));
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });

      // First retry fires at 2s and hangs forever.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(2000);
      });
      expect(mockRefreshStatus).toHaveBeenCalledTimes(2);

      // Still within the deadline — account actions stay hidden.
      expect(screen.queryByText("Sign out")).not.toBeInTheDocument();

      // Advance to 10s from mount — the deadline fires independently of the hung retry.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(8000);
      });
      expect(mockRefreshStatus).toHaveBeenCalledTimes(2);

      const signOut = await screen.findByText("Sign out");
      expect(signOut).toBeEnabled();
      expect(screen.getByTitle("Copy wallet address")).toBeInTheDocument();

      expect(screen.queryByText("Verify to start swapping")).not.toBeInTheDocument();
      expect(screen.queryByText(/Current: Tier/)).not.toBeInTheDocument();
      expect(screen.queryByText(/\$0\.00/)).not.toBeInTheDocument();
      expect(screen.getByLabelText("Loading tier status")).toBeInTheDocument();
    });

    it("shows Account actions once retries are exhausted without fabricating tier data (ProfilePageContent)", async () => {
      mockKycState = makeKycState({
        tier: 0,
        hasLoadedStatus: false,
        hasLoadedTransactionSummary: false,
      });
      render(<ProfilePageContent />);

      await waitFor(() => expect(mockRefreshStatus).toHaveBeenCalledTimes(1));
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(2000);
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(4000);
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(8000);
      });

      const signOut = await screen.findByText("Sign out");
      expect(signOut).toBeEnabled();

      const copyButton = screen.getByTitle("Copy wallet address");
      expect(copyButton).toBeInTheDocument();
      fireEvent.click(copyButton);
      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith("Address copied to clipboard"),
      );

      expect(screen.queryByText("Verify to start swapping")).not.toBeInTheDocument();
      expect(screen.queryByText(/Current: Tier/)).not.toBeInTheDocument();
      expect(screen.queryByText(/\$0\.00/)).not.toBeInTheDocument();
      expect(screen.getByLabelText("Loading tier status")).toBeInTheDocument();
    });

    it("shows the account card once retries are exhausted without tier-0 defaults (ProfileView)", async () => {
      mockKycState = makeKycState({
        tier: 0,
        hasLoadedStatus: false,
        hasLoadedTransactionSummary: false,
      });
      render(<ProfileView layout="drawer" />);

      await waitFor(() => expect(mockRefreshStatus).toHaveBeenCalledTimes(1));
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(2000);
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(4000);
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(8000);
      });

      const copyButton = screen.getByTitle("Copy wallet address");
      expect(copyButton).toBeInTheDocument();
      fireEvent.click(copyButton);
      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith("Address copied to clipboard"),
      );

      expect(screen.queryByText("Verify now")).not.toBeInTheDocument();
      expect(screen.queryByText(/Current: Tier/)).not.toBeInTheDocument();
      expect(screen.queryByText(/\$0\.00/)).not.toBeInTheDocument();
      expect(screen.getByLabelText("Loading tier status")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Settings page
// ---------------------------------------------------------------------------

describe("SettingsPageContent", () => {
  it("renders all four rows for a non-injected user", () => {
    render(<SettingsPageContent />);

    expect(screen.getByText("Export wallet")).toBeInTheDocument();
    expect(screen.getByText("Enable MFA")).toBeInTheDocument();
    expect(screen.getByText("Theme")).toBeInTheDocument();
    expect(screen.getByText("Linked email address")).toBeInTheDocument();
  });

  it("hides Export, MFA, and email rows for an injected wallet, keeps Theme", () => {
    mockIsInjectedWallet = true;
    render(<SettingsPageContent />);

    expect(screen.queryByText("Export wallet")).not.toBeInTheDocument();
    expect(screen.queryByText("Enable MFA")).not.toBeInTheDocument();
    expect(screen.queryByText("Linked email address")).not.toBeInTheDocument();
    expect(screen.getByText("Theme")).toBeInTheDocument();
  });

  it("calls the export hook when Export is clicked", () => {
    render(<SettingsPageContent />);
    fireEvent.click(screen.getByText("Export"));
    expect(mockExportWallet).toHaveBeenCalledTimes(1);
  });

  it("opens the Transaction protection intro on Enable, and Continue hands off to Privy MFA", async () => {
    render(<SettingsPageContent />);
    fireEvent.click(screen.getByText("Enable"));

    expect(screen.getByText("Transaction protection")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Continue"));

    expect(mockShowMfaEnrollmentModal).toHaveBeenCalledTimes(1);
    // AnimatedModal exit-animates before unmounting, so the title lingers briefly.
    await waitFor(() =>
      expect(screen.queryByText("Transaction protection")).not.toBeInTheDocument(),
    );
  });

  it("closes the Transaction protection intro on Not now without opening Privy MFA", async () => {
    render(<SettingsPageContent />);
    fireEvent.click(screen.getByText("Enable"));
    fireEvent.click(screen.getByText("Not now"));

    expect(mockShowMfaEnrollmentModal).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByText("Transaction protection")).not.toBeInTheDocument(),
    );
  });

  it("skips the intro and opens Privy MFA directly when already enrolled", () => {
    mockPrivyUser = { mfaMethods: ["totp"] };
    render(<SettingsPageContent />);

    expect(screen.getByText("Manage MFA")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Manage"));

    expect(mockShowMfaEnrollmentModal).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Transaction protection")).not.toBeInTheDocument();
  });

  it("theme buttons call setTheme with the right value and reflect aria-pressed", async () => {
    mockTheme = "dark";
    render(<SettingsPageContent />);

    const darkButton = await screen.findByTitle("Switch to dark mode");
    expect(darkButton).toHaveAttribute("aria-pressed", "true");

    const lightButton = screen.getByTitle("Switch to light mode");
    expect(lightButton).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(lightButton);
    expect(mockSetTheme).toHaveBeenCalledWith("light");

    fireEvent.click(screen.getByTitle("Switch to auto mode"));
    expect(mockSetTheme).toHaveBeenCalledWith("system");
  });

  it("shows Connect for an unlinked email and calls linkEmail", () => {
    render(<SettingsPageContent />);
    fireEvent.click(screen.getByText("Connect"));
    expect(mockLinkEmail).toHaveBeenCalledTimes(1);
  });

  it("shows the linked email address and Update, and calls updateEmail", () => {
    mockPrivyUser = { email: { address: "bruce@wayne.com" } };
    render(<SettingsPageContent />);

    expect(screen.getByText("bruce@wayne.com")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Update"));
    expect(mockUpdateEmail).toHaveBeenCalledTimes(1);
  });
});
