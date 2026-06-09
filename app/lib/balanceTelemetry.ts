/**
 * Lightweight balance/rate observability.
 *
 * Dev: opt-in via `localStorage.setItem("balance_debug", "1")`.
 *      The default-on dev mode produced ~9 logs per refresh, which drowned other
 *      output, so verbose logging is gated behind a flag.
 * Prod: ~2% sample.
 */
const SAMPLE_RATE = 0.02;

function shouldLog(): boolean {
  if (process.env.NODE_ENV === "development") {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage?.getItem("balance_debug") === "1";
    } catch {
      return false;
    }
  }
  return Math.random() < SAMPLE_RATE;
}

export function logBalanceTelemetry(
  event: string,
  payload: Record<string, unknown>,
): void {
  if (!shouldLog()) return;
  if (typeof console !== "undefined" && typeof console.debug === "function") {
    console.debug(`[balance:${event}]`, payload);
  }
}
