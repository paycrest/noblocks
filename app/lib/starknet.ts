/**
 * Starknet utilities for Privy wallet integration with Ready accounts
 * Based on: https://github.com/starknet-edu/starknet-privy-demo
 */

import {
  Account,
  CallData,
  CairoOption,
  CairoOptionVariant,
  CairoCustomEnum,
  hash,
  RpcProvider,
  PaymasterRpc,
  num,
  typedData,
} from "starknet";
import type { SignerInterface, Signature } from "starknet";
import { getPrivyClient } from "./privy";
import {
  buildAuthorizationSignature,
  getUserAuthorizationKey,
} from "./authorization";
import { WalletApiRequestSignatureInput } from "@privy-io/server-auth";

/**
 * Custom signer base class (matches Privy demo's RawSigner)
 */
class RawSigner implements SignerInterface {
  async getPubKey(): Promise<string> {
    throw new Error("getPubKey not implemented");
  }

  async signMessage(
    _typedData: any,
    _accountAddress: string,
  ): Promise<Signature> {
    throw new Error("signMessage not implemented");
  }

  async signTransaction(
    _transactions: any[],
    _transactionsDetail: any,
  ): Promise<Signature> {
    throw new Error("signTransaction not implemented");
  }

  async signDeployAccountTransaction(_transaction: any): Promise<Signature> {
    throw new Error("signDeployAccountTransaction not implemented");
  }

  async signDeclareTransaction(_transaction: any): Promise<Signature> {
    throw new Error("signDeclareTransaction not implemented");
  }

  async signRaw(_messageHash: string): Promise<Signature> {
    throw new Error("signRaw not implemented - override in subclass");
  }
}

/**
 * Build Ready account constructor calldata
 */
function buildReadyConstructor(publicKey: string) {
  const signerEnum = new CairoCustomEnum({ Starknet: { pubkey: publicKey } });
  const guardian = new CairoOption(CairoOptionVariant.None);
  return CallData.compile({ owner: signerEnum, guardian });
}

/**
 * Compute the Ready account address for a given public key
 */
export function computeReadyAddress(
  publicKey: string,
  classHash: string,
): string {
  const calldata = buildReadyConstructor(publicKey);
  return hash.calculateContractAddressFromHash(
    publicKey,
    classHash,
    calldata,
    0,
  );
}

/**
 * Get Starknet wallet details from Privy
 */
export async function getStarknetWallet(
  walletId: string,
  providedPublicKey?: string,
) {
  if (!walletId) throw new Error("walletId is required");

  const privy = getPrivyClient();
  const wallet: any = await privy.walletApi.getWallet({ id: walletId });

  const chainType = wallet?.chainType || wallet?.chain_type;
  if (!wallet || !chainType || chainType !== "starknet") {
    throw new Error("Provided wallet is not a Starknet wallet");
  }

  let publicKey: string | undefined =
    providedPublicKey || wallet.public_key || wallet.publicKey || wallet.pubkey;

  if (!publicKey) {
    throw new Error("Wallet missing Starknet public key");
  }

  const address: string | undefined = wallet.address;
  return { publicKey, address, chainType, wallet };
}

/**
 * Sign a message hash using Privy's rawSign API for Starknet
 * Reference: https://docs.privy.io/recipes/use-tier-2#starknet
 */

export async function rawSign(
  walletId: string,
  messageHash: string,
  opts: { userJwt: string; userId?: string; origin?: string },
) {
  const appId = process.env.PRIVY_APP_ID;
  if (!appId) throw new Error("Missing PRIVY_APP_ID");
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appSecret) throw new Error("Missing PRIVY_APP_SECRET");

  // Use the documented Wallet API path
  const url = `https://api.privy.io/v1/wallets/${walletId}/raw_sign`;
  const body = { params: { hash: messageHash } };

  // Generate or fetch a user-specific authorization key
  const authorizationKey = await getUserAuthorizationKey({
    userJwt: opts.userJwt,
    userId: opts.userId,
  });

  // Build signature for this request per Privy docs
  const sigInput: WalletApiRequestSignatureInput = {
    version: 1,
    method: "POST",
    url,
    body,
    headers: {
      "privy-app-id": appId,
    },
  };
  const signature = buildAuthorizationSignature({
    input: sigInput,
    authorizationKey,
  });

  const headers: Record<string, string> = {
    "privy-app-id": appId,
    "privy-authorization-signature": signature,
    "Content-Type": "application/json",
  };
  // App authentication for Wallet API
  headers["Authorization"] = `Basic ${Buffer.from(
    `${appId}:${appSecret}`,
  ).toString("base64")}`;

  if (opts.origin) headers["Origin"] = opts.origin;
  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const text = await resp.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON response: ${text}`);
  }

  if (!resp.ok)
    throw new Error(data?.error || data?.message || `HTTP ${resp.status}`);
  const sig: string | undefined =
    data?.signature ||
    data?.result?.signature ||
    data?.data?.signature ||
    data?.result?.data?.signature ||
    (typeof data === "string" ? data : undefined);
  if (!sig || typeof sig !== "string")
    throw new Error("No signature returned from Privy");
  return sig.startsWith("0x") ? sig : `0x${sig}`;
}

/**
 * Build a Ready account with custom signer
 */
export async function buildReadyAccount({
  walletId,
  publicKey,
  classHash,
  userJwt,
  userId,
  origin,
  paymasterRpc,
}: {
  walletId: string;
  publicKey: string;
  classHash: string;
  userJwt: string;
  userId?: string;
  origin?: string;
  paymasterRpc?: PaymasterRpc | null;
}): Promise<{ account: Account; address: string }> {
  const provider = getRpcProvider();

  const constructorCalldata = buildReadyConstructor(publicKey);
  const address = hash.calculateContractAddressFromHash(
    publicKey,
    classHash,
    constructorCalldata,
    0,
  );

  const account = new Account({
    provider,
    address,
    signer: new (class extends RawSigner {
      async signMessage(
        typedDataInput: any,
        accountAddress: string,
      ): Promise<Signature> {
        // For paymaster, we need to sign the typed data message
        // Use Starknet's typed data hashing
        const messageHash = typedData.getMessageHash(
          typedDataInput,
          accountAddress,
        );

        const sig = await rawSign(walletId, messageHash, {
          userJwt,
          userId,
          origin,
        });
        const body = sig.slice(2);
        return [`0x${body.slice(0, 64)}`, `0x${body.slice(64)}`];
      }

      async signTransaction(
        transactions: any[],
        transactionsDetail: any,
      ): Promise<Signature> {
        // Get the transaction hash from transactionsDetail
        const messageHash =
          transactionsDetail.transactionHash || transactionsDetail.hash;
        if (!messageHash) {
          throw new Error("No transaction hash found in transaction details");
        }

        const sig = await rawSign(walletId, messageHash, {
          userJwt,
          userId,
          origin,
        });
        const body = sig.slice(2);
        return [`0x${body.slice(0, 64)}`, `0x${body.slice(64)}`];
      }

      async signRaw(messageHash: string): Promise<[string, string]> {
        const sig = await rawSign(walletId, messageHash, {
          userJwt,
          userId,
          origin,
        });
        const body = sig.slice(2);
        return [`0x${body.slice(0, 64)}`, `0x${body.slice(64)}`];
      }
    })(),
    ...(paymasterRpc ? { paymaster: paymasterRpc } : {}),
  });

  return { account, address };
}

/**
 * Get RPC provider
 */
export function getRpcProvider() {
  const rpcUrl =
    process.env.NEXT_PUBLIC_STARKNET_RPC_URL ||
    "https://starknet-sepolia.public.blastapi.io";
  return new RpcProvider({ nodeUrl: rpcUrl });
}

/**
 * Setup paymaster configuration
 */
export async function setupPaymaster(): Promise<{
  paymasterRpc: PaymasterRpc;
  isSponsored: boolean;
  gasToken?: string;
}> {
  const paymasterUrl = process.env.STARKNET_PAYMASTER_URL;
  if (!paymasterUrl) {
    throw new Error("STARKNET_PAYMASTER_URL not configured");
  }

  const paymasterMode = process.env.STARKNET_PAYMASTER_MODE || "sponsored";
  const isSponsored = paymasterMode.toLowerCase() === "sponsored";

  if (isSponsored && !process.env.STARKNET_PAYMASTER_API_KEY) {
    throw new Error(
      "STARKNET_PAYMASTER_API_KEY is required when PAYMASTER_MODE is 'sponsored'",
    );
  }

  const headers: Record<string, string> = {};
  if (process.env.STARKNET_PAYMASTER_API_KEY) {
    headers["x-paymaster-api-key"] = process.env.STARKNET_PAYMASTER_API_KEY;
  }

  const paymasterRpc = new PaymasterRpc({
    nodeUrl: paymasterUrl,
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
  });

  // Check if paymaster is available
  const available = await paymasterRpc.isAvailable();
  if (!available) {
    throw new Error("Paymaster service is not available");
  }

  let gasToken: string | undefined;
  if (!isSponsored) {
    const supported = await paymasterRpc.getSupportedTokens();
    gasToken =
      process.env.STARKNET_GAS_TOKEN_ADDRESS || supported[0]?.token_address;
    if (!gasToken) {
      throw new Error(
        "No supported gas tokens available (and STARKNET_GAS_TOKEN_ADDRESS not set)",
      );
    }
  }

  return { paymasterRpc, isSponsored, gasToken };
}

/**
 * Deploy a Ready account on Starknet using paymaster
 * Matches the implementation from starknet-privy-demo
 */
export async function deployReadyAccount({
  walletId,
  publicKey,
  classHash,
  userJwt,
  userId,
  origin,
  calls,
}: {
  walletId: string;
  publicKey: string;
  classHash: string;
  userJwt: string;
  userId?: string;
  origin?: string;
  calls: any[];
}): Promise<{ transaction_hash: string }> {
  const provider = getRpcProvider();
  const { paymasterRpc, isSponsored, gasToken } = await setupPaymaster();

  const constructorCalldata = buildReadyConstructor(publicKey);
  const contractAddress = hash.calculateContractAddressFromHash(
    publicKey,
    classHash,
    constructorCalldata,
    0,
  );

  // Paymaster deployment data requires hex-encoded calldata
  const constructorHex: string[] = (
    Array.isArray(constructorCalldata) ? constructorCalldata : []
  ).map((v: any) => num.toHex(v));

  const deploymentData = {
    class_hash: classHash,
    salt: publicKey,
    calldata: constructorHex,
    address: contractAddress,
    version: 1,
  } as const;

  const { account } = await buildReadyAccount({
    walletId,
    publicKey,
    classHash,
    userJwt,
    userId,
    origin,
    paymasterRpc,
  });

  // Prepare paymaster fee details
  const paymasterDetails: any = {
    feeMode: isSponsored
      ? { mode: "sponsored" as const }
      : { mode: "default" as const, gasToken },
    deploymentData,
  };

  const deployPayload = {
    classHash,
    contractAddress,
    constructorCalldata,
    addressSalt: publicKey,
  };

  let maxFee: any = undefined;

  // Estimate fees if not sponsored and there are calls to execute
  if (!isSponsored && calls.length > 0) {
    const feeEstimation = await account.estimatePaymasterTransactionFee(
      calls,
      paymasterDetails,
    );
    const suggested = feeEstimation.suggested_max_fee_in_gas_token;

    // Apply 1.5x safety margin
    const withMargin15 = (v: any) => {
      const bi = BigInt(v.toString());
      return (bi * BigInt(3) + BigInt(1)) / BigInt(2); // ceil(1.5x)
    };
    maxFee = withMargin15(suggested);
  }

  // Execute deployment with paymaster
  const res = await account.executePaymasterTransaction(
    calls, // Empty array means deploy only, with calls means deploy + invoke
    paymasterDetails,
    maxFee,
  );

  return res;
}

/**
 * Get Ready account (alias for buildReadyAccount without paymaster)
 */
export async function getReadyAccount({
  walletId,
  publicKey,
  classHash,
  userJwt,
  userId,
  origin,
}: {
  walletId: string;
  publicKey: string;
  classHash: string;
  userJwt: string;
  userId?: string;
  origin?: string;
}): Promise<{ account: Account; address: string }> {
  return buildReadyAccount({
    walletId,
    publicKey,
    classHash,
    userJwt,
    userId,
    origin,
  });
}
