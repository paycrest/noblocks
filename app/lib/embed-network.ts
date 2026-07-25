import { networks } from "../mocks";
import type { Network } from "../types";

/**
 * Resolve embed URL / wallet chain IDs to a Noblocks `Network`.
 *
 * Allowlists and `?network=` use **slugs** from chain display names
 * (e.g. `base`, `arbitrum-one`, `starknet`). `?chainId=` remains an EVM
 * convenience for the **default** only.
 */

type SearchParamsLike = { get: (key: string) => string | null };

/** Same as `normalizeNetworkForRateFetch` — kept local to avoid utils cycles. */
function toNetworkSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-");
}

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

/** Slug used in allowlists and rate paths (e.g. `base`, `starknet`). */
export function networkSlug(network: Network): string {
  return toNetworkSlug(network.chain.name);
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

/**
 * Resolve by slug (`base`, `arbitrum-one`, `starknet`) or chain display name.
 * Accepts legacy `starknet-mainnet` as an alias for Starknet.
 */
export function resolveNetworkBySlug(
  slug: string | null | undefined,
): Network | null {
  if (slug == null) return null;
  const lower = slug.trim().toLowerCase();
  if (!lower) return null;

  if (lower === "starknet-mainnet") {
    return networks.find((n) => n.chain.name === "Starknet") ?? null;
  }

  return (
    networks.find((n) => networkSlug(n) === lower) ??
    networks.find((n) => n.chain.name.toLowerCase() === lower) ??
    null
  );
}

/** @deprecated Prefer `resolveNetworkBySlug` — kept for existing call sites. */
export function resolveNetworkByName(
  name: string | null | undefined,
): Network | null {
  return resolveNetworkBySlug(name);
}

/** Split a CSV query param into trimmed non-empty parts. */
export function parseCsvParam(
  raw: string | null | undefined,
): string[] {
  if (raw == null) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Resolve `?networks=` CSV of slugs to Network[].
 * Unknown slugs are dropped. Empty / missing CSV → empty array.
 */
export function resolveNetworksAllowlist(
  raw: string | null | undefined,
): Network[] {
  const parts = parseCsvParam(raw);
  const seen = new Set<string>();
  const result: Network[] = [];
  for (const part of parts) {
    const network = resolveNetworkBySlug(part);
    if (!network) continue;
    const key = network.chain.name;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(network);
  }
  return result;
}

/**
 * Resolve `?chainIds=` CSV of EVM chain IDs (decimal or 0x hex) to Network[].
 * The allowlist counterpart of `?chainId=`, the way `?networks=` pairs with
 * `?network=`. Unknown/invalid IDs are dropped. Empty / missing CSV → empty
 * array.
 */
export function resolveChainIdsAllowlist(
  raw: string | null | undefined,
): Network[] {
  const parts = parseCsvParam(raw);
  const seen = new Set<string>();
  const result: Network[] = [];
  for (const part of parts) {
    const network = resolveNetworkByChainId(part);
    if (!network) continue;
    const key = network.chain.name;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(network);
  }
  return result;
}

/** True when `network` is in an allowlist of Networks (by chain name). */
export function isNetworkInAllowlist(
  network: Network,
  allowlist: Network[] | null | undefined,
): boolean {
  if (allowlist == null) return true;
  if (allowlist.length === 0) return false;
  return allowlist.some((n) => n.chain.name === network.chain.name);
}

/** True when the host passed `chainId` and/or `network` (even if empty/invalid). */
export function hasEmbedNetworkLockParams(
  searchParams: SearchParamsLike,
): boolean {
  return (
    searchParams.get("chainId") != null || searchParams.get("network") != null
  );
}

/** True when a network allowlist key (`networks` / `chainIds`) is present. */
export function hasEmbedNetworksAllowlistParam(
  searchParams: SearchParamsLike,
): boolean {
  return (
    searchParams.get("networks") != null ||
    searchParams.get("chainIds") != null
  );
}

/**
 * Resolve default network from embed URL params.
 * Prefers `chainId` when present (non-empty); otherwise uses `network` slug/name.
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
    return resolveNetworkBySlug(networkName);
  }

  return null;
}

export type EmbedNetworkConfig = {
  /** null = unrestricted; otherwise only these networks in the switcher. */
  allowlist: Network[] | null;
  /** Default network from URL (`network` / `chainId` / first allowlist entry). */
  defaultNetwork: Network | null;
  /**
   * True when the picker is read-only: single allowlist entry, or legacy
   * `network`/`chainId` lock without a multi-value `networks=` list.
   */
  isLocked: boolean;
  /** URL requested a lock/default but nothing resolved. */
  unresolved: boolean;
};

/**
 * Parse embed network allowlist + default + lock from URL search params.
 *
 * - `networks=` CSV of slugs and/or `chainIds=` CSV of EVM chain IDs →
 *   allowlist (the union when both are present; omit both = unrestricted)
 * - `network=` / `chainId=` → default; without an allowlist key also locks
 *   (legacy)
 * - Single-entry allowlist → locked read-only chip
 */
export function parseEmbedNetworkConfig(
  searchParams: SearchParamsLike,
): EmbedNetworkConfig {
  const hasNetworksKey = hasEmbedNetworksAllowlistParam(searchParams);
  const fromDefaultParams = resolveNetworkFromEmbedParams(searchParams);
  const hadDefaultKeys = hasEmbedNetworkLockParams(searchParams);

  if (hasNetworksKey) {
    const bySlug = resolveNetworksAllowlist(searchParams.get("networks"));
    const byChainId = resolveChainIdsAllowlist(searchParams.get("chainIds"));
    const seen = new Set<string>();
    const allowlist: Network[] = [];
    for (const network of [...bySlug, ...byChainId]) {
      if (seen.has(network.chain.name)) continue;
      seen.add(network.chain.name);
      allowlist.push(network);
    }
    const defaultNetwork =
      fromDefaultParams && isNetworkInAllowlist(fromDefaultParams, allowlist)
        ? fromDefaultParams
        : (allowlist[0] ?? null);
    return {
      allowlist: allowlist.length > 0 ? allowlist : [],
      defaultNetwork,
      isLocked: allowlist.length === 1,
      unresolved: allowlist.length === 0,
    };
  }

  // Legacy: `network` / `chainId` without `networks=` → lock to that chain.
  if (hadDefaultKeys) {
    return {
      allowlist: fromDefaultParams ? [fromDefaultParams] : [],
      defaultNetwork: fromDefaultParams,
      isLocked: true,
      unresolved: fromDefaultParams == null,
    };
  }

  return {
    allowlist: null,
    defaultNetwork: null,
    isLocked: false,
    unresolved: false,
  };
}
