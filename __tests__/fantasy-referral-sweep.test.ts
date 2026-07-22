import {
  cumulativeActivation,
  txUsdValue,
  type ReferralTx,
} from "@/app/lib/fantasy/referral-math";

const settings = { referral_min_total_usd: 5, cngn_usd_rate: 0.00065 };

const tx = (over: Partial<ReferralTx>): ReferralTx => ({
  transaction_type: "offramp",
  from_currency: "USDC",
  to_currency: "NGN",
  amount_sent: 0,
  amount_received: 0,
  created_at: "2026-07-05T10:00:00Z",
  ...over,
});

describe("txUsdValue", () => {
  it("values an offramp by the crypto side sent", () => {
    expect(txUsdValue(tx({ amount_sent: 3, amount_received: 4500 }), 0.00065)).toBe(3);
  });

  it("values an onramp by the crypto side received", () => {
    expect(
      txUsdValue(
        tx({
          transaction_type: "onramp",
          from_currency: "NGN",
          to_currency: "USDT",
          amount_sent: 15000,
          amount_received: 9.4,
        }),
        0.00065,
      ),
    ).toBe(9.4);
  });

  it("treats USDC/USDT/CUSD at par regardless of case", () => {
    for (const c of ["usdc", "USDT", "cUsd"]) {
      expect(txUsdValue(tx({ from_currency: c, amount_sent: 2 }), 0.00065)).toBe(2);
    }
  });

  it("converts CNGN at the settings rate", () => {
    expect(txUsdValue(tx({ from_currency: "CNGN", amount_sent: 10000 }), 0.00065)).toBeCloseTo(
      6.5,
    );
  });

  it("ignores unknown currencies", () => {
    expect(txUsdValue(tx({ from_currency: "BTC", amount_sent: 1 }), 0.00065)).toBe(0);
  });
});

describe("cumulativeActivation (cumulative ≥ $5, NOT single-tx)", () => {
  it("activates on the transaction that crosses the threshold, keeping its timestamp", () => {
    const result = cumulativeActivation(
      [
        tx({ amount_sent: 2, created_at: "2026-07-05T10:00:00Z" }),
        tx({ amount_sent: 2, created_at: "2026-07-06T10:00:00Z" }),
        tx({ amount_sent: 2, created_at: "2026-07-07T10:00:00Z" }),
      ],
      settings,
    );
    expect(result.total).toBe(6);
    expect(result.activatedAt).toBe("2026-07-07T10:00:00Z");
  });

  it("crossing timestamp is chronological even when input is unsorted", () => {
    const result = cumulativeActivation(
      [
        tx({ amount_sent: 3, created_at: "2026-07-08T10:00:00Z" }),
        tx({ amount_sent: 3, created_at: "2026-07-05T10:00:00Z" }),
        tx({ amount_sent: 3, created_at: "2026-07-06T10:00:00Z" }),
      ],
      settings,
    );
    // 3 (Jul 5) + 3 (Jul 6) = 6 crosses on the 6th, not on the later-listed 8th.
    expect(result.activatedAt).toBe("2026-07-06T10:00:00Z");
  });

  it("activates on exact threshold equality", () => {
    const result = cumulativeActivation(
      [
        tx({ amount_sent: 2.5, created_at: "2026-07-05T10:00:00Z" }),
        tx({ amount_sent: 2.5, created_at: "2026-07-06T10:00:00Z" }),
      ],
      settings,
    );
    expect(result.total).toBe(5);
    expect(result.activatedAt).toBe("2026-07-06T10:00:00Z");
  });

  it("a single large transaction still activates", () => {
    const result = cumulativeActivation([tx({ amount_sent: 10 })], settings);
    expect(result.activatedAt).toBe("2026-07-05T10:00:00Z");
  });

  it("does not activate below the threshold", () => {
    const result = cumulativeActivation(
      [tx({ amount_sent: 2 }), tx({ amount_sent: 2.99 })],
      settings,
    );
    expect(result.total).toBe(4.99);
    expect(result.activatedAt).toBeNull();
  });

  it("mixes stables and CNGN in one cumulative total", () => {
    const result = cumulativeActivation(
      [
        tx({ amount_sent: 3, created_at: "2026-07-05T10:00:00Z" }),
        tx({ from_currency: "CNGN", amount_sent: 4000, created_at: "2026-07-06T10:00:00Z" }),
      ],
      settings,
    );
    // 3 + 4000×0.00065 = 5.6
    expect(result.total).toBeCloseTo(5.6);
    expect(result.activatedAt).toBe("2026-07-06T10:00:00Z");
  });

  it("unknown-currency transactions never contribute", () => {
    const result = cumulativeActivation(
      [tx({ from_currency: "BTC", amount_sent: 100 })],
      settings,
    );
    expect(result.total).toBe(0);
    expect(result.activatedAt).toBeNull();
  });
});
