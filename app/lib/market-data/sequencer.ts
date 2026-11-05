import "server-only";

/** Chainlink L2 sequencer uptime: answer 0 = up, 1 = down. */
export const SEQUENCER_GRACE_PERIOD_SEC = 3600;

export type SequencerStatus = "up" | "down" | "grace";

export function evaluateSequencerStatus(
  answer: bigint,
  startedAtSec: number,
  blockTimestampSec: number,
): SequencerStatus {
  if (answer === BigInt(1)) return "down";
  if (answer === BigInt(0)) {
    const elapsed = blockTimestampSec - startedAtSec;
    if (elapsed < SEQUENCER_GRACE_PERIOD_SEC) return "grace";
    return "up";
  }
  return "down";
}

export function isSequencerOperational(
  answer: bigint,
  startedAtSec: number,
  blockTimestampSec: number,
): boolean {
  return (
    evaluateSequencerStatus(answer, startedAtSec, blockTimestampSec) === "up"
  );
}
