import type { NextRequest } from "next/server";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { collectLinkedEvmAddressesForPrivyUserId } from "@/app/lib/privy";
import { getAggregatorSenderApiKey } from "@/app/lib/server-config";
import { supabaseAdmin } from "@/app/lib/supabase";

const EVM_ADDRESS_LOWER = /^0x[a-f0-9]{40}$/;

/**
 * Confirms the transaction row's wallet_address belongs to the JWT user (Privy
 * linked_accounts). Middleware pins x-wallet-address to the primary EOA, but
 * rows may be stored under smart wallet or injected addresses.
 */
export async function assertTransactionWalletMatchesJwtUser(
  request: NextRequest,
  rowWalletAddress: string | null | undefined,
): Promise<
  | { ok: true; normalizedRowWallet: string }
  | { ok: false; status: 401 | 404 | 503; error: string }
> {
  const normalized = String(rowWalletAddress ?? "").toLowerCase();
  if (!EVM_ADDRESS_LOWER.test(normalized)) {
    return {
      ok: false,
      status: 404,
      error: "Transaction not found or unauthorized",
    };
  }

  const privyUserId = request.headers.get("x-user-id");
  if (!privyUserId) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  try {
    const linked = await collectLinkedEvmAddressesForPrivyUserId(privyUserId);
    if (!linked.includes(normalized)) {
      return {
        ok: false,
        status: 404,
        error: "Transaction not found or unauthorized",
      };
    }
  } catch (e) {
    console.error("Privy linked-wallet check for transaction update:", e);
    return {
      ok: false,
      status: 503,
      error: "Unable to verify wallet ownership. Please try again.",
    };
  }

  return { ok: true, normalizedRowWallet: normalized };
}

/**
 * Sender orders created by Noblocks carry their creator in the aggregator `reference`:
 * `nb-<nonce>-<mac>`, where mac is an HMAC of the creator's user id (`x-user-id`) and
 * the nonce. The server sets it when it creates the order, before the client ever sees
 * the order id, so ownership never depends on a client-written transaction row. Unique
 * per sender on the aggregator because of the nonce.
 */
const OWNER_REFERENCE_RE = /^nb-([0-9a-f]{16})-([0-9a-f]{32})$/;

function ownerReferenceMac(userId: string, nonce: string): string | null {
  const apiKey = getAggregatorSenderApiKey();
  if (!apiKey) return null;
  return createHmac("sha256", apiKey)
    .update(`noblocks-order-owner-v1:${userId}:${nonce}`)
    .digest("hex")
    .slice(0, 32);
}

/** Aggregator `reference` binding a new sender order to `userId`. */
export function createOrderOwnerReference(userId: string): string {
  const nonce = randomBytes(8).toString("hex");
  const mac = ownerReferenceMac(userId, nonce);
  if (!mac) throw new Error("AGGREGATOR_SENDER_API_KEY_ID is not configured");
  return `nb-${nonce}-${mac}`;
}

/**
 * "owner" / "other" for orders created with createOrderOwnerReference; "unbound" for
 * orders without one (created before it existed), which fall back to the
 * transaction-row check.
 */
export function classifyOrderOwnerReference(
  reference: unknown,
  userId: string | null,
): "owner" | "other" | "unbound" {
  const match =
    typeof reference === "string" ? OWNER_REFERENCE_RE.exec(reference) : null;
  if (!match) return "unbound";
  if (!userId) return "other";
  const expected = ownerReferenceMac(userId, match[1]);
  if (!expected) return "other";
  return timingSafeEqual(Buffer.from(match[2]), Buffer.from(expected))
    ? "owner"
    : "other";
}

// Ownership of an order never changes, and the status pages poll every few
// seconds, so a confirmed owner is remembered instead of re-asking Supabase and
// Privy on each poll. Bounded like the smart-wallet cache in privy.ts.
const ORDER_OWNER_CACHE_TTL_MS = 10 * 60 * 1000;
const ORDER_OWNER_CACHE_MAX_ENTRIES = 5000;
const orderOwnerCache = new Map<string, number>();

/**
 * Confirms a sender payment order (UUID) was created by the caller. Sender orders are
 * all read with one shared API key, so without this any signed-in user could read any
 * order, including a sell's recipient bank details.
 *
 * An order whose `reference` binds it to a creator (createOrderOwnerReference) is
 * decided by that alone. Orders created before the binding existed fall back to a
 * `transactions` row carrying the order id, stored under the header wallet or another
 * wallet linked to the same Privy user.
 */
export async function assertCallerOwnsSenderOrder(
  request: NextRequest,
  orderId: string,
  headerWalletAddress: string,
  reference: unknown,
): Promise<{ ok: true } | { ok: false; status: 401 | 404 | 503; error: string }> {
  const notFound = { ok: false as const, status: 404 as const, error: "Payment order not found" };
  const binding = classifyOrderOwnerReference(reference, request.headers.get("x-user-id"));
  if (binding === "owner") return { ok: true };
  if (binding === "other") return notFound;

  const cacheKey = `${headerWalletAddress}:${orderId.toLowerCase()}`;
  const cachedUntil = orderOwnerCache.get(cacheKey);
  if (cachedUntil && cachedUntil > Date.now()) return { ok: true };

  const { data, error } = await supabaseAdmin
    .from("transactions")
    .select("wallet_address")
    .eq("order_id", orderId)
    .limit(1);
  if (error) {
    console.error("Order ownership lookup failed:", error);
    return {
      ok: false,
      status: 503,
      error: "Unable to verify order ownership. Please try again.",
    };
  }
  const rowWallet = String(data?.[0]?.wallet_address ?? "").toLowerCase();
  if (!rowWallet) return notFound;

  if (rowWallet !== headerWalletAddress) {
    const linked = await assertTransactionWalletMatchesJwtUser(request, rowWallet);
    if (!linked.ok) {
      return linked.status === 503
        ? { ok: false, status: 503, error: linked.error }
        : notFound;
    }
  }

  orderOwnerCache.delete(cacheKey);
  if (orderOwnerCache.size >= ORDER_OWNER_CACHE_MAX_ENTRIES) {
    const oldest = orderOwnerCache.keys().next();
    if (!oldest.done) orderOwnerCache.delete(oldest.value);
  }
  orderOwnerCache.set(cacheKey, Date.now() + ORDER_OWNER_CACHE_TTL_MS);
  return { ok: true };
}
