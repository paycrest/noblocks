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

/** Off-ramp state that clears every gate, so only the liquidity band decides `isEnabled`. */
function setupWithAmount(
  formOverrides: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
) {
  const watch = (() => ({ ...FORM_VALUES, ...formOverrides })) as never;
  return renderHook(() =>
    useSwapButton({
      watch,
      balance: 100_000_000,
      isDirty: true,
      isValid: true,
      isUserVerified: true,
      hasLoadedStatus: true,
      rate: 1,
      ...overrides,
    }),
  ).result.current;
}

describe("useSwapButton liquidity band", () => {
  it("keeps pre-existing behavior when no band is supplied", () => {
    expect(setupWithAmount({ amountSent: 100 }).isEnabled).toBe(true);
    expect(setupWithAmount({ amountSent: 0.1 }).isEnabled).toBe(false);
  });

  it("blocks an off-ramp amount above what providers can fill", () => {
    const amountBounds = { min: 1, max: 500, noLiquidity: false };

    expect(setupWithAmount({ amountSent: 400 }, { amountBounds }).isEnabled).toBe(
      true,
    );
    expect(setupWithAmount({ amountSent: 600 }, { amountBounds }).isEnabled).toBe(
      false,
    );
  });

  it("raises the off-ramp floor to the market minimum", () => {
    const amountBounds = { min: 10, max: 500, noLiquidity: false };

    // 5 clears the static 0.5 floor but not the live one.
    expect(setupWithAmount({ amountSent: 5 }, { amountBounds }).isEnabled).toBe(
      false,
    );
    expect(setupWithAmount({ amountSent: 20 }, { amountBounds }).isEnabled).toBe(
      true,
    );
  });

  it("enforces the band on on-ramp amounts too", () => {
    const onramp = {
      isSwapped: true,
      networkName: "Base",
      rate: 1500,
    };
    const formValues = {
      walletAddress: "0x1234567890123456789012345678901234567890",
    };
    const amountBounds = { min: 1000, max: 2_000_000, noLiquidity: false };

    expect(
      setupWithAmount(
        { ...formValues, amountSent: 1_000_000 },
        { ...onramp, amountBounds },
      ).isEnabled,
    ).toBe(true);
    expect(
      setupWithAmount(
        { ...formValues, amountSent: 3_000_000 },
        { ...onramp, amountBounds },
      ).isEnabled,
    ).toBe(false);
  });

  it("disables the CTA when the corridor has no fillable offers", () => {
    const result = setupWithAmount(
      { amountSent: 100 },
      { amountBounds: { min: 0.5, max: 10000, noLiquidity: true } },
    );

    expect(result.isEnabled).toBe(false);
  });

  it("does not offer 'Fund wallet' for a corridor with no liquidity when balance is fine", () => {
    // Funding cannot create a provider. Only short-circuit for underfunding when
    // the amount is fundable — then no-liquidity still blocks the CTA.
    const result = setupWithAmount(
      { amountSent: 100 },
      {
        balance: 1000,
        amountBounds: { min: 0.5, max: 10000, noLiquidity: true },
      },
    );

    expect(result.isEnabled).toBe(false);
    expect(result.buttonText).not.toBe("Fund wallet");
  });

  it("offers 'Fund wallet' when amount exceeds balance even if the corridor reports no liquidity", () => {
    // Insufficient funds is actionable first; after top-up the market band can re-evaluate.
    const result = setupWithAmount(
      { amountSent: 100 },
      {
        balance: 1,
        amountBounds: { min: 0.5, max: 10000, noLiquidity: true },
      },
    );

    expect(result.isEnabled).toBe(true);
    expect(result.buttonText).toBe("Fund wallet");
  });

  it("enforces the static ceiling the form falls back to when liquidity is unknown", () => {
    // The caller merges static limits into the bounds, so the CTA agrees with
    // the field rule instead of enabling an amount the field has rejected.
    const amountBounds = { min: 0.5, max: 10000, noLiquidity: false };

    expect(
      setupWithAmount({ amountSent: 5_000 }, { amountBounds }).isEnabled,
    ).toBe(true);
    expect(
      setupWithAmount({ amountSent: 5_000_000 }, { amountBounds }).isEnabled,
    ).toBe(false);
  });

  it("uses the cNGN floor the form computed rather than the bare 0.5 token floor", () => {
    // 0.5 x cngnRate(1500); the divergence this prop exists to prevent.
    const amountBounds = { min: 750, max: 50_000_000, noLiquidity: false };

    expect(setupWithAmount({ amountSent: 100 }, { amountBounds }).isEnabled).toBe(
      false,
    );
    expect(setupWithAmount({ amountSent: 800 }, { amountBounds }).isEnabled).toBe(
      true,
    );
  });

  it("rejects an amount falling in a hole between providers' bands", () => {
    // Inside [min, max], but one order is filled by one provider and neither
    // band covers 50.
    const amountBounds = {
      min: 1,
      max: 500,
      segments: [
        { min: 1, max: 2 },
        { min: 100, max: 500 },
      ],
      noLiquidity: false,
    };

    expect(setupWithAmount({ amountSent: 50 }, { amountBounds }).isEnabled).toBe(
      false,
    );
    expect(setupWithAmount({ amountSent: 250 }, { amountBounds }).isEnabled).toBe(
      true,
    );
  });

  it("does not enforce segments when they are unknown", () => {
    const result = setupWithAmount(
      { amountSent: 50 },
      { amountBounds: { min: 1, max: 500, noLiquidity: false } },
    );

    expect(result.isEnabled).toBe(true);
  });
});
