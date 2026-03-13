import {
  encodeFunctionData,
  encodeAbiParameters,
  getAddress,
  decodeErrorResult,
  parseAbi,
  type PublicClient,
  type WalletClient,
  type Hash,
} from 'viem';
import { type Chain } from 'viem/chains';
import { versionConfig, ENTRY_POINT_ADDRESS, GAS_CONFIG, deployFactoryConfig } from './config';

// EntryPoint v0.6 custom errors so we can decode revert reason from _validateAccountPrepayment etc.
const ENTRY_POINT_ERRORS_ABI = [
  {
    type: 'error',
    name: 'FailedOp',
    inputs: [
      { name: 'opIndex', type: 'uint256' },
      { name: 'reason', type: 'string' },
    ],
  },
  {
    type: 'error',
    name: 'SignatureValidationFailed',
    inputs: [{ name: 'aggregator', type: 'address' }],
  },
] as const;

// UserOperation type for ERC-4337 v0.6
export interface UserOperation {
  sender: `0x${string}`;
  nonce: bigint;
  initCode: `0x${string}`;
  callData: `0x${string}`;
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  paymasterAndData: `0x${string}`;
  signature: `0x${string}`;
}

// Serialized version for JSON transport
export interface SerializedUserOperation {
  sender: `0x${string}`;
  nonce: string;
  initCode: `0x${string}`;
  callData: `0x${string}`;
  callGasLimit: string;
  verificationGasLimit: string;
  preVerificationGas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  paymasterAndData: `0x${string}`;
  signature: `0x${string}`;
}

// ABI fragments
const ENTRY_POINT_ABI = [
  {
    name: 'getNonce',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'sender', type: 'address' },
      { name: 'key', type: 'uint192' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getUserOpHash',
    stateMutability: 'view',
    inputs: [
      {
        name: 'userOp',
        type: 'tuple',
        components: [
          { name: 'sender', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'initCode', type: 'bytes' },
          { name: 'callData', type: 'bytes' },
          { name: 'callGasLimit', type: 'uint256' },
          { name: 'verificationGasLimit', type: 'uint256' },
          { name: 'preVerificationGas', type: 'uint256' },
          { name: 'maxFeePerGas', type: 'uint256' },
          { name: 'maxPriorityFeePerGas', type: 'uint256' },
          { name: 'paymasterAndData', type: 'bytes' },
          { name: 'signature', type: 'bytes' },
        ],
      },
    ],
    outputs: [{ type: 'bytes32' }],
  },
  {
    name: 'handleOps',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'ops',
        type: 'tuple[]',
        components: [
          { name: 'sender', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'initCode', type: 'bytes' },
          { name: 'callData', type: 'bytes' },
          { name: 'callGasLimit', type: 'uint256' },
          { name: 'verificationGasLimit', type: 'uint256' },
          { name: 'preVerificationGas', type: 'uint256' },
          { name: 'maxFeePerGas', type: 'uint256' },
          { name: 'maxPriorityFeePerGas', type: 'uint256' },
          { name: 'paymasterAndData', type: 'bytes' },
          { name: 'signature', type: 'bytes' },
        ],
      },
      { name: 'beneficiary', type: 'address' },
    ],
    outputs: [],
  },
] as const;

const GET_SENDER_ADDRESS_ABI = [
  {
    name: 'getSenderAddress',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'initCode', type: 'bytes' }],
    outputs: [],
  },
] as const;

/**
 * Derives initCode for the given EOA owner using the configured factory and module.
 * Factory: deployCounterFactualAccount(moduleSetupContract, moduleSetupData, index).
 * Module: initForSmartAccount(eoaOwner).
 */
export function deriveInitCode(
  ownerAddress: `0x${string}`,
  index = 0
): `0x${string}` {
  const moduleSetupData = encodeFunctionData({
    abi: [
      {
        name: 'initForSmartAccount',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [{ name: 'eoaOwner', type: 'address' }],
        outputs: [{ type: 'address' }],
      },
    ],
    functionName: 'initForSmartAccount',
    args: [getAddress(ownerAddress)],
  });

  const factoryCalldata = encodeFunctionData({
    abi: [
      {
        name: 'deployCounterFactualAccount',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
          { name: 'moduleSetupContract', type: 'address' },
          { name: 'moduleSetupData', type: 'bytes' },
          { name: 'index', type: 'uint256' },
        ],
        outputs: [{ name: 'proxy', type: 'address' }],
      },
    ],
    functionName: 'deployCounterFactualAccount',
    args: [
      getAddress(deployFactoryConfig.moduleSetupContract) as `0x${string}`,
      moduleSetupData,
      BigInt(index),
    ],
  });

  const factoryHex = getAddress(deployFactoryConfig.factoryAddress).slice(2).toLowerCase();
  return (`0x${factoryHex}${factoryCalldata.slice(2)}`) as `0x${string}`;
}

/**
 * Returns the address that would be deployed by initCode (EntryPoint.getSenderAddress).
 * getSenderAddress reverts with selector 0x6ca7b806 + ABI-encoded address; we read .raw from the error.
 */
export async function getSenderAddressFromInitCode(
  publicClient: PublicClient,
  initCode: `0x${string}`
): Promise<`0x${string}`> {
  try {
    await publicClient.readContract({
      address: ENTRY_POINT_ADDRESS,
      abi: GET_SENDER_ADDRESS_ABI,
      functionName: 'getSenderAddress',
      args: [initCode],
    });
  } catch (err: unknown) {
    const hex = getRevertData(err);
    if (hex && hex.length >= 2 + 8 + 64) {
      // Revert: 4-byte selector (0x6ca7b806) + 32-byte padded address
      const raw = hex.slice(2);
      const addrHex = raw.slice(-40);
      return getAddress(('0x' + addrHex) as `0x${string}`) as `0x${string}`;
    }
    if (hex && hex.length >= 2 + 40) {
      const raw = hex.slice(2);
      const addrHex = raw.length >= 64 ? raw.slice(-40) : raw.slice(0, 40);
      return getAddress(('0x' + addrHex) as `0x${string}`) as `0x${string}`;
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`getSenderAddress failed: ${msg}`);
  }
  throw new Error('getSenderAddress did not revert (unexpected)');
}

/**
 * Generates the calldata for the upgrade operation
 * @param deploymentOnly - when true, only include updateImplementation (no initializeAccount); use when account was just deployed via initCode
 */
function generateUpgradeCalldata(
  smartAccountAddress: `0x${string}`,
  ownerAddress: `0x${string}`,
  options?: { deploymentOnly?: boolean }
): `0x${string}` {
  // Encode updateImplementation call (getAddress for EIP-55 checksum so viem accepts it)
  const implementationAddress = getAddress(versionConfig.implementationAddress);
  const updateImplementationCalldata = encodeFunctionData({
    abi: [
      {
        name: 'updateImplementation',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [{ name: 'newImplementation', type: 'address' }],
        outputs: [],
      },
    ],
    functionName: 'updateImplementation',
    args: [implementationAddress],
  });

  // Prepare initialization data for the validator
  const initData = encodeFunctionData({
    abi: [
      {
        name: 'initNexusWithDefaultValidator',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [{ type: 'bytes', name: 'data' }],
        outputs: [],
      },
    ],
    functionName: 'initNexusWithDefaultValidator',
    args: [ownerAddress],
  });

  // Encode bootstrap data (getAddress for EIP-55 checksum)
  const bootStrapAddress = getAddress(versionConfig.bootStrapAddress);
  const initDataWithBootstrap = encodeAbiParameters(
    [
      { name: 'bootstrap', type: 'address' },
      { name: 'initData', type: 'bytes' },
    ],
    [bootStrapAddress, initData]
  );

  // When deploymentOnly, skip initializeAccount (factory already ran it during deploy)
  if (options?.deploymentOnly) {
    const executeCalldata = encodeFunctionData({
      abi: [
        {
          name: 'executeBatch',
          type: 'function',
          stateMutability: 'nonpayable',
          inputs: [
            { name: 'dest', type: 'address[]' },
            { name: 'value', type: 'uint256[]' },
            { name: 'func', type: 'bytes[]' },
          ],
          outputs: [],
        },
      ],
      functionName: 'executeBatch',
      args: [[smartAccountAddress], [0n], [updateImplementationCalldata]],
    });
    return executeCalldata;
  }

  // Create initializeAccount calldata
  const initializeNexusCalldata = encodeFunctionData({
    abi: [
      {
        name: 'initializeAccount',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [{ type: 'bytes', name: 'data' }],
        outputs: [],
      },
    ],
    functionName: 'initializeAccount',
    args: [initDataWithBootstrap],
  });

  // Wrap in executeBatch
  const executeCalldata = encodeFunctionData({
    abi: [
      {
        name: 'executeBatch',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
          { name: 'dest', type: 'address[]' },
          { name: 'value', type: 'uint256[]' },
          { name: 'func', type: 'bytes[]' },
        ],
        outputs: [],
      },
    ],
    functionName: 'executeBatch',
    args: [
      [smartAccountAddress, smartAccountAddress],
      [0n, 0n],
      [updateImplementationCalldata, initializeNexusCalldata],
    ],
  });

  return executeCalldata;
}

/**
 * Returns the same calldata as generateUpgradeCalldata plus a human-readable breakdown.
 * Use for debugging or to inspect what is sent to the smart account.
 */
export function getUpgradeCalldataBreakdown(
  smartAccountAddress: `0x${string}`,
  ownerAddress: `0x${string}`
): {
  callData: `0x${string}`;
  target: string;
  function: string;
  breakdown: {
    executeBatch: {
      dest: string[];
      value: string[];
      calls: Array<{ name: string; calldata: string; description: string }>;
    };
  };
} {
  const implementationAddress = getAddress(versionConfig.implementationAddress);
  const bootStrapAddress = getAddress(versionConfig.bootStrapAddress);

  const updateImplementationCalldata = encodeFunctionData({
    abi: [
      {
        name: 'updateImplementation',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [{ name: 'newImplementation', type: 'address' }],
        outputs: [],
      },
    ],
    functionName: 'updateImplementation',
    args: [implementationAddress],
  });

  const initData = encodeFunctionData({
    abi: [
      {
        name: 'initNexusWithDefaultValidator',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [{ type: 'bytes', name: 'data' }],
        outputs: [],
      },
    ],
    functionName: 'initNexusWithDefaultValidator',
    args: [ownerAddress],
  });

  const initDataWithBootstrap = encodeAbiParameters(
    [
      { name: 'bootstrap', type: 'address' },
      { name: 'initData', type: 'bytes' },
    ],
    [bootStrapAddress, initData]
  );

  const initializeNexusCalldata = encodeFunctionData({
    abi: [
      {
        name: 'initializeAccount',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [{ type: 'bytes', name: 'data' }],
        outputs: [],
      },
    ],
    functionName: 'initializeAccount',
    args: [initDataWithBootstrap],
  });

  const callData = generateUpgradeCalldata(smartAccountAddress, ownerAddress);

  return {
    callData,
    target: smartAccountAddress,
    function: 'executeBatch(address[] dest, uint256[] value, bytes[] func)',
    breakdown: {
      executeBatch: {
        dest: [smartAccountAddress, smartAccountAddress],
        value: ['0', '0'],
        calls: [
          {
            name: 'updateImplementation(address newImplementation)',
            calldata: updateImplementationCalldata,
            description: `Set implementation to Nexus: ${implementationAddress}`,
          },
          {
            name: 'initializeAccount(bytes data)',
            calldata: initializeNexusCalldata,
            description: `Bootstrap ${bootStrapAddress} + initNexusWithDefaultValidator(owner=${ownerAddress})`,
          },
        ],
      },
    },
  };
}

/**
 * Biconomy paymaster sponsor API response (pm_sponsorUserOperation)
 */
interface PaymasterSponsorResult {
  paymasterAndData: `0x${string}`;
  preVerificationGas?: string;
  verificationGasLimit?: string;
  callGasLimit?: string;
}

/** Thrown when paymaster is configured but sponsorship fails (so we don't submit and hit AA21). */
export class PaymasterSponsorshipError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: string
  ) {
    super(message);
    this.name = 'PaymasterSponsorshipError';
  }
}

/**
 * Fetch paymasterAndData from Biconomy's pm_sponsorUserOperation (SPONSORED mode).
 * Uses your existing paymaster so the upgrade UserOp is sponsored (avoids AA21).
 * Throws PaymasterSponsorshipError when paymaster URL is used but sponsorship fails.
 */
async function fetchPaymasterAndData(
  paymasterUrl: string,
  userOp: UserOperation,
  apiKey?: string
): Promise<PaymasterSponsorResult> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) headers['x-api-key'] = apiKey;

  const body = {
    id: 1,
    jsonrpc: '2.0',
    method: 'pm_sponsorUserOperation',
    params: [
      {
        sender: userOp.sender,
        nonce: userOp.nonce.toString(),
        initCode: userOp.initCode,
        callData: userOp.callData,
        callGasLimit: userOp.callGasLimit.toString(),
        verificationGasLimit: userOp.verificationGasLimit.toString(),
        preVerificationGas: userOp.preVerificationGas.toString(),
        maxFeePerGas: userOp.maxFeePerGas.toString(),
        maxPriorityFeePerGas: userOp.maxPriorityFeePerGas.toString(),
        signature: '0x',
      },
      {
        mode: 'SPONSORED',
        calculateGasLimits: true,
        expiryDuration: 300,
        sponsorshipInfo: {
          webhookData: {},
          smartAccountInfo: { name: 'BICONOMY', version: '2.0.0' },
        },
      },
    ],
  };

  const res = await fetch(paymasterUrl, { method: 'POST', headers, body: JSON.stringify(body) });
  const resText = await res.text();
  if (!res.ok) {
    let errMsg = `Paymaster request failed (${res.status}).`;
    try {
      const errJson = JSON.parse(resText) as { error?: { message?: string } };
      const apiMsg = errJson?.error?.message;
      if (apiMsg) errMsg += ` ${apiMsg}`;
    } catch {
      /* use default */
    }
    // 417 = paymaster simulated the UserOp and it reverted (e.g. AA23). They won't sponsor; use prefund instead.
    if (res.status === 417) {
      errMsg =
        'Paymaster simulation failed (UserOp reverted or OOG). Unset PAYMASTER_URL and prefund the smart account at the EntryPoint instead.';
    }
    throw new PaymasterSponsorshipError(errMsg, res.status, resText);
  }

  let json: { result?: PaymasterSponsorResult; error?: { message: string; data?: string } };
  try {
    json = JSON.parse(resText) as typeof json;
  } catch {
    throw new PaymasterSponsorshipError('Paymaster returned invalid JSON.', undefined, resText);
  }

  if (json.error) {
    const msg = json.error.data ?? json.error.message ?? 'Unknown error';
    throw new PaymasterSponsorshipError(
      `Paymaster rejected: ${msg}. Prefund the account or fix paymaster policy.`,
      undefined,
      resText
    );
  }

  const result = json.result;
  if (!result?.paymasterAndData || result.paymasterAndData === '0x') {
    throw new PaymasterSponsorshipError(
      'Paymaster returned no sponsorship (0x). Prefund the smart account at EntryPoint or check paymaster policy/funds.',
      undefined,
      resText
    );
  }
  return result;
}

/**
 * Generates an unsigned UserOperation for account upgrade (or deploy + upgrade when not deployed).
 * - When account is deployed: initCode = '0x', callData = full upgrade (updateImplementation + initializeAccount).
 * - When account is not deployed and initCode is provided: use that initCode, nonce = 0, callData = deploymentOnly (updateImplementation only); EntryPoint will deploy then run upgrade.
 * executeUserOp (handleOps) handles both cases; prefund is applied to sender (counterfactual when initCode present).
 */
export async function generateUserOp(
  publicClient: PublicClient,
  smartAccountAddress: `0x${string}`,
  ownerAddress: `0x${string}`,
  options?: {
    paymasterUrl?: string;
    paymasterApiKey?: string;
    /** When account is not deployed, client must send initCode (factory + factoryData) so we generate a deploy+upgrade userOp. */
    initCode?: `0x${string}`;
  }
): Promise<{ userOp: SerializedUserOperation; userOpHash: `0x${string}` }> {
  const code = await publicClient.getCode({ address: smartAccountAddress });
  const isDeployed = code != null && code !== '0x' && code !== '0x0';

  const sender = smartAccountAddress;
  let initCode: `0x${string}`;
  let callData: `0x${string}`;
  let nonce: bigint;

  if (isDeployed) {
    initCode = '0x';
    callData = generateUpgradeCalldata(sender, ownerAddress);
    nonce = await publicClient.readContract({
      address: ENTRY_POINT_ADDRESS,
      abi: ENTRY_POINT_ABI,
      functionName: 'getNonce',
      args: [sender, 0n],
    }) as bigint;
  } else {
    // Not deployed: use client-provided initCode or derive from ownerAddress (factory + deployCounterFactualAccount).
    const SENTINEL_SENDER = '0x0000000000000000000000000000000000000160';
    if (smartAccountAddress.toLowerCase() === SENTINEL_SENDER) {
      throw new Error(
        'Sender cannot be the sentinel 0x160 when using initCode. Send the counterfactual address (e.g. from nexusAccount.addressOn(chainId)) so it matches the account the factory will deploy (AA14).'
      );
    }
    if (options?.initCode && options.initCode !== '0x' && options.initCode.length >= 44) {
      initCode = options.initCode as `0x${string}`;
    } else {
      initCode = deriveInitCode(ownerAddress, 0);
    }
    callData = generateUpgradeCalldata(sender, ownerAddress, { deploymentOnly: true });
    nonce = 0n;
  }

  const dynamicGas = await resolveDynamicGasConfig(publicClient, sender, callData);
  // When initCode is present, verification runs factory (deploy) + validation; use much higher limit to avoid AA13 initCode failed or OOG.
  const verificationGasLimit =
    initCode && initCode !== '0x' && initCode.length > 2
      ? 1000000n
      : dynamicGas.verificationGasLimit;

  // Construct UserOperation
  const userOp: UserOperation = {
    sender,
    nonce: nonce as bigint,
    initCode,
    callData,
    callGasLimit: dynamicGas.callGasLimit,
    verificationGasLimit,
    preVerificationGas: dynamicGas.preVerificationGas,
    maxFeePerGas: dynamicGas.maxFeePerGas,
    maxPriorityFeePerGas: dynamicGas.maxPriorityFeePerGas,
    paymasterAndData: '0x',
    signature: '0x',
  };

  // Get paymasterAndData from your Biconomy paymaster (so paymaster pays gas → no AA21).
  // When PAYMASTER_URL is set, we require sponsorship; otherwise we throw and don't submit.
  // if (options?.paymasterUrl) {
  //   const sponsor = await fetchPaymasterAndData(
  //     options.paymasterUrl,
  //     userOp,
  //     options.paymasterApiKey
  //   );
  //   userOp.paymasterAndData = sponsor.paymasterAndData;
  //   if (sponsor.preVerificationGas) userOp.preVerificationGas = BigInt(sponsor.preVerificationGas);
  //   if (sponsor.verificationGasLimit) userOp.verificationGasLimit = BigInt(sponsor.verificationGasLimit);
  //   if (sponsor.callGasLimit) userOp.callGasLimit = BigInt(sponsor.callGasLimit);
  // }

  // Get userOpHash from EntryPoint (includes paymasterAndData if set)
  const userOpHash = await publicClient.readContract({
    address: ENTRY_POINT_ADDRESS,
    abi: ENTRY_POINT_ABI,
    functionName: 'getUserOpHash',
    args: [userOp],
  });

  // Serialize bigints to strings for JSON transport
  const serializedUserOp: SerializedUserOperation = {
    sender: userOp.sender,
    nonce: userOp.nonce.toString(),
    initCode: userOp.initCode,
    callData: userOp.callData,
    callGasLimit: userOp.callGasLimit.toString(),
    verificationGasLimit: userOp.verificationGasLimit.toString(),
    preVerificationGas: userOp.preVerificationGas.toString(),
    maxFeePerGas: userOp.maxFeePerGas.toString(),
    maxPriorityFeePerGas: userOp.maxPriorityFeePerGas.toString(),
    paymasterAndData: userOp.paymasterAndData,
    signature: userOp.signature,
  };

  return {
    userOp: serializedUserOp,
    userOpHash: userOpHash as `0x${string}`,
  };
}

/** Single call for executeBatch (to, value, data). */
export interface TransferCall {
  to: `0x${string}`;
  value?: bigint | string;
  data: `0x${string}`;
}

/**
 * Builds Nexus executeBatch calldata for a list of calls (e.g. ERC20 transfers).
 */
function generateTransferCalldata(
  smartAccountAddress: `0x${string}`,
  calls: TransferCall[]
): `0x${string}` {
  if (calls.length === 0) {
    throw new Error('At least one call is required for transfer');
  }
  const dest = calls.map((c) => getAddress(c.to));
  const value = calls.map((c) => (typeof c.value === 'string' ? BigInt(c.value) : (c.value ?? 0n)));
  const func = calls.map((c) => c.data);
  return encodeFunctionData({
    abi: [
      {
        name: 'executeBatch',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
          { name: 'dest', type: 'address[]' },
          { name: 'value', type: 'uint256[]' },
          { name: 'func', type: 'bytes[]' },
        ],
        outputs: [],
      },
    ],
    functionName: 'executeBatch',
    args: [dest, value, func],
  });
}

/**
 * Generates an unsigned UserOperation for executing calls from the Nexus account (e.g. token transfers).
 * Account must already be deployed and upgraded to Nexus.
 */
export async function generateTransferUserOp(
  publicClient: PublicClient,
  smartAccountAddress: `0x${string}`,
  calls: TransferCall[]
): Promise<{ userOp: SerializedUserOperation; userOpHash: `0x${string}` }> {
  const code = await publicClient.getCode({ address: smartAccountAddress });
  const isDeployed = code != null && code !== '0x' && code !== '0x0';
  if (!isDeployed) {
    throw new Error(
      'Smart account is not deployed on this chain. Run upgrade first, then retry transfer.'
    );
  }

  const callData = generateTransferCalldata(smartAccountAddress, calls);
  const nonce = await publicClient.readContract({
    address: ENTRY_POINT_ADDRESS,
    abi: ENTRY_POINT_ABI,
    functionName: 'getNonce',
    args: [smartAccountAddress, 0n],
  }) as bigint;

  const dynamicGas = await resolveDynamicGasConfig(
    publicClient,
    smartAccountAddress,
    callData
  );

  const userOp: UserOperation = {
    sender: smartAccountAddress,
    nonce,
    initCode: '0x',
    callData,
    callGasLimit: dynamicGas.callGasLimit,
    verificationGasLimit: dynamicGas.verificationGasLimit,
    preVerificationGas: dynamicGas.preVerificationGas,
    maxFeePerGas: dynamicGas.maxFeePerGas,
    maxPriorityFeePerGas: dynamicGas.maxPriorityFeePerGas,
    paymasterAndData: '0x',
    signature: '0x',
  };

  const userOpHash = await publicClient.readContract({
    address: ENTRY_POINT_ADDRESS,
    abi: ENTRY_POINT_ABI,
    functionName: 'getUserOpHash',
    args: [userOp],
  });

  const serializedUserOp: SerializedUserOperation = {
    sender: userOp.sender,
    nonce: userOp.nonce.toString(),
    initCode: userOp.initCode,
    callData: userOp.callData,
    callGasLimit: userOp.callGasLimit.toString(),
    verificationGasLimit: userOp.verificationGasLimit.toString(),
    preVerificationGas: userOp.preVerificationGas.toString(),
    maxFeePerGas: userOp.maxFeePerGas.toString(),
    maxPriorityFeePerGas: userOp.maxPriorityFeePerGas.toString(),
    paymasterAndData: userOp.paymasterAndData,
    signature: userOp.signature,
  };

  return {
    userOp: serializedUserOp,
    userOpHash: userOpHash as `0x${string}`,
  };
}

async function resolveDynamicGasConfig(
  publicClient: PublicClient,
  smartAccountAddress: `0x${string}`,
  callData: `0x${string}`
): Promise<{
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}> {
  let callGasLimit: bigint = GAS_CONFIG.callGasLimit;
  let verificationGasLimit: bigint = GAS_CONFIG.verificationGasLimit;
  let preVerificationGas: bigint = GAS_CONFIG.preVerificationGas;
  let maxFeePerGas: bigint = GAS_CONFIG.maxFeePerGas;
  let maxPriorityFeePerGas: bigint = GAS_CONFIG.maxPriorityFeePerGas;
  let usedCallGasEstimate = false;

  try {
    // Approximate execution cost of the smart-account call.
    const estimatedCallGas = await publicClient.estimateGas({
      account: ENTRY_POINT_ADDRESS,
      to: smartAccountAddress,
      data: callData,
      value: 0n,
    });
    // Use estimate with safety margin and floor; do not cap with GAS_CONFIG so large legitimate estimates don't get forced down (avoids AA23/OOG).
    callGasLimit = maxBigInt(multiplyByBps(estimatedCallGas, 10_500n), 50_000n);
    usedCallGasEstimate = true;
  } catch {
    // Keep fallback callGasLimit (GAS_CONFIG.callGasLimit) when estimation fails.
  }

  // Pre-verification cost depends mostly on calldata bytes + fixed overhead.
  const calldataBytes = BigInt((callData.length - 2) / 2);
  const estimatedPreVerification = 35_000n + calldataBytes * 16n;
  preVerificationGas = minBigInt(
    maxBigInt(estimatedPreVerification, 45_000n),
    GAS_CONFIG.preVerificationGas
  );

  // When we have an actual callGas estimate, derive verificationGasLimit from it without capping by config; use config only as fallback when estimation failed.
  if (usedCallGasEstimate) {
    verificationGasLimit = maxBigInt(callGasLimit / 2n, 90_000n);
  } else {
    verificationGasLimit = GAS_CONFIG.verificationGasLimit;
  }

  try {
    const fees = await publicClient.estimateFeesPerGas();
    if (typeof fees.maxFeePerGas === 'bigint' && typeof fees.maxPriorityFeePerGas === 'bigint') {
      maxPriorityFeePerGas = multiplyByBps(fees.maxPriorityFeePerGas, 5_000n);
      maxFeePerGas = multiplyByBps(fees.maxFeePerGas, 5_000n);
    } else if (typeof fees.gasPrice === 'bigint') {
      const gasPrice = fees.gasPrice;
      maxFeePerGas = multiplyByBps(gasPrice, 5_000n);
      maxPriorityFeePerGas = maxBigInt(maxFeePerGas / 10n, 1_000_000n);
    }
  } catch {
    try {
      const gasPrice = await publicClient.getGasPrice();
      maxFeePerGas = multiplyByBps(gasPrice, 5_000n);
      maxPriorityFeePerGas = maxBigInt(maxFeePerGas / 10n, 1_000_000n);
    } catch {
      // Keep fallback fee values.
    }
  }

  return {
    callGasLimit,
    verificationGasLimit,
    preVerificationGas,
    maxFeePerGas,
    maxPriorityFeePerGas,
  };
}

/**
 * Checks whether a smart account address is already Nexus.
 *
 * Heuristic:
 * 1) Address has bytecode.
 * 2) Calling accountId() succeeds and contains "biconomy.nexus".
 */
export async function getNexusStatus(
  publicClient: PublicClient,
  smartAccountAddress: `0x${string}`
): Promise<{ isNexus: boolean; deployed?: boolean; accountId?: string; reason?: string }> {
  const code = await publicClient.getCode({ address: smartAccountAddress });
  if (!code || code === '0x') {
    return { isNexus: false, deployed: false, reason: 'Address has no deployed code' };
  }

  try {
    const accountId = await publicClient.readContract({
      address: smartAccountAddress,
      abi: parseAbi(['function accountId() view returns (string)']),
      functionName: 'accountId',
      args: [],
    });
    const id = String(accountId);
    return {
      isNexus: id.toLowerCase().includes('biconomy.nexus'),
      deployed: true,
      accountId: id,
      reason: id.toLowerCase().includes('biconomy.nexus')
        ? undefined
        : 'accountId() exists but does not look like Nexus',
    };
  } catch {
    return { isNexus: false, deployed: true, reason: 'accountId() probe failed' };
  }
}

/**
 * Deserialize UserOperation from JSON
 */
function deserializeUserOp(serialized: SerializedUserOperation): UserOperation {
  return {
    sender: serialized.sender,
    nonce: BigInt(serialized.nonce),
    initCode: serialized.initCode,
    callData: serialized.callData,
    callGasLimit: BigInt(serialized.callGasLimit),
    verificationGasLimit: BigInt(serialized.verificationGasLimit),
    preVerificationGas: BigInt(serialized.preVerificationGas),
    maxFeePerGas: BigInt(serialized.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(serialized.maxPriorityFeePerGas),
    paymasterAndData: serialized.paymasterAndData,
    signature: serialized.signature,
  };
}

/**
 * Mirrors EntryPoint._getRequiredPrefund(MemoryUserOp) for v0.6.
 * requiredPrefund = (callGasLimit + verificationGasLimit * mul + preVerificationGas) * maxFeePerGas
 * where mul = 3 when paymaster is used, otherwise 1.
 */
export function getRequiredPrefundWei(serialized: SerializedUserOperation): bigint {
  const userOp = deserializeUserOp(serialized);
  const mul = hasPaymaster(userOp.paymasterAndData) ? 3n : 1n;
  const requiredGas =
    userOp.callGasLimit +
    userOp.verificationGasLimit * mul +
    userOp.preVerificationGas;
  return requiredGas * userOp.maxFeePerGas;
}

function hasPaymaster(paymasterAndData: `0x${string}`): boolean {
  if (paymasterAndData === '0x') return false;
  if (paymasterAndData.length < 42) return false;
  const paymaster = paymasterAndData.slice(2, 42).toLowerCase();
  return paymaster !== '0000000000000000000000000000000000000000';
}

/**
 * Build UserOperation as a named object so encodeFunctionData encodes fields in ABI component order.
 * Using an object with ABI-matching keys avoids any array-index or encoding-order bugs (e.g. sender/paymaster swap).
 */
function userOpToTuple(userOp: UserOperation): {
  sender: `0x${string}`;
  nonce: bigint;
  initCode: `0x${string}`;
  callData: `0x${string}`;
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  paymasterAndData: `0x${string}`;
  signature: `0x${string}`;
} {
  return {
    sender: userOp.sender,
    nonce: userOp.nonce,
    initCode: userOp.initCode,
    callData: userOp.callData,
    callGasLimit: userOp.callGasLimit,
    verificationGasLimit: userOp.verificationGasLimit,
    preVerificationGas: userOp.preVerificationGas,
    maxFeePerGas: userOp.maxFeePerGas,
    maxPriorityFeePerGas: userOp.maxPriorityFeePerGas,
    paymasterAndData: userOp.paymasterAndData,
    signature: userOp.signature,
  };
}

/**
 * Executes a signed UserOperation via EntryPoint.
 * Uses handleOps(UserOperation[], beneficiary). Pass UserOp as named tuple so encoding matches EntryPoint v0.6 layout.
 */
export async function executeUserOp(
  publicClient: PublicClient,
  walletClient: WalletClient,
  signedUserOp: SerializedUserOperation,
  useChain: Chain
): Promise<Hash> {
  const userOp = deserializeUserOp(signedUserOp);

  // Use named object so viem encodes in ABI component order (sender, nonce, ..., paymasterAndData, signature).
  const opTuple = userOpToTuple(userOp);

  const handleOpsCalldata = encodeFunctionData({
    abi: ENTRY_POINT_ABI,
    functionName: 'handleOps',
    args: [[opTuple], walletClient.account!.address],
  });

  try {
    const hash = await sendEntryPointTransaction(publicClient, walletClient, useChain, {
      data: handleOpsCalldata,
      value: 0n,
      gas: 1_500_000n,
    });
    await publicClient.waitForTransactionReceipt({ hash });
    return hash;
  } catch (err: unknown) {
    const revertData = getRevertData(err);
    if (revertData) {
      try {
        const decoded = decodeErrorResult({
          abi: ENTRY_POINT_ERRORS_ABI,
          data: revertData,
        });
        if (decoded.errorName === 'FailedOp' && decoded.args) {
          const [opIndex, reason] = decoded.args as [bigint, string];
          throw new Error(
            `EntryPoint FailedOp(opIndex=${opIndex}, reason="${reason}"). Fix: ${hintForReason(String(reason))}`
          );
        }
        if (decoded.errorName === 'SignatureValidationFailed' && decoded.args) {
          const [aggregator] = decoded.args as [string];
          throw new Error(
            `EntryPoint SignatureValidationFailed(aggregator=${aggregator}). Ensure signature has aggregator=0 (first 20 bytes zero).`
          );
        }
        const argsStr = Array.isArray(decoded.args) ? decoded.args.join(', ') : String(decoded.args ?? '');
        throw new Error(`EntryPoint reverted: ${decoded.errorName}(${argsStr})`);
      } catch (decodeErr) {
        if (decodeErr instanceof Error && decodeErr.message.includes('EntryPoint')) throw decodeErr;
        throw new Error(`EntryPoint reverted (raw data: ${revertData.slice(0, 66)}...)`);
      }
    }
    throw err;
  }
}

/**
 * Ensures sender has EntryPoint deposit when not using paymaster.
 * This runs server-side before executeUserOp so frontend doesn't need to call /prefund explicitly.
 */
export async function ensurePrefundIfNeeded(
  publicClient: PublicClient,
  walletClient: WalletClient,
  useChain: Chain,
  signedUserOp: SerializedUserOperation,
  minRequiredDepositWei: bigint
): Promise<{ prefunded: boolean; transactionHash?: Hash; depositBefore: bigint; depositAfter: bigint }> {
  const userOp = deserializeUserOp(signedUserOp);

  // If paymaster is present, sender deposit is not required for prefund.
  if (userOp.paymasterAndData !== '0x') {
    return { prefunded: false, depositBefore: 0n, depositAfter: 0n };
  }

  const balanceOfAbi = parseAbi(['function balanceOf(address account) view returns (uint256)']);
  const depositToAbi = parseAbi(['function depositTo(address account) payable']);

  // Check sender's balance at EntryPoint; do not call depositTo when they already have enough.
  const depositBefore = (await publicClient.readContract({
    address: ENTRY_POINT_ADDRESS,
    abi: balanceOfAbi,
    functionName: 'balanceOf',
    args: [userOp.sender],
  })) as bigint;

  if (depositBefore >= minRequiredDepositWei) {
    return { prefunded: false, depositBefore, depositAfter: depositBefore };
  }

  const topUpValue = minRequiredDepositWei - depositBefore;
  const data = encodeFunctionData({
    abi: depositToAbi,
    functionName: 'depositTo',
    args: [userOp.sender],
  });

  const txHash = await sendEntryPointTransaction(publicClient, walletClient, useChain, {
    data,
    value: topUpValue,
    gas: 200_000n,
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });

  const depositAfter = (await publicClient.readContract({
    address: ENTRY_POINT_ADDRESS,
    abi: balanceOfAbi,
    functionName: 'balanceOf',
    args: [userOp.sender],
  })) as bigint;

  return { prefunded: true, transactionHash: txHash, depositBefore, depositAfter };
}

async function sendEntryPointTransaction(
  publicClient: PublicClient,
  walletClient: WalletClient,
  useChain: Chain,
  params: { data: `0x${string}`; value: bigint; gas: bigint }
): Promise<Hash> {
  const account = walletClient.account!;
  const pendingNonce = await publicClient.getTransactionCount({
    address: account.address,
    blockTag: 'pending',
  });
  const gasPrice = await publicClient.getGasPrice();

  try {
    return await walletClient.sendTransaction({
      account,
      chain: useChain,
      to: ENTRY_POINT_ADDRESS,
      data: params.data,
      value: params.value,
      gas: params.gas,
      nonce: pendingNonce,
      gasPrice: multiplyByBps(gasPrice, 11_000n), // +10%
    });
  } catch (err: unknown) {
    if (!isReplacementUnderpricedError(err)) throw err;

    // One retry: refresh pending nonce and bump gas more aggressively.
    const retryNonce = await publicClient.getTransactionCount({
      address: account.address,
      blockTag: 'pending',
    });
    const retryGasPrice = await publicClient.getGasPrice();

    return walletClient.sendTransaction({
      account,
      chain: useChain,
      to: ENTRY_POINT_ADDRESS,
      data: params.data,
      value: params.value,
      gas: params.gas,
      nonce: retryNonce,
      gasPrice: multiplyByBps(retryGasPrice, 13_000n), // +30%
    });
  }
}

function isReplacementUnderpricedError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes('replacement transaction underpriced');
}

function multiplyByBps(value: bigint, bps: bigint): bigint {
  return (value * bps) / 10_000n;
}

function maxBigInt(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

function minBigInt(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

function getRevertData(err: unknown): `0x${string}` | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as {
    data?: unknown;
    raw?: string;
    cause?: unknown;
    walk?: (fn: (e: unknown) => void) => void;
  };
  // viem ContractFunctionRevertedError exposes raw revert bytes as .raw when signature is unknown
  if (typeof e.raw === 'string' && e.raw.startsWith('0x')) return e.raw as `0x${string}`;
  if (typeof e.data === 'string' && e.data.startsWith('0x')) return e.data as `0x${string}`;
  if (e.cause && typeof e.cause === 'object') {
    const c = e.cause as { data?: unknown; raw?: string };
    if (typeof c.raw === 'string' && c.raw.startsWith('0x')) return c.raw as `0x${string}`;
    if (typeof c.data === 'string' && c.data.startsWith('0x')) return c.data as `0x${string}`;
  }
  if (typeof e.walk === 'function') {
    let found: `0x${string}` | null = null;
    e.walk((x: unknown) => {
      const o = x as { data?: unknown; raw?: string };
      if (typeof o?.raw === 'string' && o.raw.startsWith('0x')) found = o.raw as `0x${string}`;
      else if (typeof o?.data === 'string' && o.data.startsWith('0x')) found = o.data as `0x${string}`;
    });
    return found;
  }
  return null;
}

function hintForReason(reason: string): string {
  if (reason.includes('AA21') || reason.toLowerCase().includes('prefund'))
    return 'Account or paymaster has no deposit. Prefund the sender at the EntryPoint or use paymaster.';
  if (reason.includes('AA23') || reason.toLowerCase().includes('reverted') || reason.toLowerCase().includes('oog'))
    return 'Account validateUserOp reverted or OOG. Check signature format, nonce, and calldata.';
  if (reason.includes('AA24')) return 'Paymaster validation failed.';
  return 'See EntryPoint docs for this error code.';
}

