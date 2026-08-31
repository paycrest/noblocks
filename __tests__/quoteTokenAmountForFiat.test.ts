import {
  MAX_QUOTE_DECIMALS,
  getQuoteDecimals,
  quoteTokenAmountForFiat,
} from "../app/utils";

/** What the aggregator pays out: token amount x rate, rounded to the fiat's decimals. */
const payout = (tokenAmount: number, rate: number) =>
  Math.round(tokenAmount * rate * 100) / 100;

describe("quoteTokenAmountForFiat", () => {
  it("pays the full quote for the KAN-784 order that came up short", () => {
    // 50000 / 1370.79 = 36.47531714..., which 4dp rounding cut to 36.4753 and
    // the aggregator paid out as NGN 49,999.98.
    const amount = quoteTokenAmountForFiat(50000, 1370.79, 6);

    expect(amount).toBe(36.475318);
    expect(payout(amount, 1370.79)).toBe(50000);
    expect(payout(36.4753, 1370.79)).toBe(49999.98); // the old behaviour
  });

  it("never quotes below the fiat the recipient was promised", () => {
    const rate = 1370.79;
    for (let fiat = 1000; fiat <= 200000; fiat += 137) {
      const amount = quoteTokenAmountForFiat(fiat, rate, 6);
      expect(amount * rate).toBeGreaterThanOrEqual(fiat);
      expect(payout(amount, rate)).toBeGreaterThanOrEqual(fiat);
    }
  });

  it("overpays by at most one subunit", () => {
    const rate = 1370.79;
    for (let fiat = 1000; fiat <= 200000; fiat += 137) {
      const amount = quoteTokenAmountForFiat(fiat, rate, 6);
      expect(amount - fiat / rate).toBeLessThanOrEqual(1e-6);
    }
  });

  it("does not charge an extra subunit for an exact division", () => {
    expect(quoteTokenAmountForFiat(1400, 1400, 6)).toBe(1);
    expect(quoteTokenAmountForFiat(4112.37, 1370.79, 6)).toBe(3);
    expect(quoteTokenAmountForFiat(68539.5, 1370.79, 6)).toBe(50);
  });

  it("caps precision so 18-decimal tokens keep a readable amount", () => {
    const amount = quoteTokenAmountForFiat(50000, 1370.79, 18);

    expect(amount).toBe(36.475318);
    expect(payout(amount, 1370.79)).toBe(50000);
  });

  it("honours a token coarser than the cap", () => {
    const amount = quoteTokenAmountForFiat(50000, 1370.79, 2);

    expect(amount).toBe(36.48);
    expect(payout(amount, 1370.79)).toBeGreaterThanOrEqual(50000);
  });

  it("returns 0 rather than NaN for unusable input", () => {
    expect(quoteTokenAmountForFiat(50000, 0, 6)).toBe(0);
    expect(quoteTokenAmountForFiat(50000, -1, 6)).toBe(0);
    expect(quoteTokenAmountForFiat(NaN, 1370.79, 6)).toBe(0);
    expect(quoteTokenAmountForFiat(50000, NaN, 6)).toBe(0);
  });
});

describe("getQuoteDecimals", () => {
  it("caps at the quote maximum", () => {
    expect(getQuoteDecimals(18)).toBe(MAX_QUOTE_DECIMALS);
    expect(getQuoteDecimals(6)).toBe(6);
    expect(getQuoteDecimals(2)).toBe(2);
  });

  it("falls back to the cap when the token is unknown", () => {
    expect(getQuoteDecimals(undefined)).toBe(MAX_QUOTE_DECIMALS);
    expect(getQuoteDecimals(0)).toBe(MAX_QUOTE_DECIMALS);
  });
});
