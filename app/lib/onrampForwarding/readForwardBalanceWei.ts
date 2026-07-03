import { createPublicClient, http, erc20Abi, type Chain } from "viem";

/**
 * Read a wallet's fresh on-chain token balance (wei) for the leg-2 forwarding decision.
 *
 * We read directly from RPC rather than the BalanceContext float map because (a) the decision is
 * money-movement and must be authoritative/bigint-exact, and (b) reading context state right after
 * an async `refreshBalance()` returns a stale closure value. Mirrors the public client setup in
 * `useSmartWalletTransfer`.
 */
export async function readForwardBalanceWei(params: {
  chain: Chain;
  rpcUrl: string;
  owner: `0x${string}`;
  token: { address?: string; isNative?: boolean };
}): Promise<bigint> {
  const { chain, rpcUrl, owner, token } = params;
  const client = createPublicClient({ chain, transport: http(rpcUrl) });

  if (token.isNative && (!token.address || token.address === "")) {
    return client.getBalance({ address: owner });
  }

  if (!token.address) {
    throw new Error("Token address missing for balance read");
  }

  return client.readContract({
    address: token.address as `0x${string}`,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner],
  });
}
