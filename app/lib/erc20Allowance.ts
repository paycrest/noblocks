import { createPublicClient, http, erc20Abi, type Chain } from "viem";

/**
 * Multiple of the spend we approve when an approve is needed at all. The gateway only ever
 * transfers `amount + senderFee`; the headroom exists so the *next* swap of the same size finds
 * enough allowance and needs no second approval prompt. The flip side is a standing allowance on
 * the gateway after the order settles — that is the trade we are making for one less prompt.
 */
export const GATEWAY_APPROVAL_MULTIPLIER = BigInt(10);

/** The amount to pass to `approve` for a spend of `required`. */
export function gatewayApprovalAmount(required: bigint): bigint {
  return required * GATEWAY_APPROVAL_MULTIPLIER;
}

/**
 * Whether an `approve` must be sent before the order.
 *
 * Fails open: a null allowance means we could not read it (RPC error, missing RPC URL, unmapped
 * token/spender), and an unknown allowance must never let us skip a required approval.
 */
export function needsApproval(
  allowance: bigint | null,
  required: bigint,
): boolean {
  return allowance === null || allowance < required;
}

/**
 * Read `allowance(owner, spender)` fresh from RPC, or null when it cannot be read.
 *
 * Read on-chain rather than from any cached context because this gates money movement and must be
 * authoritative and bigint-exact. Mirrors the public client setup in `readForwardBalanceWei`.
 */
export async function readErc20Allowance(params: {
  chain: Chain;
  rpcUrl: string | undefined;
  token: string | undefined;
  owner: string | undefined;
  spender: string | undefined;
}): Promise<bigint | null> {
  const { chain, rpcUrl, token, owner, spender } = params;

  // No RPC URL means viem would silently fall back to the chain's default transport; prefer an
  // explicit "unknown" over a read against an RPC we did not choose.
  if (!rpcUrl || !token || !owner || !spender) return null;

  try {
    const client = createPublicClient({ chain, transport: http(rpcUrl) });
    return await client.readContract({
      address: token as `0x${string}`,
      abi: erc20Abi,
      functionName: "allowance",
      args: [owner as `0x${string}`, spender as `0x${string}`],
    });
  } catch {
    return null;
  }
}

/** Convenience: read the allowance and decide, failing open on an unreadable allowance. */
export async function needsGatewayApproval(params: {
  chain: Chain;
  rpcUrl: string | undefined;
  token: string | undefined;
  owner: string | undefined;
  spender: string | undefined;
  required: bigint;
}): Promise<boolean> {
  const allowance = await readErc20Allowance(params);
  return needsApproval(allowance, params.required);
}
