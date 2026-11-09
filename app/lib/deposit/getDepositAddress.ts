import { normalizeStarknetAddress } from "../../utils";

/**
 * Session-wallet inputs for `getDepositAddress`. Mirrors the sources
 * `useWalletAddress` (`app/hooks/useWalletAddress.ts`) and `FundWalletForm`
 * (`app/components/FundWalletForm.tsx`) read from — never a query param.
 */
export type DepositAddressSources = {
  isInjectedWallet: boolean;
  injectedAddress?: string | null;
  starknetAddress?: string | null;
  tronAddress?: string | null;
  evmEmbeddedLinkedAddress?: string | null;
  evmEmbeddedWalletAddress?: string | null;
  evmSmartWalletAddress?: string | null;
  shouldUseEOA: boolean;
};

export type DepositAddressResult = { address: string };

function isStarknetNetwork(network: string): boolean {
  return network === "Starknet";
}

function isTronNetwork(network: string): boolean {
  return network === "Tron";
}

function isSolanaNetwork(network: string): boolean {
  return network === "Solana";
}

/**
 * Synchronous session-wallet lookup, parameterized by `network` instead of
 * `NetworksContext.selectedNetwork`. Same branches as `useWalletAddress`.
 */
export function resolveSessionWalletAddress(
  network: string,
  sources: DepositAddressSources,
): string | undefined {
  if (sources.isInjectedWallet) {
    return sources.injectedAddress ?? undefined;
  }

  // v1 has no Solana wallet context (KAN-756). Surface as unavailable.
  if (isSolanaNetwork(network)) {
    return undefined;
  }

  if (isStarknetNetwork(network)) {
    if (!sources.starknetAddress) {
      return undefined;
    }
    try {
      return (
        normalizeStarknetAddress(sources.starknetAddress) ??
        sources.starknetAddress
      );
    } catch {
      return undefined;
    }
  }

  if (isTronNetwork(network)) {
    return sources.tronAddress ?? undefined;
  }

  // EVM (Polygon, BNB Smart Chain, Base, Arbitrum One, Ethereum, Celo, …):
  // `useShouldUseEOA()` currently always returns true, so this is the embedded
  // EOA. The SCW branch is kept to match v1 until those call sites are removed.
  if (sources.shouldUseEOA) {
    return (
      sources.evmEmbeddedLinkedAddress ??
      sources.evmEmbeddedWalletAddress ??
      undefined
    );
  }
  return sources.evmSmartWalletAddress ?? undefined;
}

/**
 * Address source for the deposit drawer. Same session-wallet logic as v1
 * Receive / Fund wallet — swap the body later if wallet infra changes (KAN-910).
 *
 * `sources` is required because the address is session state, not a query
 * param. UI code should call `useGetDepositAddress()` which binds sources
 * and exposes `(network) => Promise<{ address }>`.
 */
export async function getDepositAddress(
  network: string,
  sources: DepositAddressSources,
): Promise<DepositAddressResult> {
  const address = resolveSessionWalletAddress(network, sources);
  if (!address) {
    throw new Error("Wallet address unavailable for this network");
  }
  return { address };
}
