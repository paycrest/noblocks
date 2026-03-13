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
  if (value === undefined || value === null || value === '') return bsc.id;
  const n = typeof value === 'string' ? Number(value) : Number(value);
  if (!Number.isInteger(n)) throw new Error('chainId must be an integer');
  if (!SUPPORTED_CHAINS[n]) {
    throw new Error(
      `Unsupported chainId: ${n}. Supported: ${Object.keys(SUPPORTED_CHAINS).join(', ')}`
    );
  }
  return n;
}

export function parseRpcUrl(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new Error('rpcUrl must be a string');
  if (!/^https?:\/\//i.test(value)) throw new Error('rpcUrl must start with http:// or https://');
  return value;
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
  rpcUrl: string
): { publicClient: PublicClient; walletClient: WalletClient; chain: Chain } {
  const entry = SUPPORTED_CHAINS[chainId];
  if (!entry) {
    throw new Error(`Unsupported chainId: ${chainId}`);
  }
  const { chain } = entry;
  const account = getSponsorAccount();
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });
  return { publicClient, walletClient, chain };
}

export { SUPPORTED_CHAINS };
