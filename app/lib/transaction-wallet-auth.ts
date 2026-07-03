import type { NextRequest } from "next/server";
import { collectLinkedEvmAddressesForPrivyUserId } from "@/app/lib/privy";

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
