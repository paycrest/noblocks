import "server-only";

/** Chainlink aggregator roundId: phaseId in high 16 bits, aggregatorRoundId in low 64 bits. */
export function encodeRoundId(
  phaseId: number,
  aggregatorRoundId: bigint,
): bigint {
  const mask = (BigInt(1) << BigInt(64)) - BigInt(1);
  return (BigInt(phaseId) << BigInt(64)) | (aggregatorRoundId & mask);
}

export function decodeRoundId(roundId: bigint): {
  phaseId: number;
  aggregatorRoundId: bigint;
} {
  const mask = (BigInt(1) << BigInt(64)) - BigInt(1);
  return {
    phaseId: Number(roundId >> BigInt(64)),
    aggregatorRoundId: roundId & mask,
  };
}

/** Evenly spaced roundIds between start and end (inclusive), deduped. */
export function spaceSampleRoundIds(
  startRoundId: bigint,
  endRoundId: bigint,
  sampleCount: number,
): bigint[] {
  if (sampleCount <= 0) return [];
  if (sampleCount === 1) return [endRoundId];
  if (startRoundId > endRoundId) return [endRoundId];

  const seen = new Set<string>();
  const out: bigint[] = [];
  const span = endRoundId - startRoundId;

  for (let i = 0; i < sampleCount; i++) {
    const id = startRoundId + (span * BigInt(i)) / BigInt(sampleCount - 1);
    const key = id.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(id);
  }
  return out;
}

export function previousPhaseRoundId(roundId: bigint): bigint | null {
  const { phaseId, aggregatorRoundId } = decodeRoundId(roundId);
  if (aggregatorRoundId > BigInt(1)) {
    return encodeRoundId(phaseId, aggregatorRoundId - BigInt(1));
  }
  if (phaseId <= 0) return null;
  return encodeRoundId(phaseId - 1, (BigInt(1) << BigInt(64)) - BigInt(1));
}
