"use client";

import { useCallback, useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useStarknet } from "../context/StarknetContext";

export type EarnToken = "USDC" | "USDT";

export const EARN_TOKENS: EarnToken[] = ["USDC", "USDT"];

export interface EarnPosition {
  /** Underlying token supplied, as base units string. */
  suppliedBaseUnits: string;
  /** Same value formatted as a decimal e.g. "12.345678". */
  suppliedFormatted: string;
  /** Annualized supply yield as a decimal (0.0523 = 5.23%). null if unknown. */
  supplyApy: number | null;
}

export type EarnPositions = Record<EarnToken, EarnPosition | null>;

export interface EarnActivityEntry {
  txHash: string;
  type: "deposit" | "withdraw";
  /** Token earned/withdrawn. Older entries (no field) are treated as USDC. */
  token: EarnToken;
  amountBaseUnits: string;
  /** When the user kicked it off — milliseconds since epoch. */
  timestamp: number;
}

const ACTIVITY_PREFIX = "earn_activity_";
const ACTIVITY_LIMIT = 16;
const POSITION_PREFIX = "earn_position_";
// Same-tab pub/sub so multiple useEarnHandler instances (modal + activity panel)
// stay in sync after a write. The browser `storage` event only fires for OTHER
// tabs, so we dispatch a custom event for in-tab subscribers.
const EARN_SYNC_EVENT = "noblocks:earn-sync";

function activityKey(address: string): string {
  return `${ACTIVITY_PREFIX}${address.toLowerCase()}`;
}

function positionKey(address: string, token: EarnToken): string {
  return `${POSITION_PREFIX}${address.toLowerCase()}_${token}`;
}

function readActivity(address: string): EarnActivityEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(activityKey(address));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry: any) => normalizeActivity(entry))
      .filter((e): e is EarnActivityEntry => e !== null)
      .slice(0, ACTIVITY_LIMIT);
  } catch {
    return [];
  }
}

function normalizeActivity(raw: any): EarnActivityEntry | null {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.txHash !== "string") return null;
  if (raw.type !== "deposit" && raw.type !== "withdraw") return null;
  // Pre-USDT entries had no `token` field — assume USDC for back-compat.
  const token: EarnToken = raw.token === "USDT" ? "USDT" : "USDC";
  return {
    txHash: raw.txHash,
    type: raw.type,
    token,
    amountBaseUnits: String(raw.amountBaseUnits ?? "0"),
    timestamp: Number(raw.timestamp) || Date.now(),
  };
}

function writeActivity(address: string, entries: EarnActivityEntry[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      activityKey(address),
      JSON.stringify(entries.slice(0, ACTIVITY_LIMIT)),
    );
    notifyEarnSync();
  } catch {
    // Quota or serialization issue — drop silently; the flow doesn't depend on it.
  }
}

function notifyEarnSync() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EARN_SYNC_EVENT));
}

function readPosition(
  address: string,
  token: EarnToken,
): EarnPosition | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(positionKey(address, token));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.suppliedBaseUnits !== "string") return null;
    return {
      suppliedBaseUnits: parsed.suppliedBaseUnits,
      suppliedFormatted: parsed.suppliedFormatted ?? "0",
      supplyApy: typeof parsed.supplyApy === "number" ? parsed.supplyApy : null,
    };
  } catch {
    return null;
  }
}

function writePosition(
  address: string,
  token: EarnToken,
  position: EarnPosition,
) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(positionKey(address, token), JSON.stringify(position));
    notifyEarnSync();
  } catch {
    // Quota or serialization issue — drop silently.
  }
}

const EMPTY_POSITIONS: EarnPositions = { USDC: null, USDT: null };

export function useEarnHandler() {
  const { getAccessToken } = usePrivy();
  const { walletId, publicKey, address } = useStarknet();

  const [positions, setPositions] = useState<EarnPositions>(EMPTY_POSITIONS);
  const [activity, setActivity] = useState<EarnActivityEntry[]>([]);

  // Hydrate cached activity AND per-token positions from localStorage so the
  // first paint shows the last-known APR + supplied amounts instantly, without
  // flashing "—" while the network round-trip resolves. Also subscribes to the
  // same-tab sync event so any other useEarnHandler instance's write (modal
  // recording activity, panel refreshing position) re-syncs this instance.
  useEffect(() => {
    if (!address) {
      setActivity([]);
      setPositions(EMPTY_POSITIONS);
      return;
    }
    const hydrate = () => {
      setActivity(readActivity(address));
      setPositions({
        USDC: readPosition(address, "USDC"),
        USDT: readPosition(address, "USDT"),
      });
    };
    hydrate();
    window.addEventListener(EARN_SYNC_EVENT, hydrate);
    return () => window.removeEventListener(EARN_SYNC_EVENT, hydrate);
  }, [address]);

  const refreshPosition = useCallback(
    async (token: EarnToken) => {
      if (!address) return;
      const accessToken = await getAccessToken();
      if (!accessToken) return;
      try {
        const res = await fetch(
          `/api/starknet/earn/position?address=${encodeURIComponent(
            address,
          )}&token=${token}`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        const data = await res.json();
        if (res.ok && data?.success) {
          const next: EarnPosition = {
            suppliedBaseUnits: data.suppliedBaseUnits,
            suppliedFormatted: data.suppliedFormatted,
            supplyApy: data.supplyApy ?? null,
          };
          setPositions((prev) => ({ ...prev, [token]: next }));
          writePosition(address, token, next);
        }
      } catch {
        // Position read is best-effort; UI still functional without it.
      }
    },
    [address, getAccessToken],
  );

  const refreshAllPositions = useCallback(async () => {
    await Promise.all(EARN_TOKENS.map((t) => refreshPosition(t)));
  }, [refreshPosition]);

  const recordActivity = useCallback(
    (entry: EarnActivityEntry) => {
      if (!address) return;
      const next = [entry, ...readActivity(address)].slice(0, ACTIVITY_LIMIT);
      writeActivity(address, next);
      setActivity(next);
    },
    [address],
  );

  const deposit = useCallback(
    async (
      token: EarnToken,
      amountBaseUnits: bigint,
    ): Promise<{ txHash: string }> => {
      if (!walletId || !publicKey || !address) {
        throw new Error("Starknet wallet not ready");
      }
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error("Authentication required");

      const res = await fetch("/api/starknet/earn/deposit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          walletId,
          publicKey,
          token,
          amount: amountBaseUnits.toString(),
          origin: window.location.origin,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Deposit failed");
      }
      const txHash: string = data.transactionHash;
      recordActivity({
        txHash,
        type: "deposit",
        token,
        amountBaseUnits: amountBaseUnits.toString(),
        timestamp: Date.now(),
      });
      return { txHash };
    },
    [walletId, publicKey, address, getAccessToken, recordActivity],
  );

  const withdraw = useCallback(
    async (
      token: EarnToken,
      amountBaseUnits: bigint | "max",
    ): Promise<{ txHash: string }> => {
      if (!walletId || !publicKey || !address) {
        throw new Error("Starknet wallet not ready");
      }
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error("Authentication required");

      const isMax = amountBaseUnits === "max";
      const res = await fetch("/api/starknet/earn/withdraw", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          walletId,
          publicKey,
          token,
          ...(isMax
            ? { max: true }
            : { amount: (amountBaseUnits as bigint).toString() }),
          origin: window.location.origin,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Withdrawal failed");
      }
      const txHash: string = data.transactionHash;
      recordActivity({
        txHash,
        type: "withdraw",
        token,
        amountBaseUnits: isMax
          ? (positions[token]?.suppliedBaseUnits ?? "0")
          : (amountBaseUnits as bigint).toString(),
        timestamp: Date.now(),
      });
      return { txHash };
    },
    [walletId, publicKey, address, getAccessToken, recordActivity, positions],
  );

  return {
    positions,
    activity,
    refreshPosition,
    refreshAllPositions,
    deposit,
    withdraw,
  };
}
