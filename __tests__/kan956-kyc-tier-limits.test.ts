/**
 * @jest-environment node
 */

jest.mock("../app/lib/kyc-identity", () => ({
  resolveIdentityScope: jest.fn(),
}));

jest.mock("../app/lib/supabase", () => ({
  supabaseAdmin: { rpc: jest.fn() },
}));

import {
  MAX_KYC_TIER,
  getKycMonthlyLimitsRecord,
  getKycTierLimit,
} from "../app/lib/kyc-tier-limits";
import {
  getKycModalTargetTier,
  getKycUpgradeStep,
} from "../app/lib/kyc-upgrade-path";
import { resolveIdentityScope } from "../app/lib/kyc-identity";
import { supabaseAdmin } from "../app/lib/supabase";
import { executeSwapTransactionLimitCheck } from "../app/lib/swap-transaction-limit-server";

const mockedResolveIdentityScope = resolveIdentityScope as jest.Mock;
const mockedRpc = supabaseAdmin.rpc as jest.Mock;

const ENV_KEYS = [
  "NEXT_PUBLIC_KYC_TIER_3_MONTHLY",
  "NEXT_PUBLIC_AGGREGATOR_URL",
] as const;
const originalEnv: Record<string, string | undefined> = {};

beforeAll(() => {
  for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

// The local .env can override tier limits; assert the library defaults.
beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

describe("KAN-956 tier limits", () => {
  it("defaults tier 3 to $50,000/month", () => {
    expect(getKycTierLimit(3)).toEqual({ monthly: 50000, unlimited: false });
    expect(getKycMonthlyLimitsRecord()[3]).toBe(50000);
  });

  it("still lets NEXT_PUBLIC_KYC_TIER_3_MONTHLY override the default tier 3 cap", () => {
    process.env.NEXT_PUBLIC_KYC_TIER_3_MONTHLY = "unlimited";
    expect(getKycTierLimit(3)).toEqual({ monthly: 0, unlimited: true });
  });

  it("makes tier 4 the unlimited tier and the new ceiling", () => {
    expect(MAX_KYC_TIER).toBe(4);
    expect(getKycTierLimit(4)).toEqual({ monthly: 0, unlimited: true });
    const record = getKycMonthlyLimitsRecord();
    expect(Number.isFinite(record[4])).toBe(true);
    expect(record[4]).toBe(0);
  });

  it("fails closed for tiers outside 0-4", () => {
    expect(getKycTierLimit(5)).toEqual({ monthly: 0, unlimited: false });
    expect(getKycTierLimit(-1)).toEqual({ monthly: 0, unlimited: false });
  });
});

describe("KAN-956 server limit check", () => {
  const WALLET = "0x1111111111111111111111111111111111111111";
  const body = {
    transactionType: "offramp",
    fromCurrency: "USDC",
    toCurrency: "NGN",
    amountSent: "10",
    amountReceived: "15000",
    fee: "0",
    recipient: {},
    status: "pending",
  };
  const opts = { dryRun: true, explorerLink: null, normalizedEmail: null };

  beforeEach(() => {
    mockedResolveIdentityScope.mockReset();
    mockedRpc.mockReset();
    mockedRpc.mockResolvedValue({ data: { ok: true }, error: null });
  });

  it("sends no cap (null) to the RPC for a tier 4 identity", async () => {
    mockedResolveIdentityScope.mockResolvedValue({
      effectiveTier: 4,
      wallets: [WALLET],
      identityKeys: [],
    });
    const result = await executeSwapTransactionLimitCheck(WALLET, body, opts);
    expect(result.kind).toBe("success");
    expect(mockedRpc.mock.calls[0][1].p_monthly_limit).toBeNull();
  });

  it("sends the $50,000 cap to the RPC for a tier 3 identity", async () => {
    mockedResolveIdentityScope.mockResolvedValue({
      effectiveTier: 3,
      wallets: [WALLET],
      identityKeys: [],
    });
    await executeSwapTransactionLimitCheck(WALLET, body, opts);
    expect(mockedRpc.mock.calls[0][1].p_monthly_limit).toBe(50000);
  });
});

describe("KAN-956 upgrade path", () => {
  it("keeps the existing personal steps for tiers 0-2", () => {
    expect(getKycUpgradeStep(0)).toBe("phone");
    expect(getKycUpgradeStep(1)).toBe("id");
    expect(getKycUpgradeStep(2)).toBe("address");
    expect(getKycModalTargetTier(1)).toBe(2);
    expect(getKycModalTargetTier(2)).toBe(3);
  });

  it("points a tier 3 user at the tier 4 business upgrade", () => {
    expect(getKycUpgradeStep(3)).toBe("business");
    expect(MAX_KYC_TIER).toBe(4);
    // No dedicated business verification modal exists yet, so the existing
    // KycModal still opens the address (tier 3) flow on click.
    expect(getKycModalTargetTier(3)).toBe(3);
  });
});
