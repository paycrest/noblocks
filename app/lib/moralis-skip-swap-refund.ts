import { isPaycrestGatewayAddress } from "@/app/utils";
import { SWAP_ORDER_TRANSACTION_TYPES } from "@/app/types";
import { supabaseAdmin } from "@/app/lib/supabase";

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

async function swapOrderExists(
  walletAddress: string,
  filters: Record<string, string>,
): Promise<boolean> {
  let query = supabaseAdmin
    .from("transactions")
    .select("id")
    .eq("wallet_address", normalizeAddress(walletAddress))
    .in("transaction_type", [...SWAP_ORDER_TRANSACTION_TYPES]);

  for (const [column, value] of Object.entries(filters)) {
    query = query.eq(column, value);
  }

  const { data, error } = await query.limit(1);
  if (error) {
    console.error("[moralis refund-skip] swap order lookup failed", error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/**
 * Skip Moralis deposit email + `credit` row when an inbound transfer is a failed-swap refund,
 * not a user-initiated deposit.
 */
export async function shouldSkipMoralisDepositAsSwapRefund(params: {
  walletAddress: string;
  txHash: string;
  fromAddress?: string;
}): Promise<boolean> {
  if (isPaycrestGatewayAddress(params.fromAddress)) {
    return true;
  }
  if (
    await swapOrderExists(params.walletAddress, {
      tx_hash: normalizeAddress(params.txHash),
    })
  ) {
    return true;
  }
  if (
    await swapOrderExists(params.walletAddress, { status: "refunding" })
  ) {
    return true;
  }
  return false;
}
