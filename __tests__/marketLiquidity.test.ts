/**
 * Fillable-range math derived from the aggregator order book (GET /v2/markets).
 */
import {
  computeLiquidityEnvelope,
  envelopesEqual,
  filterOffersForCorridor,
  liquidityMaxMessage,
  liquidityMinMessage,
  noLiquidityMessage,
  type LiquidityCorridor,
} from "../app/lib/marketLiquidity";

const BUY_NGN_BASE: LiquidityCorridor = {
  side: "buy",
  token: "CNGN",
  currency: "NGN",
  network: "base",
};
const SELL_NGN_BASE: LiquidityCorridor = {
  side: "sell",
  token: "USDC",
  currency: "NGN",
  network: "base",
};

/** Fills in the corridor fields so a fixture only states what it is testing. */
function offer(
  corridor: LiquidityCorridor,
  fields: Record<string, unknown>,
): Record<string, unknown> {
  return {
    side: corridor.side,
    token: corridor.token,
    fiat: corridor.currency,
    network: corridor.network,
    ...fields,
  };
}

describe("filterOffersForCorridor", () => {
  // Unfiltered, the endpoint serves every corridor in one array; this is what
  // stops another corridor's depth being read as this one's if a request
  // filter is ever dropped.
  const book = [
    offer(BUY_NGN_BASE, { min: 900, max: 10_000_000 }),
    offer(SELL_NGN_BASE, { min: 250, max: 2000 }),
    offer(
      { side: "buy", token: "CNGN", currency: "NGN", network: "polygon" },
      { min: 1, max: 2 },
    ),
    offer(
      { side: "buy", token: "USDC", currency: "NGN", network: "base" },
      { min: 1, max: 2 },
    ),
    offer(
      { side: "buy", token: "CNGN", currency: "KES", network: "base" },
      { min: 1, max: 2 },
    ),
  ];

  it("keeps only rows matching side, token, fiat and network", () => {
    const filtered = filterOffersForCorridor(book, BUY_NGN_BASE);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toMatchObject({ min: 900 });
  });

  it("matches codes case-insensitively", () => {
    const filtered = filterOffersForCorridor(
      [offer(BUY_NGN_BASE, { token: "cngn", network: "Base", min: 5, max: 9 })],
      BUY_NGN_BASE,
    );
    expect(filtered).toHaveLength(1);
  });
});

describe("computeLiquidityEnvelope", () => {
  it("returns null for an empty book so callers keep their static limits", () => {
    expect(computeLiquidityEnvelope([], BUY_NGN_BASE)).toBeNull();
  });

  it("reports non-viable when the book has rows but none for this corridor", () => {
    const book = [offer(SELL_NGN_BASE, { min: 250, max: 2000, rate: 1386.2 })];
    expect(computeLiquidityEnvelope(book, BUY_NGN_BASE)).toMatchObject({
      viable: false,
      min: null,
      max: null,
    });
  });

  it("ignores other corridors when computing the band", () => {
    const book = [
      offer(BUY_NGN_BASE, {
        min: 900,
        max: 5000,
        balance: 5000,
        balanceCurrency: "CNGN",
        rate: 1,
      }),
      // Far deeper, but a different network — must not raise this ceiling.
      offer(
        { side: "buy", token: "CNGN", currency: "NGN", network: "polygon" },
        {
          min: 900,
          max: 9_000_000,
          balance: 9_000_000,
          balanceCurrency: "CNGN",
          rate: 1,
        },
      ),
    ];
    expect(computeLiquidityEnvelope(book, BUY_NGN_BASE)?.max).toBe(5000);
  });

  it("caps a buy by the provider's token balance", () => {
    const book = [
      offer(BUY_NGN_BASE, {
        min: 10,
        max: 1_000_000,
        balance: 2000,
        balanceCurrency: "CNGN",
        rate: 1,
      }),
    ];
    expect(computeLiquidityEnvelope(book, BUY_NGN_BASE)?.max).toBe(2000);
  });

  it("converts a fiat-denominated sell balance into token units", () => {
    // balance is NGN on sell rows; 1,386,200 NGN / 1386.2 = 1000 USDC.
    const book = [
      offer(SELL_NGN_BASE, {
        min: 250,
        max: 2000,
        balance: 1_386_200,
        balanceCurrency: "NGN",
        rate: 1386.2,
      }),
    ];
    expect(computeLiquidityEnvelope(book, SELL_NGN_BASE)).toMatchObject({
      viable: true,
      min: 250,
      max: 1000,
    });
  });

  it("takes the envelope across providers rather than summing balances", () => {
    const book = [
      offer(BUY_NGN_BASE, {
        providerId: "a",
        min: 100,
        max: 5000,
        balance: 5000,
        balanceCurrency: "CNGN",
        rate: 1,
      }),
      offer(BUY_NGN_BASE, {
        providerId: "b",
        min: 50,
        max: 3000,
        balance: 3000,
        balanceCurrency: "CNGN",
        rate: 1,
      }),
    ];
    // Not 8000: a single order is filled by a single provider.
    expect(computeLiquidityEnvelope(book, BUY_NGN_BASE)).toMatchObject({
      min: 50,
      max: 5000,
      offerCount: 2,
    });
  });

  it("does not let a high-rate small offer inflate the ceiling of a bigger one", () => {
    const book = [
      offer(BUY_NGN_BASE, {
        min: 1,
        max: 10,
        balance: 10,
        balanceCurrency: "CNGN",
        rate: 100,
      }),
      offer(BUY_NGN_BASE, {
        min: 1,
        max: 5000,
        balance: 5000,
        balanceCurrency: "CNGN",
        rate: 1,
      }),
    ];
    expect(computeLiquidityEnvelope(book, BUY_NGN_BASE)).toMatchObject({
      min: 1,
      max: 5000,
      bestRate: 1,
    });
  });

  it("marks a corridor whose only offers exceed their float as non-viable", () => {
    const book = [
      offer(BUY_NGN_BASE, {
        min: 1000,
        max: 5000,
        balance: 10,
        balanceCurrency: "CNGN",
        rate: 1,
      }),
    ];
    expect(computeLiquidityEnvelope(book, BUY_NGN_BASE)).toMatchObject({
      viable: false,
    });
  });

  it("skips offers with an unusable rate but keeps the rest", () => {
    const book = [
      offer(BUY_NGN_BASE, { min: 1, max: 100, balance: 100, rate: 0 }),
      offer(BUY_NGN_BASE, {
        min: 2,
        max: 200,
        balance: 200,
        balanceCurrency: "CNGN",
        rate: 1,
      }),
    ];
    expect(computeLiquidityEnvelope(book, BUY_NGN_BASE)).toMatchObject({
      viable: true,
      min: 2,
      max: 200,
      offerCount: 1,
    });
  });

  it("rounds inward so an accepted amount stays fillable", () => {
    const buy = computeLiquidityEnvelope(
      [
        offer(BUY_NGN_BASE, {
          min: 1.2,
          max: 100.9,
          balance: 100.9,
          balanceCurrency: "CNGN",
          rate: 1,
        }),
      ],
      BUY_NGN_BASE,
    );
    expect(buy).toMatchObject({ min: 2, max: 100 });

    const sell = computeLiquidityEnvelope(
      [
        offer(SELL_NGN_BASE, {
          min: 0.500009,
          max: 10.99999,
          balance: 1e9,
          balanceCurrency: "NGN",
          rate: 1,
        }),
      ],
      SELL_NGN_BASE,
    );
    expect(sell).toMatchObject({ min: 0.5001, max: 10.9999 });
  });

  it("falls back to unknown when a buy band rounds away to nothing", () => {
    // Sub-unit fiat bounds would floor to a zero ceiling; unknown is safer
    // than telling the user the maximum is 0.
    const book = [
      offer(BUY_NGN_BASE, {
        min: 0.0001,
        max: 0.001,
        balance: 1,
        balanceCurrency: "CNGN",
        rate: 0.1,
      }),
    ];
    expect(computeLiquidityEnvelope(book, BUY_NGN_BASE)).toBeNull();
  });

  it("ignores a missing balance instead of discarding the offer", () => {
    const book = [offer(BUY_NGN_BASE, { min: 10, max: 500, rate: 1 })];
    expect(computeLiquidityEnvelope(book, BUY_NGN_BASE)).toMatchObject({
      viable: true,
      max: 500,
    });
  });
});

describe("computeLiquidityEnvelope against live book rows", () => {
  // Verbatim from GET /v2/markets — the corridor behind the reported
  // "no provider available" toast for ~2,999,400 cNGN on Base.
  const CNGN_BUY_BASE = {
    providerId: "LJByJEHF",
    side: "buy",
    token: "CNGN",
    fiat: "NGN",
    network: "base",
    rate: "1.0002",
    rateType: "fixed",
    min: "900",
    max: "10000000",
    minFlatFee: "100",
    maxFlatFee: "1000",
    balance: "2995066.125456",
    balanceCurrency: "CNGN",
    balanceUsd: "2140.6020179506421664",
  };

  it("caps cNGN on Base at the provider's float, not the 10M order band", () => {
    const envelope = computeLiquidityEnvelope([CNGN_BUY_BASE], BUY_NGN_BASE);

    expect(envelope).toMatchObject({ viable: true, min: 901, max: 2_995_665 });
    // The amount that failed at ValidateRate is now rejected by the form.
    expect(2_999_400).toBeGreaterThan(envelope!.max!);
  });

  it("reports no liquidity for a corridor whose provider float is dust", () => {
    // Every USDC/Base buy band from this provider sits above its 0.039 USDC float.
    const rows = [
      { min: "0.5", max: "2", rate: "1414.17" },
      { min: "2.000999", max: "7", rate: "1411.17" },
      { min: "100.000999", max: "500", rate: "1406.17" },
    ].map((band) => ({
      providerId: "FZvfAEyg",
      side: "buy",
      token: "USDC",
      fiat: "NGN",
      network: "base",
      balance: "0.039659",
      balanceCurrency: "USDC",
      ...band,
    }));

    const envelope = computeLiquidityEnvelope(rows, {
      side: "buy",
      token: "USDC",
      currency: "NGN",
      network: "base",
    });

    expect(envelope).toMatchObject({ viable: false });
  });

  it("reads a real sell row's fiat balance as a token cap", () => {
    const row = {
      providerId: "kVMyxKfB",
      side: "sell",
      token: "USDC",
      fiat: "NGN",
      network: "base",
      rate: "1386.2",
      min: "250",
      max: "2000",
      balance: "84489679.9110991",
      balanceCurrency: "NGN",
    };

    // 84,489,679 NGN of float is far more than the 2000 USDC band allows.
    expect(computeLiquidityEnvelope([row], SELL_NGN_BASE)).toMatchObject({
      viable: true,
      min: 250,
      max: 2000,
    });
  });
});

describe("envelopesEqual", () => {
  const band = [
    offer(BUY_NGN_BASE, {
      min: 10,
      max: 500,
      balance: 500,
      balanceCurrency: "CNGN",
      rate: 1,
    }),
  ];
  const base = computeLiquidityEnvelope(band, BUY_NGN_BASE);

  it("treats identical bands as equal across polls", () => {
    expect(
      envelopesEqual(base, computeLiquidityEnvelope(band, BUY_NGN_BASE)),
    ).toBe(true);
  });

  it("detects a moved ceiling", () => {
    const moved = computeLiquidityEnvelope(
      [
        offer(BUY_NGN_BASE, {
          min: 10,
          max: 400,
          balance: 400,
          balanceCurrency: "CNGN",
          rate: 1,
        }),
      ],
      BUY_NGN_BASE,
    );
    expect(envelopesEqual(base, moved)).toBe(false);
  });

  it("handles nulls", () => {
    expect(envelopesEqual(null, null)).toBe(true);
    expect(envelopesEqual(base, null)).toBe(false);
  });
});

describe("copy", () => {
  it("phrases limits as current availability, not standing rules", () => {
    expect(liquidityMaxMessage(2_995_665, "buy", "NGN", "cNGN")).toBe(
      "Up to ₦2,995,665 available right now",
    );
    expect(liquidityMaxMessage(8000, "sell", "NGN", "USDC")).toBe(
      "Up to 8,000 USDC available right now",
    );
    expect(liquidityMinMessage(500, "buy", "NGN", "cNGN")).toBe(
      "Minimum for available offers is ₦500",
    );
    expect(noLiquidityMessage("cNGN", "Base")).toBe(
      "No liquidity available for cNGN on Base right now",
    );
  });
});
