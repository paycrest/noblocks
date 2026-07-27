/// <reference types="jest" />

import { renderHook } from "@testing-library/react";

import { useSwapButton } from "../app/hooks/useSwapButton";

const mockUsePrivy = jest.fn();
const mockUseInjectedWallet = jest.fn();

jest.mock("@privy-io/react-auth", () => ({
  usePrivy: () => mockUsePrivy(),
}));

jest.mock("../app/context", () => ({
  useInjectedWallet: () => mockUseInjectedWallet(),
}));

/** Off-ramp form state that passes every non-KYC gate, so only KYC decides the outcome. */
const FORM_VALUES = {
  amountSent: 100,
  currency: "NGN",
  recipientName: "Ada Lovelace",
  walletAddress: "",
  receiveDestinationExplicitlySelected: true,
  token: "USDC",
};

const handleSwap = () => {};
const login = () => {};
const handleFundWallet = () => {};
const openPhoneVerification = () => {};
const openLimitModal = () => {};

function setup(overrides: Record<string, unknown> = {}) {
  const watch = (() => FORM_VALUES) as never;
  return renderHook(() =>
    useSwapButton({
      watch,
      balance: 1000,
      isDirty: true,
      isValid: true,
      isUserVerified: false,
      rate: 1,
      ...overrides,
    }),
  ).result.current;
}

/**
 * Resolves the CTA's action to a readable name. `buttonAction` takes isPhoneVerified and
 * isUserVerified as arguments (they shadow the hook's props), so callers must pass the same
 * values they configured the hook with.
 */
function actionNameOf(
  result: ReturnType<typeof setup>,
  args: { isPhoneVerified?: boolean; isUserVerified?: boolean } = {},
) {
  const action = result.buttonAction(
    handleSwap,
    login,
    handleFundWallet,
    openPhoneVerification,
    openLimitModal,
    args.isPhoneVerified ?? false,
    args.isUserVerified ?? false,
  );
  if (action === handleSwap) return "handleSwap";
  if (action === openPhoneVerification) return "openPhoneVerification";
  if (action === openLimitModal) return "openLimitModal";
  if (action === handleFundWallet) return "handleFundWallet";
  if (action === login) return "login";
  return "unknown";
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUsePrivy.mockReturnValue({ authenticated: true });
  mockUseInjectedWallet.mockReturnValue({
    isInjectedWallet: false,
    injectedReady: false,
    injectedRequested: false,
    injectedStatus: "idle",
  });
});

describe("useSwapButton KYC gating", () => {
  it("defers to handleSwap while KYC status has not loaded", () => {
    // Unknown status must not be read as unverified: handleSwap refreshes (re-establishing the
    // injected session if needed) before any verification step is chosen. Opening the phone
    // modal from the CTA would bypass that refresh entirely.
    const result = setup({ hasLoadedStatus: false, kycTier: 0 });

    expect(actionNameOf(result)).toBe("handleSwap");
    expect(result.buttonText).toBe("Swap");
  });

  it("defers to handleSwap for an unloaded injected wallet too", () => {
    mockUsePrivy.mockReturnValue({ authenticated: false });
    mockUseInjectedWallet.mockReturnValue({
      isInjectedWallet: true,
      injectedReady: true,
      injectedRequested: true,
      injectedStatus: "connected",
    });

    const result = setup({ hasLoadedStatus: false, kycTier: 0 });

    expect(actionNameOf(result)).toBe("handleSwap");
    expect(result.buttonText).toBe("Swap");
  });

  it("opens phone verification once status is loaded and the user is tier 0", () => {
    const result = setup({ hasLoadedStatus: true, kycTier: 0 });

    expect(actionNameOf(result)).toBe("openPhoneVerification");
    expect(result.buttonText).toBe("Get started");
  });

  it("labels a returning tier-0 wallet 'Swap' but still opens phone verification", () => {
    const result = setup({
      hasLoadedStatus: true,
      kycTier: 0,
      hasPriorTransactionActivity: true,
    });

    expect(actionNameOf(result)).toBe("openPhoneVerification");
    expect(result.buttonText).toBe("Swap");
  });

  it("opens the limit modal when phone is verified but the tier is capped", () => {
    const result = setup({
      hasLoadedStatus: true,
      kycTier: 1,
      isPhoneVerified: true,
    });

    expect(actionNameOf(result, { isPhoneVerified: true })).toBe(
      "openLimitModal",
    );
  });

  it("swaps at max tier — there is nothing left to verify", () => {
    const result = setup({
      hasLoadedStatus: true,
      kycTier: 3,
      isPhoneVerified: true,
    });

    expect(actionNameOf(result, { isPhoneVerified: true })).toBe("handleSwap");
    expect(result.buttonText).toBe("Swap");
  });

  it("keeps pre-existing behavior when hasLoadedStatus is omitted", () => {
    // Defaults to loaded so callers that don't pass KYC state are unaffected.
    const result = setup({ kycTier: 0 });

    expect(actionNameOf(result)).toBe("openPhoneVerification");
  });

  it("still swaps when the user is already verified", () => {
    const result = setup({ isUserVerified: true, hasLoadedStatus: false });

    expect(actionNameOf(result, { isUserVerified: true })).toBe("handleSwap");
    expect(result.buttonText).toBe("Swap");
  });
});
