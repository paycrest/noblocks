import type { NextRequest } from "next/server";
import {
  PrivyClient,
  LinkedAccountWithMetadata,
  WalletWithMetadata,
} from "@privy-io/server-auth";
import { isValidSolanaAddress } from "./validation";
import { verifyJWT } from "./jwt";
import { DEFAULT_PRIVY_CONFIG } from "./config";

let client: PrivyClient | undefined

export function getPrivyClient(): PrivyClient {
  if (client) return client
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID
  const appSecret = process.env.PRIVY_APP_SECRET
  if (!appId || !appSecret) throw new Error('Missing NEXT_PUBLIC_PRIVY_APP_ID or PRIVY_APP_SECRET')
  client = new PrivyClient(appId, appSecret)
  const authKey = process.env.PRIVY_WALLET_AUTH_PRIVATE_KEY
  if (authKey) {
    try {
      client.walletApi.updateAuthorizationKey(authKey)
    } catch (e: any) {
      console.warn('Failed to set Privy wallet authorization key:', e?.message)
    }
  }
  return client
}

function isWalletAccount(
  account: LinkedAccountWithMetadata,
): account is WalletWithMetadata {
  return account.type === "wallet";
}

export async function getWalletAddressFromPrivyUserId(
  userId: string,
): Promise<string> {
  const privy = getPrivyClient();
  try {
    const user = await privy.getUser(userId);
    if (!user || !user.linkedAccounts) {
      throw new Error("No linked accounts found for Privy user");
    }
    const wallet =
      user.linkedAccounts.find(
        (account): account is WalletWithMetadata =>
          isWalletAccount(account) && account.connectorType === "embedded",
      ) ||
      user.linkedAccounts.find(
        (account): account is WalletWithMetadata =>
          isWalletAccount(account) && account.chainId === "eip155:1",
      );
    if (!wallet?.address) {
      throw new Error("No embedded or Ethereum wallet found for Privy user");
    }

    return wallet.address.toLowerCase();
  } catch (error) {
    throw error;
  }
}

export async function getSmartWalletAddressFromPrivyUserId(
  userId: string,
): Promise<string> {
  const privy = getPrivyClient();
  try {
  const user = await privy.getUser(userId);
  const smartWalletAddress =
    user?.linkedAccounts.find((account) => account.type === "smart_wallet")
      ?.address ?? "";

  if (!smartWalletAddress) {
    throw new Error("No smart wallet found for Privy user");
  }
    return smartWalletAddress.toLowerCase();
  } catch (error) {
    throw error;
  }
}

/**
 * Maps a list of embedded/EOA wallet addresses (as stored in `user_kyc_profiles`)
 * to their owners' smart wallet addresses.
 *
 * `resolveIdentityScope()` matches siblings by verified phone/ID, which only ever
 * exists in EOA space — but BlockFest's tables (`blockfest_participants`,
 * `blockfest_cashback_claims`) are keyed by smart wallet address, since that's
 * where cashback is actually disbursed. Pooling the BlockFest caps across an
 * identity's sibling wallets therefore requires bridging the two address
 * spaces, one Privy lookup per sibling. A sibling with no linked smart wallet
 * (e.g. an injected/SIWE-only wallet with no Privy account) can't hold any
 * `blockfest_cashback_claims` rows in the first place, so it's skipped rather
 * than treated as an error.
 */
// The EOA → smart-wallet mapping is effectively immutable once set, so a
// short-lived cache spares one Privy call per sibling on every claim and softens
// rate limits. Only resolved addresses are cached: a null ("no smart wallet yet")
// may become non-null minutes later, and caching it would let a claim in that
// window escape the pooled quota.
//
// Bounded on both axes so a long-lived instance can't accumulate entries
// indefinitely: expired entries are dropped when read, and once the map is full
// the oldest insertion is evicted (Map iterates in insertion order, and entries
// are re-inserted on refresh, so the first key is always the least recently
// written).
const SMART_WALLET_CACHE_TTL_MS = 5 * 60 * 1000;
const SMART_WALLET_CACHE_MAX_ENTRIES = 5000;
const smartWalletCache = new Map<string, { value: string; expiresAt: number }>();

function readSmartWalletCache(address: string): string | null {
  const cached = smartWalletCache.get(address);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    smartWalletCache.delete(address);
    return null;
  }
  return cached.value;
}

function writeSmartWalletCache(address: string, value: string): void {
  // Delete first so a refresh moves the key to the end of the insertion order
  // rather than keeping its original (now misleading) position.
  smartWalletCache.delete(address);
  if (smartWalletCache.size >= SMART_WALLET_CACHE_MAX_ENTRIES) {
    const oldest = smartWalletCache.keys().next();
    if (!oldest.done) smartWalletCache.delete(oldest.value);
  }
  smartWalletCache.set(address, {
    value,
    expiresAt: Date.now() + SMART_WALLET_CACHE_TTL_MS,
  });
}

export async function getSmartWalletAddressesForWallets(
  wallets: string[],
): Promise<string[]> {
  const privy = getPrivyClient();
  const results = await Promise.allSettled(
    wallets.map(async (address) => {
      const cached = readSmartWalletCache(address);
      if (cached) {
        return cached;
      }
      // getUserByWalletAddress maps 404 → null, so a sibling with no Privy
      // account resolves (to null) rather than rejects — a rejection here is
      // always an infrastructure error, never "wallet not found".
      const user = await privy.getUserByWalletAddress(address);
      const smartWallet = user?.linkedAccounts.find(
        (account) => account.type === "smart_wallet",
      )?.address;
      const value = smartWallet ? smartWallet.toLowerCase() : null;
      if (value) {
        writeSmartWalletCache(address, value);
      }
      return value;
    }),
  );
  // A sibling with no Privy account or no smart wallet (fulfilled null) is
  // safely skipped — it can't hold claims. An infrastructure error (rejection)
  // is a different thing: silently dropping that sibling would narrow the quota
  // scope and hand out a fresh allowance, so it must fail the claim closed —
  // matching resolveIdentityScope's contract.
  const resolved: (string | null)[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      resolved.push(result.value);
    } else {
      console.error(
        `getSmartWalletAddressesForWallets: failed to resolve sibling wallet ${wallets[i]}:`,
        result.reason,
      );
      throw result.reason;
    }
  }
  return [...new Set(resolved.filter((a): a is string => !!a))];
}

/**
 * Resolves the Privy user id (JWT `sub`) for API routes.
 * Prefer `x-user-id` from middleware; if missing, verify the Bearer token.
 */
export async function getPrivyUserIdFromRequest(
  request: NextRequest,
): Promise<string | null> {
  const fromMiddleware = request.headers.get("x-user-id");
  if (fromMiddleware) return fromMiddleware;

  const auth = request.headers.get("Authorization");
  const token = auth?.replace(/^Bearer\s+/i, "")?.trim();
  if (!token) return null;

  try {
    const { payload } = await verifyJWT(token, DEFAULT_PRIVY_CONFIG);
    const sub = payload.sub;
    return typeof sub === "string" ? sub : null;
  } catch {
    return null;
  }
}

const EVM_ADDRESS_LOWER = /^0x[a-f0-9]{40}$/;

/**
 * All lowercase 0x-prefixed EVM addresses linked to this Privy user (wallets,
 * smart wallets, injected wallets, etc.). Used to authorize API bodies where
 * the active signer differs from the middleware "primary" wallet (e.g. SCW vs EOA).
 */
export async function collectLinkedEvmAddressesForPrivyUserId(
  userId: string,
): Promise<string[]> {
  const privy = getPrivyClient();
  const user = await privy.getUser(userId);
  const addresses = new Set<string>();
  for (const account of user?.linkedAccounts ?? []) {
    const addrCandidate =
      account &&
      typeof account === "object" &&
      "address" in account &&
      typeof (account as { address: unknown }).address === "string"
        ? ((account as { address: string }).address).toLowerCase()
        : null;
    if (addrCandidate && EVM_ADDRESS_LOWER.test(addrCandidate)) {
      addresses.add(addrCandidate);
    }
  }
  return [...addresses];
}

/** Solana pubkeys linked to this Privy user (embedded + external). */
export async function collectLinkedSolanaAddressesForPrivyUserId(
  userId: string,
): Promise<string[]> {
  const privy = getPrivyClient();
  const user = await privy.getUser(userId);
  const addresses = new Set<string>();
  for (const account of user?.linkedAccounts ?? []) {
    if (!isWalletAccount(account)) continue;
    const chainType =
      (account as { chainType?: string; chain_type?: string }).chainType ??
      (account as { chain_type?: string }).chain_type;
    if (chainType !== "solana") continue;
    const addr = account.address?.trim();
    if (addr && isValidSolanaAddress(addr)) {
      addresses.add(addr);
    }
  }
  return [...addresses];
}
