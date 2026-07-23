import { networks } from "../mocks";
import type { Network } from "../types";

/**
 * Resolve embed URL / wallet chain IDs to a Noblocks `Network`.
 *
 * `?chainId=` is for EVM numeric (or hex) IDs. Starknet / Tron should use
 * `?network=` (by chain name) — their chain.id values are not EVM chainIds.
 */

type SearchParamsLike = { get: (key: string) => string | null };

/** Parse decimal or `0x`-prefixed hex chainId. Returns null if missing/invalid. */
export function parseChainIdParam(
  raw: string | null | undefined,
): number | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("0x") || trimmed.startsWith("0X")) {
    const n = Number.parseInt(trimmed, 16);
    return Number.isFinite(n) ? n : null;
  }

  const n = Number(trimmed);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  return n;
}

/** Match an EVM chainId (number or hex/decimal string) against `networks`. */
export function resolveNetworkByChainId(
  chainId: number | string,
): Network | null {
  let numeric: number;
  if (typeof chainId === "string") {
    const parsed = parseChainIdParam(chainId);
    if (parsed == null) return null;
    numeric = parsed;
  } else {
    numeric = chainId;
  }

  return (
    networks.find(
      (n) => typeof n.chain.id === "number" && n.chain.id === numeric,
    ) ?? null
  );
}

/** Case-insensitive match on `chain.name` (e.g. "Base", "Starknet"). */
export function resolveNetworkByName(
  name: string | null | undefined,
): Network | null {
  if (name == null) return null;
  const lower = name.trim().toLowerCase();
  if (!lower) return null;
  return (
    networks.find((n) => n.chain.name.toLowerCase() === lower) ?? null
  );
}

/** True when the host passed `chainId` and/or `network` (even if empty/invalid). */
export function hasEmbedNetworkLockParams(
  searchParams: SearchParamsLike,
): boolean {
  return (
    searchParams.get("chainId") != null || searchParams.get("network") != null
  );
}

/**
 * Resolve locked network from embed URL params.
 * Prefers `chainId` when present (non-empty); otherwise uses `network`.
 * Returns null when params are missing, empty, or do not match a supported chain.
 */
export function resolveNetworkFromEmbedParams(
  searchParams: SearchParamsLike,
): Network | null {
  const chainIdRaw = searchParams.get("chainId");
  if (chainIdRaw != null && chainIdRaw.trim() !== "") {
    const parsed = parseChainIdParam(chainIdRaw);
    if (parsed == null) return null;
    return resolveNetworkByChainId(parsed);
  }

  const networkName = searchParams.get("network");
  if (networkName != null && networkName.trim() !== "") {
    return resolveNetworkByName(networkName);
  }

  return null;
}
