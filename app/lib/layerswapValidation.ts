/** Parse a LayerSwap amount query/body param; rejects partial strings and non-finite values. */
export function parseLayerswapAmountParam(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") return null;
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
}

export function parseLayerswapAmountBody(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    return parseLayerswapAmountParam(value);
  }
  return null;
}
