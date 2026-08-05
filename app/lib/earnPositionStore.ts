import type { EvmEarnSourceChain } from "./earnChains";
import type { EarnPosition } from "../hooks/useEarnHandler";

const SOURCE_POSITION_PREFIX = "earn_source_position_";
const PENDING_EARN_BRIDGE_KEY = "noblocks_pending_earn_bridges";

export interface EarnSourcePosition extends EarnPosition {
  sourceChain: EvmEarnSourceChain | "Starknet";
  starknetAddress: string;
}

export interface PendingEarnBridgeJob {
  swapId: string;
  sourceChain: EvmEarnSourceChain;
  evmAddress: string;
  starknetAddress: string;
  /** Amount sent on the source chain (base units). */
  requestedAmountBaseUnits: string;
  /** Expected Starknet receive amount after bridge fees (base units). */
  receiveAmountBaseUnits: string;
  /** @deprecated Use receiveAmountBaseUnits — kept for in-flight jobs in localStorage. */
  amountBaseUnits?: string;
  createdAt: number;
}

export function pendingBridgeReceiveBaseUnits(
  job: PendingEarnBridgeJob,
): bigint {
  const raw =
    job.receiveAmountBaseUnits ??
    job.amountBaseUnits ??
    job.requestedAmountBaseUnits;
  try {
    return BigInt(raw);
  } catch {
    return BigInt(0);
  }
}

function sourcePositionKey(
  evmAddress: string,
  sourceChain: string,
  token: string,
): string {
  return `${SOURCE_POSITION_PREFIX}${evmAddress.toLowerCase()}_${sourceChain}_${token}`;
}

export function readEarnSourcePosition(
  evmAddress: string,
  sourceChain: string,
  token: string,
): EarnSourcePosition | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(
      sourcePositionKey(evmAddress, sourceChain, token),
    );
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.suppliedBaseUnits !== "string") return null;
    return parsed as EarnSourcePosition;
  } catch {
    return null;
  }
}

export function writeEarnSourcePosition(
  evmAddress: string,
  position: EarnSourcePosition,
  token: string,
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      sourcePositionKey(evmAddress, position.sourceChain, token),
      JSON.stringify(position),
    );
    window.dispatchEvent(new CustomEvent("noblocks:earn-sync"));
  } catch {
    // Quota — non-fatal.
  }
}

export function clearEarnSourcePosition(
  evmAddress: string,
  sourceChain: string,
  token: string,
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(sourcePositionKey(evmAddress, sourceChain, token));
    window.dispatchEvent(new CustomEvent("noblocks:earn-sync"));
  } catch {
    // ignore
  }
}

export function listEarnSourcePositions(
  evmAddress: string,
  sourceChain?: string,
): EarnSourcePosition[] {
  if (typeof window === "undefined") return [];
  const prefix = `${SOURCE_POSITION_PREFIX}${evmAddress.toLowerCase()}_`;
  const out: EarnSourcePosition[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(prefix)) continue;
    if (sourceChain && !key.includes(`_${sourceChain}_`)) continue;
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "");
      if (parsed?.suppliedBaseUnits) out.push(parsed as EarnSourcePosition);
    } catch {
      // skip
    }
  }
  return out;
}

export function loadPendingEarnBridges(): PendingEarnBridgeJob[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PENDING_EARN_BRIDGE_KEY);
    return raw ? (JSON.parse(raw) as PendingEarnBridgeJob[]) : [];
  } catch {
    return [];
  }
}

export function savePendingEarnBridges(jobs: PendingEarnBridgeJob[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PENDING_EARN_BRIDGE_KEY, JSON.stringify(jobs));
  } catch {
    // ignore
  }
}
