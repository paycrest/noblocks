/**
 * Sponsored execution: bundler sends a direct tx to the user's account with callData.
 * When eip7702Authorization is provided, submits type 4 (delegation) first, then execute.
 * Ported from upgrade-server.
 */
import { getAddress, type Hash } from 'viem';
import type { PublicClient, WalletClient, Chain } from 'viem';

const RE_DELEGATE_GAS = 120_000n;
const GAS_LIMIT = 500_000n;

function multiplyByBps(value: bigint, bps: bigint): bigint {
  return (value * bps) / 10_000n;
}

function isReplacementUnderpricedError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.message.toLowerCase().includes('replacement transaction underpriced');
}

function isNonceTooLowError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.message.toLowerCase().includes('nonce too low');
}

function parseAuth(a: unknown): { address: `0x${string}`; chainId: number; nonce: number; r: `0x${string}`; s: `0x${string}`; yParity: number } {
  if (!a || typeof a !== 'object') throw new Error('eip7702Authorization is required');
  const o = a as Record<string, unknown>;
  const address = (o.address ?? o.contractAddress) as string;
  if (!address || typeof address !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error('eip7702Authorization.address or contractAddress is required (0x + 40 hex)');
  }
  const chainId = Number(o.chainId);
  if (!Number.isInteger(chainId)) throw new Error('eip7702Authorization.chainId is required');
  const nonce = Number(o.nonce ?? 0);
  const r = (typeof o.r === 'string' && o.r.startsWith('0x') ? o.r : `0x${String(o.r ?? '')}`) as `0x${string}`;
  const s = (typeof o.s === 'string' && o.s.startsWith('0x') ? o.s : `0x${String(o.s ?? '')}`) as `0x${string}`;
  const yParity = typeof o.yParity === 'number' ? o.yParity : Number(o.yParity ?? 0);
  return { address: getAddress(address) as `0x${string}`, chainId, nonce, r, s, yParity };
}

export interface ExecuteSponsoredParams {
  accountAddress: `0x${string}`;
  callData: `0x${string}`;
  eip7702Authorization?: unknown;
}

export interface ExecuteSponsoredResult {
  transactionHash: Hash;
  delegationTransactionHash?: Hash;
}

export async function executeSponsored(
  publicClient: PublicClient,
  walletClient: WalletClient,
  chain: Chain,
  params: ExecuteSponsoredParams
): Promise<ExecuteSponsoredResult> {
  let delegationTransactionHash: Hash | undefined;

  if (params.eip7702Authorization) {
    const auth = parseAuth(params.eip7702Authorization);
    delegationTransactionHash = await walletClient.sendTransaction({
      account: walletClient.account!,
      chain,
      type: 'eip7702',
      authorizationList: [auth],
      to: params.accountAddress,
      value: 0n,
      data: params.callData,
      gas: RE_DELEGATE_GAS,
      chainId: chain.id,
    });
    await publicClient.waitForTransactionReceipt({ hash: delegationTransactionHash });
    return { transactionHash: delegationTransactionHash };
  }

  const account = walletClient.account!;
  let pendingNonce = await publicClient.getTransactionCount({
    address: account.address,
    blockTag: 'pending',
  });
  const fees = await publicClient.estimateFeesPerGas();
  const maxFeePerGas =
    typeof fees.maxFeePerGas === 'bigint'
      ? multiplyByBps(fees.maxFeePerGas, 11_000n)
      : multiplyByBps(await publicClient.getGasPrice(), 11_000n);
  const maxPriorityFeePerGas =
    typeof fees.maxPriorityFeePerGas === 'bigint'
      ? multiplyByBps(fees.maxPriorityFeePerGas, 11_000n)
      : maxFeePerGas / 10n;

  const sendExecute = (nonce: number, maxFee: bigint, maxPri: bigint) =>
    walletClient.sendTransaction({
      account,
      chain,
      to: params.accountAddress,
      data: params.callData,
      value: 0n,
      gas: GAS_LIMIT,
      nonce,
      maxFeePerGas: maxFee,
      maxPriorityFeePerGas: maxPri,
    });

  let hash: Hash;
  try {
    hash = await sendExecute(Number(pendingNonce), maxFeePerGas, maxPriorityFeePerGas);
  } catch (err: unknown) {
    if (!isNonceTooLowError(err) && !isReplacementUnderpricedError(err)) throw err;
    pendingNonce = await publicClient.getTransactionCount({
      address: account.address,
      blockTag: 'pending',
    });
    const retryFees = await publicClient.estimateFeesPerGas();
    const retryMaxFee =
      typeof retryFees.maxFeePerGas === 'bigint'
        ? multiplyByBps(retryFees.maxFeePerGas, 13_000n)
        : multiplyByBps(await publicClient.getGasPrice(), 13_000n);
    const retryMaxPri =
      typeof retryFees.maxPriorityFeePerGas === 'bigint'
        ? multiplyByBps(retryFees.maxPriorityFeePerGas, 13_000n)
        : retryMaxFee / 10n;
    hash = await sendExecute(Number(pendingNonce), retryMaxFee, retryMaxPri);
  }

  return { transactionHash: hash, delegationTransactionHash };
}
