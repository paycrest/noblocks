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

const EVM_ADDRESS_LOWER = /^0x[a-f0-9]{40}$/;

function readLinkedEvmAddress(account: unknown): string | null {
  if (!account || typeof account !== "object") return null;
  const addr = (account as { address?: unknown }).address;
  return typeof addr === "string" && EVM_ADDRESS_LOWER.test(addr.toLowerCase())
    ? addr.toLowerCase()
    : null;
}

function readLinkedStarknetAddress(account: unknown): string | null {
  if (!account || typeof account !== "object") return null;
  const addr = (account as { address?: unknown }).address;
  return typeof addr === "string" ? addr : null;
}

function readLinkedTronAddress(account: unknown): string | null {
  if (!account || typeof account !== "object") return null;
  const addr = (account as { address?: unknown }).address;
  return typeof addr === "string" && addr.length > 0 ? addr : null;
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

  const smartAddr = readLinkedEvmAddress(smartWallet);
  const embeddedAddr = readLinkedEvmAddress(embedded);

  return {
    primaryEvm,
    evmBalanceAddress: smartAddr ?? embeddedAddr ?? primaryEvm,
    starknetAddress: readLinkedStarknetAddress(starknet),
    tronAddress: readLinkedTronAddress(tron),
  };
}
