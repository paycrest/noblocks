import "server-only";

import Decimal from "decimal.js";
import {
  getMarketCngnDepegBadgePct,
} from "@/app/lib/server-config";

export interface CngnBadgeInput {
  referencePrice: string;
  cmcMarketPrice: string | null;
  referenceFresh: boolean;
  cmcFresh: boolean;
}

export interface CngnBadgeResult {
  referenceLabel: string;
  marketPrice: string;
  gapPct: string;
  showBadge: boolean;
}

export function computeCngnBadge(input: CngnBadgeInput): CngnBadgeResult | null {
  if (!input.cmcMarketPrice || !input.referenceFresh || !input.cmcFresh) {
    return null;
  }
  const ref = new Decimal(input.referencePrice);
  if (ref.isZero()) return null;
  const market = new Decimal(input.cmcMarketPrice);
  const gapPct = market.minus(ref).div(ref).mul(100);
  const threshold = new Decimal(getMarketCngnDepegBadgePct());
  return {
    referenceLabel: "NGN/USD",
    marketPrice: market.toFixed(),
    gapPct: gapPct.toFixed(4),
    showBadge: gapPct.abs().gt(threshold),
  };
}
