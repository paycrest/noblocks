/**
 * Client-only in-memory cache for wallet balance snapshots.
 *
 * Important: this module relies on module-level Maps. It is safe in the Next.js
 * client bundle (per-tab, per-client) but MUST NOT be imported from a Node
 * server runtime where it would become a process-wide cross-user cache.
 */
const TTL_MS = 60_000;

const cache = new Map<string, { t: number; data: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

export function walletBalanceCacheKey(
  chainId: number | undefined,
  address: string,
): string {
  return `${chainId ?? "?"}:${address.toLowerCase()}`;
}

function cloneForCache<T>(data: T): T {
  return structuredClone(data) as T;
}

/**
 * Returns cached snapshot when fresh, dedupes concurrent fetches by key.
 *
 * Each consumer receives a fresh `structuredClone` so accidental mutation of
 * returned balances cannot poison the cache or other in-flight callers.
 */
export async function getCachedOrFetchEvmBalances<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: { bypassCache?: boolean } = {},
): Promise<T> {
  if (!opts.bypassCache) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.t < TTL_MS) {
      return cloneForCache(hit.data as T);
    }
  }

  let p = inflight.get(key) as Promise<T> | undefined;
  if (!p) {
    const myP = fetcher()
      .then((data) => {
        if (inflight.get(key) !== myP) {
          return data;
        }
        cache.set(key, { t: Date.now(), data });
        inflight.delete(key);
        return data;
      })
      .catch((err) => {
        if (inflight.get(key) === myP) {
          inflight.delete(key);
        }
        throw err;
      }) as Promise<T>;
    p = myP;
    inflight.set(key, p);
  }

  return p.then((data) => cloneForCache(data));
}

export function invalidateWalletBalanceCacheForAddress(address: string): void {
  const suffix = `:${address.toLowerCase()}`;
  const keys = [...cache.keys(), ...inflight.keys()].filter((k) =>
    k.endsWith(suffix),
  );
  for (const k of new Set(keys)) {
    cache.delete(k);
    inflight.delete(k);
  }
}
