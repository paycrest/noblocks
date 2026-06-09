/**
 * ProviderBatchCallAndSponsor batch execution: execute(calls, signature).
 * Digest and encoding match contracts/contracts/ProviderBatchCallAndSponsor.sol exactly:
 *   encodedCalls = abi.encodePacked(calls[i].to, calls[i].value, calls[i].data) per call
 *   digest = keccak256(abi.encodePacked(nonce, encodedCalls))
 *   User signs digest via personal_sign (wallet applies EIP-191); contract uses ECDSA.toEthSignedMessageHash(digest).
 */
import {
  encodeFunctionData,
  keccak256,
  toHex,
  concatHex,
  padHex,
  type Hash,
  type Address,
} from "viem";

const PROVIDER_BATCH_EXECUTE_ABI = [
  {
    name: "execute",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        name: "calls",
        type: "tuple[]",
        components: [
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "data", type: "bytes" },
        ],
      },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

const NONCE_ABI = [
  {
    name: "nonce",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

export type BatchCall = {
  to: Address;
  value: bigint;
  data: `0x${string}`;
};

/**
 * Build the digest that must be signed for execute(calls, signature).
 * Matches ProviderBatchCallAndSponsor.sol: packed = nonce (32) then for each call: to (20) + value (32) + data.
 * User signs this digest with personal_sign; the wallet adds EIP-191 prefix; contract verifies with ECDSA.toEthSignedMessageHash(digest).
 */
export function buildBatchDigest(nonce: bigint, calls: BatchCall[]): Hash {
  const nonceHex = padHex(toHex(nonce), { size: 32 });
  const callParts = calls.flatMap((c) => [
    padHex(c.to as `0x${string}`, { size: 20 }),
    padHex(toHex(c.value), { size: 32 }),
    c.data,
  ]);
  const packed = concatHex([nonceHex, ...callParts]);
  return keccak256(packed as `0x${string}`);
}

/**
 * Encode execute(calls, signature) calldata for ProviderBatchCallAndSponsor.
 */
export function encodeExecuteBatch(
  calls: BatchCall[],
  signature: `0x${string}`
): `0x${string}` {
  return encodeFunctionData({
    abi: PROVIDER_BATCH_EXECUTE_ABI,
    functionName: "execute",
    args: [calls, signature],
  });
}

/**
 * Read the batch nonce from the account (delegated EOA with ProviderBatchCallAndSponsor code).
 * If the account has no code (not yet delegated), this may fail; use nonce 0 and send eip7702Authorization.
 */
export async function readBatchNonce(
  publicClient: {
    readContract: (args: {
      address: Address;
      abi: typeof NONCE_ABI;
      functionName: "nonce";
    }) => Promise<bigint>;
  },
  accountAddress: Address
): Promise<bigint> {
  return publicClient.readContract({
    address: accountAddress,
    abi: NONCE_ABI,
    functionName: "nonce",
  });
}

export { PROVIDER_BATCH_EXECUTE_ABI, NONCE_ABI };
