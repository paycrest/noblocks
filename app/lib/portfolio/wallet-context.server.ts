import "server-only";

import { getPrivyClient } from "@/app/lib/privy";
import { isInjectedUserId } from "@/app/lib/injected-identity";

export type PortfolioWalletContext = {
  primaryEvm: string;
  /** Address used for EVM multicall balance reads (SCW when present). */
  evmBalanceAddress: string;
  starknetAddress: string | null;
  tronAddress: string | null;
};

function readLinkedAddress(
  account: unknown,
  predicate: (a: Record<string, unknown>) => boolean,
): string | null {
  if (!account || typeof account !== "object") return null;
  const o = account as Record<string, unknown>;
  if (!predicate(o)) return null;
  const addr = o.address;
  return typeof addr === "string" ? addr.toLowerCase() : null;
}

export async function resolvePortfolioWalletContext(
  privyUserId: string,
  middlewareWallet: string,
): Promise<PortfolioWalletContext> {
  const primaryEvm = middlewareWallet.toLowerCase();

  if (isInjectedUserId(privyUserId)) {
    return {
      primaryEvm,
      evmBalanceAddress: primaryEvm,
      starknetAddress: null,
      tronAddress: null,
    };
  }

  const user = await getPrivyClient().getUser(privyUserId);
  const accounts = user?.linkedAccounts ?? [];

  const smartWallet = accounts.find(
    (a) => (a as { type?: string }).type === "smart_wallet",
  );
  const embedded = accounts.find((a) => {
    const o = a as { type?: string; connectorType?: string; connector_type?: string };
    return (
      o.type === "wallet" &&
      (o.connectorType === "embedded" || o.connector_type === "embedded")
    );
  });

  const starknet = accounts.find((a) => {
    const o = a as { type?: string; chainType?: string; chain_type?: string };
    return (
      o.type === "wallet" &&
      (o.chainType === "starknet" || o.chain_type === "starknet")
    );
  });

  const tron = accounts.find((a) => {
    const o = a as { type?: string; chainType?: string; chain_type?: string };
    return (
      o.type === "wallet" &&
      (o.chainType === "tron" || o.chain_type === "tron")
    );
  });

  const smartAddr = readLinkedAddress(smartWallet, () => true);
  const embeddedAddr = readLinkedAddress(embedded, () => true);

  return {
    primaryEvm,
    evmBalanceAddress: smartAddr ?? embeddedAddr ?? primaryEvm,
    starknetAddress: readLinkedAddress(starknet, () => true),
    tronAddress: readLinkedAddress(tron, () => true),
  };
}
