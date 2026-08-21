/**
 * Fillable-range math derived from the aggregator order book (GET /v2/markets).
 */
import {
  computeLiquidityEnvelope,
  envelopesEqual,
  fillableQuoteAmount,
  filterOffersForCorridor,
  isAmountFillable,
  isSendAmountOutsideLiquidityBand,
  liquidityMaxMessage,
  liquidityMinMessage,
  nearestFillableAmount,
  nearestFillableMessage,
  noLiquidityMessage,
  shouldSuppressNoProviderForLiquidity,
  minOffRampTokenAmount,
  MIN_SWAP_USD,
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

/**
 * Verbatim from GET /v2/markets — the corridor behind the reported
 * "no provider available" toast for ~2,999,400 cNGN on Base.
 */
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

describe("fillable segments", () => {
  const buyBand = (band: Record<string, unknown>) =>
    offer(BUY_NGN_BASE, { balanceCurrency: "CNGN", rate: 1, ...band });

  it("merges a provider's own tiled bands into one run", () => {
    // The aggregator tiles bands with a hairline gap so they do not overlap;
    // those seams are not holes and must not be reported as such.
    const rows = [
      { min: 0.5, max: 2 },
      { min: 2.000999, max: 7 },
      { min: 7.000999, max: 20 },
      { min: 20.000999, max: 100 },
      { min: 100.000999, max: 500 },
    ].map((band) => buyBand({ ...band, balance: 500 }));

    const envelope = computeLiquidityEnvelope(rows, BUY_NGN_BASE);

    expect(envelope?.segments).toEqual([{ min: 1, max: 500 }]);
    [1, 2, 3, 50, 250, 500].forEach((amount) =>
      expect(isAmountFillable(envelope, amount)).toBe(true),
    );
  });

  it("reports a genuine hole between two providers as separate runs", () => {
    const rows = [
      buyBand({ providerId: "a", min: 0.5, max: 2, balance: 2 }),
      buyBand({ providerId: "b", min: 100, max: 500, balance: 500 }),
    ];

    const envelope = computeLiquidityEnvelope(rows, BUY_NGN_BASE);

    expect(envelope).toMatchObject({ viable: true, min: 1, max: 500 });
    expect(envelope?.segments).toEqual([
      { min: 1, max: 2 },
      { min: 100, max: 500 },
    ]);
    // Inside [min, max] but no single provider covers it.
    expect(isAmountFillable(envelope, 50)).toBe(false);
  });

  it("keeps a narrow hole between large bands intact", () => {
    // A join that scales with the numbers would swallow this 5,000-wide hole
    // simply because the bands are large.
    const rows = [
      buyBand({ providerId: "a", min: 1, max: 1_000_000, balance: 1_000_000 }),
      buyBand({
        providerId: "b",
        min: 1_005_000,
        max: 2_000_000,
        balance: 2_000_000,
      }),
    ];

    const envelope = computeLiquidityEnvelope(rows, BUY_NGN_BASE);

    expect(envelope?.segments).toEqual([
      { min: 1, max: 1_000_000 },
      { min: 1_005_000, max: 2_000_000 },
    ]);
    expect(isAmountFillable(envelope, 1_002_500)).toBe(false);
  });

  it("prefers the larger band when a fractional amount is equidistant", () => {
    // 0.3 is equidistant from 0.2 and 0.4 in decimal but not in binary.
    const rows = [
      offer(SELL_NGN_BASE, {
        providerId: "a",
        min: 0.1,
        max: 0.2,
        rate: 1000,
        balance: 1e9,
        balanceCurrency: "NGN",
      }),
      offer(SELL_NGN_BASE, {
        providerId: "b",
        min: 0.4,
        max: 0.9,
        rate: 1000,
        balance: 1e9,
        balanceCurrency: "NGN",
      }),
    ];

    const envelope = computeLiquidityEnvelope(rows, SELL_NGN_BASE);

    expect(envelope?.segments).toEqual([
      { min: 0.1, max: 0.2 },
      { min: 0.4, max: 0.9 },
    ]);
    expect(nearestFillableAmount(envelope, 0.3)).toBe(0.4);
  });

  it("names the nearest fillable amount across a hole", () => {
    const envelope = computeLiquidityEnvelope(
      [
        buyBand({ providerId: "a", min: 0.5, max: 2, balance: 2 }),
        buyBand({ providerId: "b", min: 100, max: 500, balance: 500 }),
      ],
      BUY_NGN_BASE,
    );

    expect(nearestFillableAmount(envelope, 10)).toBe(2);
    expect(nearestFillableAmount(envelope, 90)).toBe(100);
    // Equidistant between 2 and 100: prefer the larger, not a downgrade.
    expect(nearestFillableAmount(envelope, 51)).toBe(100);
    // Already fillable amounts come back untouched.
    expect(nearestFillableAmount(envelope, 250)).toBe(250);
    // Beyond the ceiling it steers to the ceiling.
    expect(nearestFillableAmount(envelope, 9000)).toBe(500);
  });

  it("does not block when liquidity is unknown or non-viable", () => {
    expect(isAmountFillable(null, 50)).toBe(true);
    const nonViable = computeLiquidityEnvelope(
      [offer(SELL_NGN_BASE, { min: 250, max: 2000, rate: 1386.2 })],
      BUY_NGN_BASE,
    );
    expect(isAmountFillable(nonViable, 50)).toBe(true);
    expect(nearestFillableAmount(nonViable, 50)).toBeNull();
  });

  it("keeps one run for a healthy corridor", () => {
    const envelope = computeLiquidityEnvelope([CNGN_BUY_BASE], BUY_NGN_BASE);
    expect(envelope?.segments).toHaveLength(1);
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

describe("fillableQuoteAmount", () => {
  // Sell corridor: Send units and query units are both the token, so the
  // rescaled query equals the clamped Send amount.
  const sellEnvelope = computeLiquidityEnvelope(
    [
      offer(SELL_NGN_BASE, {
        rate: 1000,
        min: 50,
        max: 7500,
        balance: 100_000_000,
        balanceCurrency: "NGN",
      }),
    ],
    SELL_NGN_BASE,
  );

  it("leaves a fillable amount alone", () => {
    expect(fillableQuoteAmount(sellEnvelope, 1000, 1000)).toBe(1000);
  });

  it("quotes the ceiling instead of an amount above it", () => {
    expect(fillableQuoteAmount(sellEnvelope, 9000, 9000)).toBe(7500);
  });

  it("quotes the floor instead of an amount below it", () => {
    expect(fillableQuoteAmount(sellEnvelope, 0.2, 0.2)).toBe(50);
  });

  it("keeps the quote in token units when Send is fiat", () => {
    // Buy: Send is fiat (1 CNGN per NGN here), the query is the token amount.
    // 5,000 fiat clamps to 500, so a 5,000-token query scales by the same 1/10.
    const buyEnvelope = computeLiquidityEnvelope(
      [
        offer(BUY_NGN_BASE, {
          rate: 1,
          min: 1,
          max: 500,
          balance: 500,
          balanceCurrency: "CNGN",
        }),
      ],
      BUY_NGN_BASE,
    );

    expect(fillableQuoteAmount(buyEnvelope, 5000, 5000)).toBe(500);
  });

  it("passes the amount through when the book is unknown", () => {
    // An outage must not reshape the quote — that is the static-limit path.
    expect(fillableQuoteAmount(null, 9000, 9000)).toBe(9000);
  });

  it("does not rescale away to zero", () => {
    // A tiny query against a much smaller clamp would round to 0, which the
    // aggregator rejects outright; the original stands instead.
    expect(fillableQuoteAmount(sellEnvelope, 1_000_000_000, 0.0001)).toBe(
      0.0001,
    );
  });

  it("ignores a zero or absent Send amount", () => {
    expect(fillableQuoteAmount(sellEnvelope, 0, 100)).toBe(100);
  });
});

describe("no-provider toast suppression", () => {
  const buyBand = (band: Record<string, unknown>) =>
    offer(BUY_NGN_BASE, { balanceCurrency: "CNGN", rate: 1, ...band });

  const envelope = computeLiquidityEnvelope(
    [buyBand({ min: 900, max: 10_000_000, balance: 2_995_665 })],
    BUY_NGN_BASE,
  );

  it("treats amounts above max as outside the band", () => {
    expect(isSendAmountOutsideLiquidityBand(envelope, 10_000_000)).toBe(true);
    expect(isSendAmountOutsideLiquidityBand(envelope, 2_995_665)).toBe(false);
  });

  it("treats amounts below min as outside the band", () => {
    expect(isSendAmountOutsideLiquidityBand(envelope, 500)).toBe(true);
    expect(isSendAmountOutsideLiquidityBand(envelope, 900)).toBe(false);
  });

  it("does not treat inter-provider gaps as outside the band", () => {
    const gapEnvelope = computeLiquidityEnvelope(
      [
        buyBand({ providerId: "a", min: 0.5, max: 2, balance: 2 }),
        buyBand({ providerId: "b", min: 100, max: 500, balance: 500 }),
      ],
      BUY_NGN_BASE,
    );

    expect(isSendAmountOutsideLiquidityBand(gapEnvelope, 50)).toBe(false);
    expect(shouldSuppressNoProviderForLiquidity(gapEnvelope, 50)).toBe(true);
  });

  it("suppresses legacy no-provider UX when the form already explains the limit", () => {
    expect(shouldSuppressNoProviderForLiquidity(envelope, 10_000_000)).toBe(
      true,
    );
    expect(shouldSuppressNoProviderForLiquidity(envelope, 1_500_000)).toBe(
      false,
    );
    expect(shouldSuppressNoProviderForLiquidity(null, 10_000_000)).toBe(false);
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
    expect(nearestFillableMessage(100, "buy", "NGN", "cNGN")).toBe(
      "Try ₦100 — the nearest amount available right now",
    );
  });
});

describe("minOffRampTokenAmount", () => {
  it("returns MIN_SWAP_USD for USD-pegged tokens", () => {
    expect(minOffRampTokenAmount("USDC", null)).toEqual({
      status: "ok",
      min: MIN_SWAP_USD,
    });
  });

  it("scales cNGN by rate when available", () => {
    expect(minOffRampTokenAmount("cNGN", 1500)).toEqual({
      status: "ok",
      min: MIN_SWAP_USD * 1500,
    });
  });

  it("returns unavailable when cNGN rate is missing", () => {
    expect(minOffRampTokenAmount("cNGN", null)).toEqual({
      status: "cngn_rate_unavailable",
    });
    expect(minOffRampTokenAmount("CNGN", 0)).toEqual({
      status: "cngn_rate_unavailable",
    });
  });
});
