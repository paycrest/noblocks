import {
  MAX_QUOTE_DECIMALS,
  ONRAMP_FIAT_DECIMALS,
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

  it("returns 0 for a nonpositive fiat target rather than a negative amount", () => {
    // Rounding up through zero would also round the wrong way: Math.ceil(-729.5)
    // is -729, shrinking the magnitude instead of growing it.
    expect(quoteTokenAmountForFiat(-1, 1370.79, 6)).toBe(0);
    expect(quoteTokenAmountForFiat(-50000, 1370.79, 6)).toBe(0);
    expect(quoteTokenAmountForFiat(0, 1370.79, 6)).toBe(0);
  });
});

describe("onramp Send precision", () => {
  // `amountSent` is fiat on onramp, so it must not follow the token's decimals:
  // the form picks ONRAMP_FIAT_DECIMALS over quoteDecimals when isSwapped.
  const amountSentDecimals = (isSwapped: boolean, tokenDecimals: number) =>
    isSwapped ? ONRAMP_FIAT_DECIMALS : getQuoteDecimals(tokenDecimals);

  it("keeps four places on onramp whatever the token's precision", () => {
    expect(amountSentDecimals(true, 6)).toBe(4);
    expect(amountSentDecimals(true, 18)).toBe(4);
    expect(amountSentDecimals(true, 2)).toBe(4);
  });

  it("follows the token only on offramp", () => {
    expect(amountSentDecimals(false, 6)).toBe(6);
    expect(amountSentDecimals(false, 18)).toBe(MAX_QUOTE_DECIMALS);
    expect(amountSentDecimals(false, 2)).toBe(2);
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
