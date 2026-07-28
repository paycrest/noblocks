/**
 * Fillable-range math derived from the aggregator order book (GET /v2/markets).
 */
import {
  computeLiquidityEnvelope,
  envelopesEqual,
  liquidityMaxMessage,
  liquidityMinMessage,
  noLiquidityMessage,
} from "../app/lib/marketLiquidity";

describe("computeLiquidityEnvelope", () => {
  it("returns null for an empty book so callers keep their static limits", () => {
    expect(computeLiquidityEnvelope([], "buy")).toBeNull();
    expect(computeLiquidityEnvelope([], "sell")).toBeNull();
  });

  it("converts buy bounds to fiat using each offer's own rate", () => {
    const envelope = computeLiquidityEnvelope(
      [{ min: 10, max: 1000, balance: 1000, rate: 1.5 }],
      "buy",
    );
    expect(envelope).toMatchObject({ viable: true, min: 15, max: 1500 });
  });

  it("caps the buy max by the provider's token balance", () => {
    const envelope = computeLiquidityEnvelope(
      [{ min: 10, max: 1_000_000, balance: 2000, rate: 1 }],
      "buy",
    );
    expect(envelope?.max).toBe(2000);
  });

  it("takes the envelope across providers rather than summing balances", () => {
    const envelope = computeLiquidityEnvelope(
      [
        { min: 100, max: 5000, balance: 5000, rate: 1 },
        { min: 50, max: 3000, balance: 3000, rate: 1 },
      ],
      "buy",
    );
    // Not 8000: a single order is filled by a single provider.
    expect(envelope).toMatchObject({ min: 50, max: 5000, offerCount: 2 });
  });

  it("does not let a high-rate small offer inflate the ceiling of a bigger one", () => {
    const envelope = computeLiquidityEnvelope(
      [
        { min: 1, max: 10, balance: 10, rate: 100 }, // fiat band 100..1000
        { min: 1, max: 5000, balance: 5000, rate: 1 }, // fiat band 1..5000
      ],
      "buy",
    );
    expect(envelope?.max).toBe(5000);
    expect(envelope?.min).toBe(1);
    expect(envelope?.bestRate).toBe(1);
  });

  it("keeps sell bounds in token units without rate conversion", () => {
    const envelope = computeLiquidityEnvelope(
      [{ min: 0.5, max: 8000, balance: 12_000_000, rate: 1500 }],
      "sell",
    );
    expect(envelope).toMatchObject({ viable: true, min: 0.5, max: 8000 });
  });

  it("parses string numerics", () => {
    const envelope = computeLiquidityEnvelope(
      [{ min: "10", max: "500", balance: "500", rate: "2" }],
      "buy",
    );
    expect(envelope).toMatchObject({ min: 20, max: 1000 });
  });

  it("marks a book with rows but no fillable offer as non-viable", () => {
    const envelope = computeLiquidityEnvelope(
      [{ min: 1000, max: 5000, balance: 10, rate: 1 }],
      "buy",
    );
    expect(envelope).toMatchObject({ viable: false, min: null, max: null });
  });

  it("skips offers with an unusable rate but keeps the rest", () => {
    const envelope = computeLiquidityEnvelope(
      [
        { min: 1, max: 100, balance: 100, rate: 0 },
        { min: 2, max: 200, balance: 200, rate: 1 },
      ],
      "buy",
    );
    expect(envelope).toMatchObject({ viable: true, min: 2, max: 200, offerCount: 1 });
  });

  it("rounds inward so an accepted amount stays fillable", () => {
    const buy = computeLiquidityEnvelope(
      [{ min: 1.2, max: 100.9, balance: 100.9, rate: 1 }],
      "buy",
    );
    expect(buy).toMatchObject({ min: 2, max: 100 });

    const sell = computeLiquidityEnvelope(
      [{ min: 0.500009, max: 10.99999, balance: 1e9, rate: 1 }],
      "sell",
    );
    expect(sell).toMatchObject({ min: 0.5001, max: 10.9999 });
  });

  it("falls back to unknown when a buy band rounds away to nothing", () => {
    // Sub-unit fiat bounds would floor to a zero ceiling; unknown is safer
    // than telling the user the maximum is 0.
    expect(
      computeLiquidityEnvelope(
        [{ min: 0.0001, max: 0.001, balance: 1, rate: 0.1 }],
        "buy",
      ),
    ).toBeNull();
  });

  it("ignores a missing balance instead of discarding the offer", () => {
    const envelope = computeLiquidityEnvelope(
      [{ min: 10, max: 500, rate: 1 }],
      "buy",
    );
    expect(envelope).toMatchObject({ viable: true, max: 500 });
  });
});

describe("envelopesEqual", () => {
  const base = computeLiquidityEnvelope(
    [{ min: 10, max: 500, balance: 500, rate: 1 }],
    "buy",
  );

  it("treats identical bands as equal across polls", () => {
    const next = computeLiquidityEnvelope(
      [{ min: 10, max: 500, balance: 500, rate: 1 }],
      "buy",
    );
    expect(envelopesEqual(base, next)).toBe(true);
  });

  it("detects a moved ceiling", () => {
    const next = computeLiquidityEnvelope(
      [{ min: 10, max: 400, balance: 400, rate: 1 }],
      "buy",
    );
    expect(envelopesEqual(base, next)).toBe(false);
  });

  it("handles nulls", () => {
    expect(envelopesEqual(null, null)).toBe(true);
    expect(envelopesEqual(base, null)).toBe(false);
  });
});

describe("copy", () => {
  it("phrases limits as current availability, not standing rules", () => {
    expect(liquidityMaxMessage(2_300_000, "buy", "NGN", "cNGN")).toBe(
      "Up to ₦2,300,000 available right now",
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
