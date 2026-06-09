/**
 * Sponsored execution: bundler sends a direct tx to the user's account with callData.
 * When eip7702Authorization is provided, submits type 4 (delegation) first, then execute.
 * If the EOA is already delegated to the expected contract, skips type-4 and sends execute-only (avoids repeated delegation txs).
 * Ported from upgrade-server.
 */
import { getAddress, type Hash } from 'viem';
import type { PublicClient, WalletClient, Chain } from 'viem';

const RE_DELEGATE_GAS = BigInt(120000);
const GAS_LIMIT = BigInt(500000);
const EIP7702_MAGIC_PREFIX = '0xef0100';

/** Returns the EIP-7702 delegated implementation address from EOA bytecode, or null if not delegated / wrong format. */
async function get7702ImplementationAddress(
  publicClient: PublicClient,
  address: `0x${string}`
): Promise<string | null> {
  const code = await publicClient.getCode({ address });
  if (!code || code === '0x' || code === '0x0') return null;
  const normalized = code.toLowerCase();
  const idx = normalized.indexOf(EIP7702_MAGIC_PREFIX);
  if (idx === -1) return null;
  return `0x${normalized.slice(idx + EIP7702_MAGIC_PREFIX.length, idx + EIP7702_MAGIC_PREFIX.length + 40)}`;
}

function multiplyByBps(value: bigint, bps: bigint): bigint {
  return (value * bps) / BigInt(10000);
}

function isReplacementUnderpricedError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.message.toLowerCase().includes('replacement transaction underpriced');
}

/** Collect all text from viem error chains, including plain-object RPC causes. */
function stringifyViemError(err: unknown): string {
  const parts: string[] = [];

  function walk(e: unknown, depth: number): void {
    if (depth > 14 || e == null) return;
    if (e instanceof Error) {
      parts.push(e.message);
      const any = e as Error & { details?: string; shortMessage?: string; cause?: unknown };
      if (typeof any.details === 'string') parts.push(any.details);
      if (typeof any.shortMessage === 'string') parts.push(any.shortMessage);
      walk(any.cause, depth + 1);
      return;
    }
    if (typeof e === 'object') {
      const o = e as Record<string, unknown>;
      if (typeof o.message === 'string') parts.push(o.message);
      if (typeof o.details === 'string') parts.push(o.details);
      if (typeof o.shortMessage === 'string') parts.push(o.shortMessage);
      walk(o.cause, depth + 1);
    }
  }

  walk(err, 0);
  return parts.join('\n').toLowerCase();
}

/** RPC often returns `nonce too low: next nonce 647, tx nonce 646` — use this when getTransactionCount is stale. */
function parseNextNonceFromErrorText(text: string): number | undefined {
  const m = text.match(/next nonce (\d+)/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) && n >= 0 ? n : undefined;
}

/** Next tx nonce: max(latest, pending) avoids archive/sequencer mismatch; some nodes return stale `pending`. */
async function getNextTxNonce(
  publicClient: PublicClient,
  address: `0x${string}`
): Promise<bigint> {
  const [latest, pending] = await Promise.all([
    publicClient.getTransactionCount({ address, blockTag: 'latest' }),
    publicClient.getTransactionCount({ address, blockTag: 'pending' }),
  ]);
  return BigInt(Math.max(Number(latest), Number(pending)));
}

function isNonceTooLowError(err: unknown): boolean {
  const text = stringifyViemError(err);
  return (
    text.includes('nonce too low') ||
    text.includes('lower than the current nonce') ||
    (text.includes('nonce provided for the transaction') && text.includes('lower than'))
  );
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
    const expectedContract = auth.address.toLowerCase();
    const currentImplementation = await get7702ImplementationAddress(publicClient, params.accountAddress);
    const alreadyDelegated =
      currentImplementation != null && currentImplementation.toLowerCase() === expectedContract;

    if (!alreadyDelegated) {
      delegationTransactionHash = await walletClient.sendTransaction({
        account: walletClient.account!,
        chain,
        type: 'eip7702',
        authorizationList: [auth],
        to: params.accountAddress,
        value: BigInt(0),
        data: params.callData,
        gas: RE_DELEGATE_GAS,
        chainId: chain.id,
      });
      await publicClient.waitForTransactionReceipt({ hash: delegationTransactionHash });
      return { transactionHash: delegationTransactionHash, delegationTransactionHash };
    }
    // Already delegated to the expected contract: fall through to execute-only path (no type-4).
  }

  const account = walletClient.account!;

  const sendExecute = (nonce: number, maxFee: bigint, maxPri: bigint) =>
    walletClient.sendTransaction({
      account,
      chain,
      to: params.accountAddress,
      data: params.callData,
      value: BigInt(0),
      gas: GAS_LIMIT,
      nonce,
      maxFeePerGas: maxFee,
      maxPriorityFeePerGas: maxPri,
    });

  const maxAttempts = 3;
  let hash: Hash | undefined;
  let suggestedNextNonce: number | undefined;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const bps = attempt === 0 ? BigInt(11000) : BigInt(13000);
    let pendingNonce = await getNextTxNonce(publicClient, account.address);
    if (suggestedNextNonce !== undefined) {
      const fromErr = BigInt(suggestedNextNonce);
      pendingNonce = pendingNonce > fromErr ? pendingNonce : fromErr;
      suggestedNextNonce = undefined;
    }
    const fees = await publicClient.estimateFeesPerGas();
    const maxFeePerGas =
      typeof fees.maxFeePerGas === 'bigint'
        ? multiplyByBps(fees.maxFeePerGas, bps)
        : multiplyByBps(await publicClient.getGasPrice(), bps);
    const maxPriorityFeePerGas =
      typeof fees.maxPriorityFeePerGas === 'bigint'
        ? multiplyByBps(fees.maxPriorityFeePerGas, bps)
        : maxFeePerGas / BigInt(10);

    try {
      hash = await sendExecute(Number(pendingNonce), maxFeePerGas, maxPriorityFeePerGas);
      break;
    } catch (err: unknown) {
      const retryable =
        (isNonceTooLowError(err) || isReplacementUnderpricedError(err)) && attempt < maxAttempts - 1;
      if (!retryable) throw err;
      suggestedNextNonce = parseNextNonceFromErrorText(stringifyViemError(err));
    }
  }

  if (!hash) throw new Error('execute-sponsored: no transaction hash after retries');

  return { transactionHash: hash, delegationTransactionHash };
}
