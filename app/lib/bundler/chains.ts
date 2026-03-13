/**
 * Bundler chain config and client creation (server-only).
 * Uses SPONSOR_EVM_WALLET_PRIVATE_KEY or PRIVATE_KEY from env for the sponsor wallet.
 */
import { createPublicClient, createWalletClient, http, type PublicClient, type WalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc, base, arbitrum, polygon, mainnet, lisk, celo, type Chain } from 'viem/chains';

const SUPPORTED_CHAINS: Record<number, { chain: Chain; envKey: string }> = {
  [bsc.id]: { chain: bsc, envKey: 'BSC' },
  [base.id]: { chain: base, envKey: 'BASE' },
  [arbitrum.id]: { chain: arbitrum, envKey: 'ARB' },
  [polygon.id]: { chain: polygon, envKey: 'POLYGON' },
  [mainnet.id]: { chain: mainnet, envKey: 'ETHEREUM' },
  [lisk.id]: { chain: lisk, envKey: 'LISK' },
  [celo.id]: { chain: celo, envKey: 'CELO' },
};

export function parseChainId(value: unknown): number {
  if (value === undefined || value === null || value === '') {
    throw new Error('Missing or empty chainId');
  }
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new Error('chainId must be a finite positive integer');
  }
  if (!SUPPORTED_CHAINS[n]) {
    throw new Error(
      `Unsupported chainId: ${n}. Supported: ${Object.keys(SUPPORTED_CHAINS).join(', ')}`
    );
  }
  return n;
}

/**
 * Returns the RPC URL for the given chain from server-side config only.
 * Callers must not pass client-supplied URLs; this prevents SSRF (arbitrary host proxying).
 */
export function parseRpcUrl(chainId: number): string {
  const entry = SUPPORTED_CHAINS[chainId];
  if (!entry) {
    throw new Error(`Unsupported chainId: ${chainId}. Supported: ${Object.keys(SUPPORTED_CHAINS).join(', ')}`);
  }
  const clientId = process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID?.trim();
  if (!clientId) {
    throw new Error('NEXT_PUBLIC_THIRDWEB_CLIENT_ID is required for bundler RPC');
  }
  return `https://${chainId}.rpc.thirdweb.com/${clientId}`;
}

function getSponsorPrivateKey(): `0x${string}` {
  const key = (process.env.SPONSOR_EVM_WALLET_PRIVATE_KEY ?? process.env.PRIVATE_KEY ?? '').trim();
  if (!key) {
    throw new Error('SPONSOR_EVM_WALLET_PRIVATE_KEY or PRIVATE_KEY is required for bundler operations');
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error('SPONSOR_EVM_WALLET_PRIVATE_KEY / PRIVATE_KEY must be a 32-byte hex string (0x + 64 hex)');
  }
  return key as `0x${string}`;
}

let cachedAccount: ReturnType<typeof privateKeyToAccount> | null = null;

function getSponsorAccount() {
  if (!cachedAccount) {
    cachedAccount = privateKeyToAccount(getSponsorPrivateKey());
  }
  return cachedAccount;
}

export function getClients(
  chainId: number,
  rpcUrl: string,
  includeWallet: boolean = true
): { publicClient: PublicClient; walletClient: WalletClient | undefined; chain: Chain } {
  const entry = SUPPORTED_CHAINS[chainId];
  if (!entry) {
    throw new Error(`Unsupported chainId: ${chainId}`);
  }
  const { chain } = entry;
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  let walletClient: WalletClient | undefined;
  if (includeWallet) {
    const account = getSponsorAccount();
    walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });
  }
  return { publicClient, walletClient, chain };
}

export { SUPPORTED_CHAINS };
