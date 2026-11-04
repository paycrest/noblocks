import { networks } from "@/app/mocks";
import { getExplorerLink } from "@/app/utils";

const ALLOWLISTED_NETWORK_NAMES = new Set(
  networks.map((entry) => entry.chain.name),
);

function isValidTxHashForNetwork(hash: string, networkName: string): boolean {
  if (networkName === "Tron") {
    return /^[a-fA-F0-9]{64}$/.test(hash);
  }
  if (networkName === "Starknet") {
    return /^0x[a-fA-F0-9]+$/.test(hash);
  }
  return /^0x[a-fA-F0-9]+$/.test(hash);
}

/**
 * Block explorer URL for configured Noblocks networks only. Never derives URLs
 * from user-controlled strings beyond an opaque tx hash on an allowlisted chain.
 */
export function getAllowlistedExplorerUrl(
  networkName: string,
  txHash: string | undefined | null,
): string | null {
  const hash = txHash?.trim();
  if (!hash) {
    return null;
  }
  if (!ALLOWLISTED_NETWORK_NAMES.has(networkName)) {
    return null;
  }
  if (!isValidTxHashForNetwork(hash, networkName)) {
    return null;
  }
  const url = getExplorerLink(networkName, hash);
  return url || null;
}

export function getAllowlistedExplorerUrlByChainId(
  chainId: number | string,
  txHash: string | undefined | null,
): string | null {
  const match = networks.find(
    (entry) =>
      entry.chain.id === chainId ||
      String(entry.chain.id) === String(chainId),
  );
  if (!match) {
    return null;
  }
  return getAllowlistedExplorerUrl(match.chain.name, txHash);
}
