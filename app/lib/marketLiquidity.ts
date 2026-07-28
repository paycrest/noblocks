/**
 * Turns the aggregator's provider order book (GET /v2/markets) into the range
 * of Send-field amounts that at least one provider can actually fill.
 *
 * An order is assigned to a single provider, so the range is the envelope
 * across offers — never the sum of their balances.
 */

import type { RateSide, V2MarketOffer } from "../types";
import { formatNumberWithCommas, getCurrencySymbol } from "../utils";

export type LiquidityEnvelope = {
  /** False when the book has rows but none can fill an order right now. */
  viable: boolean;
  side: RateSide;
  /** Bounds in Send-field units: fiat on buy (onramp), token on sell (offramp). */
  min: number | null;
  max: number | null;
  /** Cheapest fiat-per-token among viable offers. */
  bestRate: number | null;
  offerCount: number;
};

/** Send amounts accept at most 4 decimals, so token bounds round to the same. */
const TOKEN_DECIMALS = 4;

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function floorTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.floor(value * factor) / factor;
}

function ceilTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.ceil(value * factor) / factor;
}

/**
 * How much of `offer` a single order can consume, in token units.
 *
 * On buy the provider pays out tokens, so its token float caps the order. On
 * sell the balance is the provider's fiat float — the denomination is not
 * guaranteed across corridors, so sell falls back to the band alone rather
 * than risk capping a healthy offer with a misread number.
 */
function offerCapInTokens(offer: V2MarketOffer, side: RateSide): number | null {
  const max = toFiniteNumber(offer.max);
  if (max === null) return null;
  if (side === "sell") return max;

  const balance = toFiniteNumber(offer.balance);
  if (balance === null) return max;
  return Math.min(max, balance);
}

/**
 * @returns the fillable envelope, or `null` when the book says nothing usable
 * (empty response, or numbers that fail a sanity check). Callers treat `null`
 * as unknown and keep their static limits — a thin or unreachable book must
 * never lock a user out.
 */
export function computeLiquidityEnvelope(
  offers: V2MarketOffer[],
  side: RateSide,
): LiquidityEnvelope | null {
  if (!Array.isArray(offers) || offers.length === 0) return null;

  let min: number | null = null;
  let max: number | null = null;
  let bestRate: number | null = null;
  let viableCount = 0;

  for (const offer of offers) {
    const offerMin = toFiniteNumber(offer.min);
    const rate = toFiniteNumber(offer.rate);
    const cap = offerCapInTokens(offer, side);

    if (offerMin === null || cap === null || offerMin < 0) continue;
    if (rate === null || rate <= 0) continue;
    if (cap < offerMin) continue;

    // Convert per offer: a high-rate provider with a small cap must not
    // inflate the fiat ceiling of a low-rate provider's band.
    const lower = side === "buy" ? offerMin * rate : offerMin;
    const upper = side === "buy" ? cap * rate : cap;

    viableCount += 1;
    if (min === null || lower < min) min = lower;
    if (max === null || upper > max) max = upper;
    if (bestRate === null || rate < bestRate) bestRate = rate;
  }

  if (viableCount === 0 || min === null || max === null) {
    return {
      viable: false,
      side,
      min: null,
      max: null,
      bestRate: null,
      offerCount: 0,
    };
  }

  const decimals = side === "buy" ? 0 : TOKEN_DECIMALS;
  // Round inward so an amount the form accepts is never rejected downstream.
  const roundedMin = ceilTo(min, decimals);
  const roundedMax = floorTo(max, decimals);

  if (!(roundedMax > 0) || roundedMax < roundedMin) return null;

  return {
    viable: true,
    side,
    min: roundedMin,
    max: roundedMax,
    bestRate,
    offerCount: viableCount,
  };
}

/** True when two envelopes carry the same information, to avoid re-render churn. */
export function envelopesEqual(
  a: LiquidityEnvelope | null,
  b: LiquidityEnvelope | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.viable === b.viable &&
    a.side === b.side &&
    a.min === b.min &&
    a.max === b.max &&
    a.bestRate === b.bestRate &&
    a.offerCount === b.offerCount
  );
}

/**
 * Amount limits move with provider availability, so the copy is phrased as
 * what is fillable right now rather than as a standing rule.
 */
export function liquidityMaxMessage(
  amount: number,
  side: RateSide,
  currency: string,
  token: string,
): string {
  const unit =
    side === "buy"
      ? `${getCurrencySymbol(currency)}${formatNumberWithCommas(amount)}`
      : `${formatNumberWithCommas(amount)} ${token}`;
  return `Up to ${unit} available right now`;
}

export function liquidityMinMessage(
  amount: number,
  side: RateSide,
  currency: string,
  token: string,
): string {
  const unit =
    side === "buy"
      ? `${getCurrencySymbol(currency)}${formatNumberWithCommas(amount)}`
      : `${formatNumberWithCommas(amount)} ${token}`;
  return `Minimum for available offers is ${unit}`;
}

export function noLiquidityMessage(token: string, network: string): string {
  return `No liquidity available for ${token} on ${network} right now`;
}
