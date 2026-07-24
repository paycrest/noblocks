/**
 * Bundler chain config and client creation (server-only).
 * Uses SPONSOR_EVM_WALLET_PRIVATE_KEY or PRIVATE_KEY from env for the sponsor wallet.
 */
import { createPublicClient, createWalletClient, http, type PublicClient, type WalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc, base, arbitrum, polygon, mainnet, lisk, celo, type Chain } from 'viem/chains';
import { getRpcUrl } from '@/app/utils';

const SUPPORTED_CHAINS: Record<number, { chain: Chain; envKey: string; networkName: string }> = {
  [bsc.id]: { chain: bsc, envKey: 'BSC', networkName: 'BNB Smart Chain' },
  [base.id]: { chain: base, envKey: 'BASE', networkName: 'Base' },
  [arbitrum.id]: { chain: arbitrum, envKey: 'ARB', networkName: 'Arbitrum One' },
  [polygon.id]: { chain: polygon, envKey: 'POLYGON', networkName: 'Polygon' },
  [mainnet.id]: { chain: mainnet, envKey: 'ETHEREUM', networkName: 'Ethereum' },
  [lisk.id]: { chain: lisk, envKey: 'LISK', networkName: 'Lisk' },
  [celo.id]: { chain: celo, envKey: 'CELO', networkName: 'Celo' },
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
  const rpcUrl = getRpcUrl(entry.networkName);
  if (!rpcUrl) {
    throw new Error(`No RPC URL configured for network: ${entry.networkName}`);
  }
  return rpcUrl;
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
