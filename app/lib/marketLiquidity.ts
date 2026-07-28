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

/** The one corridor a quote is for. The book covers every corridor at once. */
export type LiquidityCorridor = {
  side: RateSide;
  /** Aggregator wire symbol, e.g. CNGN. */
  token: string;
  currency: string;
  /** Normalized slug, e.g. bnb-smart-chain. */
  network: string;
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

function sameCode(a: unknown, b: string): boolean {
  return typeof a === "string" && a.trim().toLowerCase() === b.toLowerCase();
}

/**
 * Unfiltered, the endpoint serves every corridor it knows — both sides, all
 * tokens, fiats and networks — in one array. The request does send filters,
 * so this is normally a no-op; it is here so that a dropped or differently
 * interpreted filter cannot let another corridor's depth be read as this
 * one's.
 */
export function filterOffersForCorridor(
  offers: V2MarketOffer[],
  corridor: LiquidityCorridor,
): V2MarketOffer[] {
  if (!Array.isArray(offers)) return [];
  return offers.filter(
    (offer) =>
      sameCode(offer.side, corridor.side) &&
      sameCode(offer.token, corridor.token) &&
      sameCode(offer.fiat, corridor.currency) &&
      sameCode(offer.network, corridor.network),
  );
}

/**
 * How much of `offer` a single order can consume, in token units.
 *
 * `balance` is denominated by `balanceCurrency`: the token on buy rows (the
 * provider pays out tokens) and the fiat on sell rows (it pays out fiat). A
 * balance in neither denomination is left out of the cap rather than guessed
 * at, since a misread float would silently shrink a healthy offer.
 */
function offerCapInTokens(
  offer: V2MarketOffer,
  corridor: LiquidityCorridor,
  rate: number,
): number | null {
  const max = toFiniteNumber(offer.max);
  if (max === null) return null;

  const balance = toFiniteNumber(offer.balance);
  if (balance === null) return max;

  if (sameCode(offer.balanceCurrency, corridor.token)) {
    return Math.min(max, balance);
  }
  if (sameCode(offer.balanceCurrency, corridor.currency)) {
    return Math.min(max, balance / rate);
  }
  // Undeclared denomination: on buy the historical shape is token-denominated.
  if (offer.balanceCurrency === undefined && corridor.side === "buy") {
    return Math.min(max, balance);
  }
  return max;
}

/**
 * @returns the fillable envelope for `corridor`, or `null` when the book says
 * nothing usable (empty response, or numbers that fail a sanity check).
 * Callers treat `null` as unknown and keep their static limits — an
 * unreachable or unreadable book must never lock a user out.
 *
 * An entirely empty response reads as unknown rather than as an empty
 * corridor: a filtered request legitimately returns nothing when no provider
 * serves the pair, but so does a book that failed to populate, and the two are
 * indistinguishable here. Erring toward unknown keeps the limits at their
 * static values instead of disabling a corridor on ambiguous data. A response
 * that has rows but none fillable is unambiguous and reports as non-viable.
 */
export function computeLiquidityEnvelope(
  offers: V2MarketOffer[],
  corridor: LiquidityCorridor,
): LiquidityEnvelope | null {
  if (!Array.isArray(offers) || offers.length === 0) return null;

  const { side } = corridor;
  let min: number | null = null;
  let max: number | null = null;
  let bestRate: number | null = null;
  let viableCount = 0;

  for (const offer of filterOffersForCorridor(offers, corridor)) {
    const offerMin = toFiniteNumber(offer.min);
    const rate = toFiniteNumber(offer.rate);
    if (offerMin === null || offerMin < 0) continue;
    if (rate === null || rate <= 0) continue;

    const cap = offerCapInTokens(offer, corridor, rate);
    if (cap === null || cap < offerMin) continue;

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
