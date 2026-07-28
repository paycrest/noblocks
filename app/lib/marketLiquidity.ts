/**
 * Turns the aggregator's provider order book (GET /v2/markets) into the range
 * of Send-field amounts that at least one provider can actually fill.
 *
 * An order is assigned to a single provider, so the range is the envelope
 * across offers — never the sum of their balances.
 */

import type { RateSide, V2MarketOffer } from "../types";
import { formatNumberWithCommas, getCurrencySymbol } from "../utils";

/** One continuous run of fillable amounts, in Send-field units. */
export type LiquiditySegment = { min: number; max: number };

export type LiquidityEnvelope = {
  /** False when the book has rows but none can fill an order right now. */
  viable: boolean;
  side: RateSide;
  /** Bounds in Send-field units: fiat on buy (onramp), token on sell (offramp). */
  min: number | null;
  max: number | null;
  /**
   * The fillable runs between `min` and `max`, ascending and non-overlapping.
   *
   * One order is filled by one provider, so sitting inside `[min, max]` is not
   * on its own enough — that span is the union of every provider's band, and
   * two providers whose bands do not meet leave a hole no single one can
   * cover. Usually there is exactly one segment.
   */
  segments: LiquiditySegment[];
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

/**
 * Distances below this are indistinguishable from equal. Amounts are held to
 * four decimals, so no real difference is anywhere near this small — it exists
 * only so binary rounding cannot turn a tie into a winner.
 */
const DISTANCE_EPSILON = 1e-9;

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
 * Collapses overlapping and adjacent bands into the runs actually fillable.
 *
 * Bands join only when they overlap or sit one representable amount apart, so
 * the join never widens with the numbers involved — a proportional tolerance
 * would swallow a five-figure hole between bands in the millions. Inward
 * rounding already closes a provider's own hairline seams (…–2 then
 * 2.000999–… both land on the same integer boundary in fiat), and anything
 * wider than the grid is a real hole that no single provider covers.
 */
function mergeSegments(
  raw: LiquiditySegment[],
  decimals: number,
): LiquiditySegment[] {
  const unit = 1 / 10 ** decimals;
  const merged: LiquiditySegment[] = [];

  for (const segment of [...raw].sort((a, b) => a.min - b.min)) {
    const last = merged[merged.length - 1];
    if (last && segment.min <= last.max + unit) {
      if (segment.max > last.max) last.max = segment.max;
    } else {
      merged.push({ ...segment });
    }
  }

  return merged;
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
  const decimals = side === "buy" ? 0 : TOKEN_DECIMALS;
  const bands: LiquiditySegment[] = [];
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
    if (bestRate === null || rate < bestRate) bestRate = rate;

    // Round inward so an amount the form accepts is never rejected downstream.
    const band = { min: ceilTo(lower, decimals), max: floorTo(upper, decimals) };
    if (band.max > 0 && band.max >= band.min) bands.push(band);
  }

  const segments = mergeSegments(bands, decimals);

  if (viableCount === 0) {
    return {
      viable: false,
      side,
      min: null,
      max: null,
      segments: [],
      bestRate: null,
      offerCount: 0,
    };
  }

  // Offers were viable but every band rounded away to nothing.
  if (segments.length === 0) return null;

  return {
    viable: true,
    side,
    min: segments[0].min,
    max: segments[segments.length - 1].max,
    segments,
    bestRate,
    offerCount: viableCount,
  };
}

/** True when a single provider can fill exactly `amount`. */
export function isAmountFillable(
  envelope: LiquidityEnvelope | null,
  amount: number,
): boolean {
  if (!envelope?.viable || envelope.segments.length === 0) return true;
  if (!Number.isFinite(amount)) return true;
  return envelope.segments.some(
    (segment) => amount >= segment.min && amount <= segment.max,
  );
}

/**
 * @returns the fillable amount closest to `amount`, or null when there is no
 * live band to steer toward. An amount already fillable is returned unchanged.
 *
 * Ties go to the larger amount — someone who asked for more is better served
 * by rounding up to the next band than down into the previous one.
 */
export function nearestFillableAmount(
  envelope: LiquidityEnvelope | null,
  amount: number,
): number | null {
  if (!envelope?.viable || envelope.segments.length === 0) return null;
  if (!Number.isFinite(amount)) return null;

  let nearest: number | null = null;
  let shortest = Infinity;

  for (const segment of envelope.segments) {
    const candidate = Math.min(Math.max(amount, segment.min), segment.max);
    const distance = Math.abs(candidate - amount);
    // Equidistance has to be judged with a tolerance: 0.3 is mathematically
    // as far from 0.2 as from 0.4, but not in binary, and an exact comparison
    // would quietly hand those cases to the lower band.
    if (
      distance < shortest - DISTANCE_EPSILON ||
      (Math.abs(distance - shortest) <= DISTANCE_EPSILON &&
        nearest !== null &&
        candidate > nearest)
    ) {
      nearest = candidate;
      shortest = distance;
    }
  }

  return nearest;
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
    a.offerCount === b.offerCount &&
    a.segments.length === b.segments.length &&
    a.segments.every(
      (segment, index) =>
        segment.min === b.segments[index].min &&
        segment.max === b.segments[index].max,
    )
  );
}

/** The Send field holds fiat on buy and the token on sell. */
function formatSendAmount(
  amount: number,
  side: RateSide,
  currency: string,
  token: string,
): string {
  return side === "buy"
    ? `${getCurrencySymbol(currency)}${formatNumberWithCommas(amount)}`
    : `${formatNumberWithCommas(amount)} ${token}`;
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
  return `Up to ${formatSendAmount(amount, side, currency, token)} available right now`;
}

export function liquidityMinMessage(
  amount: number,
  side: RateSide,
  currency: string,
  token: string,
): string {
  return `Minimum for available offers is ${formatSendAmount(amount, side, currency, token)}`;
}

/**
 * Shown when an amount sits between two providers' bands: inside the overall
 * range, yet no single provider covers it. Names the closest amount that is,
 * since the bare fact is not actionable on its own.
 */
export function nearestFillableMessage(
  amount: number,
  side: RateSide,
  currency: string,
  token: string,
): string {
  return `Try ${formatSendAmount(amount, side, currency, token)} — the nearest amount available right now`;
}

export function noLiquidityMessage(token: string, network: string): string {
  return `No liquidity available for ${token} on ${network} right now`;
}
