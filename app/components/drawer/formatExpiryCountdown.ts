/**
 * Formats remaining time as mm:ss (zero-padded). Seconds are always 0–59;
 * values clamp at 00:00 when totalSeconds is negative.
 */
export function formatExpiryCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
