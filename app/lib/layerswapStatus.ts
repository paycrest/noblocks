/**
 * LayerSwap swap status vocabulary and predicates.
 *
 * Split out of layerswap.ts so client components can poll swap status without
 * pulling the API client — and its server-only credentials — into the browser
 * bundle. Pure: no env access, no network, no imports.
 */

export type LayerswapSwapStatus =
  | "user_transfer_pending"
  | "completed"
  | "failed"
  | "expired"
  | "ls_transfer_pending"
  | "pending_refund"
  | "refunded";

export function isLayerswapTerminalStatus(
  status: LayerswapSwapStatus,
): boolean {
  return (
    status === "completed" ||
    status === "failed" ||
    status === "expired" ||
    status === "refunded"
  );
}

export function isLayerswapSuccessStatus(status: LayerswapSwapStatus): boolean {
  return status === "completed";
}
