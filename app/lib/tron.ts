import "server-only";
import { createHash } from "crypto";
import { recoverAddress, serializeSignature, type Hex } from "viem";
import { privateKeyToAccount, sign } from "viem/accounts";
import { rawSign } from "./starknet";

/**
 * Server-side Tron: TronGrid over plain HTTP, the Noblocks sponsor wallet (pays TRX so users
 * holding only USDT can send), and signing with the user's Privy Tron wallet. No TronWeb.
 *
 * A Tron transaction is signed over its txID (sha256 of raw_data). Privy `raw_sign` returns a
 * 64-byte compact signature; Tron needs a 65th recovery byte, chosen by checking which one
 * recovers the wallet's own address (Privy's Tron recipe).
 */

// --- addresses -----------------------------------------------------------------------------

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function sha256(bytes: Buffer): Buffer {
  return createHash("sha256").update(bytes).digest();
}

function base58Encode(bytes: Buffer): string {
  let value = BigInt(`0x${bytes.toString("hex") || "0"}`);
  let out = "";
  while (value > BigInt(0)) {
    out = BASE58_ALPHABET[Number(value % BigInt(58))] + out;
    value /= BigInt(58);
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    out = `1${out}`;
  }
  return out;
}

function base58Decode(text: string): Buffer {
  let value = BigInt(0);
  for (const char of text) {
    const digit = BASE58_ALPHABET.indexOf(char);
    if (digit < 0) throw new Error("Invalid base58 character");
    value = value * BigInt(58) + BigInt(digit);
  }
  let hex = value.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  const leadingZeros = text.length - text.replace(/^1+/, "").length;
  return Buffer.concat([Buffer.alloc(leadingZeros), Buffer.from(value ? hex : "", "hex")]);
}

/** 21-byte Tron address (0x41 + 20 bytes) as hex, from its base58check form. */
export function tronAddressToHex(address: string): string {
  const decoded = base58Decode(address.trim());
  if (decoded.length !== 25) throw new Error("Invalid Tron address");
  const payload = decoded.subarray(0, 21);
  const checksum = decoded.subarray(21);
  if (payload[0] !== 0x41 || !sha256(sha256(payload)).subarray(0, 4).equals(checksum)) {
    throw new Error("Invalid Tron address");
  }
  return payload.toString("hex");
}

/** base58check Tron address from 21-byte hex (0x41 + 20 bytes). */
export function hexToTronAddress(hex41: string): string {
  const payload = Buffer.from(hex41.replace(/^0x/, ""), "hex");
  if (payload.length !== 21 || payload[0] !== 0x41) throw new Error("Invalid Tron address hex");
  return base58Encode(Buffer.concat([payload, sha256(sha256(payload)).subarray(0, 4)]));
}

/** The EVM-form address (same key) of a Tron address, for signature recovery. */
export function tronToEvmAddress(address: string): Hex {
  return `0x${tronAddressToHex(address).slice(2)}`;
}

export function evmToTronAddress(evm: string): string {
  return hexToTronAddress(`41${evm.replace(/^0x/, "").toLowerCase()}`);
}

export function isValidTronBase58(address: string): boolean {
  try {
    tronAddressToHex(address);
    return true;
  } catch {
    return false;
  }
}

// --- TronGrid --------------------------------------------------------------------------------

const TRONGRID_TIMEOUT_MS = 10_000;

function tronGridUrl(): string {
  return (process.env.NEXT_PUBLIC_TRON_RPC_URL || "https://api.trongrid.io").replace(/\/+$/, "");
}

async function tronPost<T>(path: string, body: unknown): Promise<T> {
  const apiKey = process.env.TRONGRID_API_KEY || process.env.NEXT_PUBLIC_TRONGRID_API_KEY;
  const response = await fetch(`${tronGridUrl()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { "TRON-PRO-API-KEY": apiKey } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TRONGRID_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`TronGrid ${path} answered ${response.status}`);
  return (await response.json()) as T;
}

export type TronTransaction = {
  txID: string;
  raw_data: unknown;
  raw_data_hex: string;
  visible?: boolean;
  signature?: string[];
};

type ChainParameters = { energyFeeSun: number; bandwidthFeeSun: number };
let chainParamsCache: { at: number; value: ChainParameters } | null = null;

/** Current energy price and bandwidth price (sun), cached for 10 minutes. */
export async function getChainParameters(): Promise<ChainParameters> {
  if (chainParamsCache && Date.now() - chainParamsCache.at < 10 * 60_000) {
    return chainParamsCache.value;
  }
  const { chainParameter } = await tronPost<{ chainParameter?: { key: string; value?: number }[] }>(
    "/wallet/getchainparameters",
    {},
  );
  const lookup = (key: string, fallback: number) =>
    chainParameter?.find((p) => p.key === key)?.value ?? fallback;
  const value = {
    energyFeeSun: lookup("getEnergyFee", 100),
    bandwidthFeeSun: lookup("getTransactionFee", 1000),
  };
  chainParamsCache = { at: Date.now(), value };
  return value;
}

/** TRX balance (sun). */
async function getTrxBalance(address: string): Promise<bigint> {
  const account = await tronPost<{ balance?: number }>("/wallet/getaccount", {
    address,
    visible: true,
  });
  return BigInt(account.balance ?? 0);
}

/** Free + staked energy and bandwidth the account can still use today. */
async function getAvailableResources(address: string): Promise<{ energy: number; bandwidth: number }> {
  const r = await tronPost<{
    EnergyLimit?: number;
    EnergyUsed?: number;
    freeNetLimit?: number;
    freeNetUsed?: number;
    NetLimit?: number;
    NetUsed?: number;
  }>("/wallet/getaccountresource", { address, visible: true });
  return {
    energy: Math.max(0, (r.EnergyLimit ?? 0) - (r.EnergyUsed ?? 0)),
    bandwidth: Math.max(
      0,
      (r.freeNetLimit ?? 0) - (r.freeNetUsed ?? 0) + (r.NetLimit ?? 0) - (r.NetUsed ?? 0),
    ),
  };
}

export function encodeTransferParameter(to: string, amount: bigint): string {
  const recipient = tronAddressToHex(to).slice(2).padStart(64, "0");
  return recipient + amount.toString(16).padStart(64, "0");
}

function decodeTronMessage(message: string | undefined): string {
  if (!message) return "";
  if (/^[0-9a-fA-F]+$/.test(message) && message.length % 2 === 0) {
    return Buffer.from(message, "hex").toString("utf8");
  }
  return message;
}

/** Tron answered: the transaction was not accepted, nothing moved. */
export class TronRejectedError extends Error {}

/** No definite answer from Tron: the transaction may still execute. */
export class TronOutcomeUnknownError extends Error {}

/** Energy a TRC20 `transfer` would use (includes the dynamic energy penalty). */
async function estimateTransferEnergy(
  owner: string,
  contract: string,
  to: string,
  amount: bigint,
): Promise<number> {
  const result = await tronPost<{
    result?: { result?: boolean; message?: string };
    energy_used?: number;
  }>("/wallet/triggerconstantcontract", {
    owner_address: owner,
    contract_address: contract,
    function_selector: "transfer(address,uint256)",
    parameter: encodeTransferParameter(to, amount),
    visible: true,
  });
  if (!result.result?.result || !result.energy_used) {
    throw new TronRejectedError(
      decodeTronMessage(result.result?.message) || "This transfer would fail (check the balance)",
    );
  }
  return result.energy_used;
}

/** The txID must be sha256(raw_data_hex): never sign a transaction whose id was not derived from its body. */
export function assertTxId(tx: TronTransaction): void {
  const computed = sha256(Buffer.from(tx.raw_data_hex, "hex")).toString("hex");
  if (computed !== tx.txID) throw new Error("Tron transaction id does not match its contents");
}

// --- signing ---------------------------------------------------------------------------------

function sponsorPrivateKey(): Hex {
  const raw = (process.env.SPONSOR_TRON_WALLET_PRIVATE_KEY || "").trim().replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error("SPONSOR_TRON_WALLET_PRIVATE_KEY is not configured");
  }
  return `0x${raw}`;
}

export function isTronSponsorConfigured(): boolean {
  return /^(0x)?[0-9a-fA-F]{64}$/.test((process.env.SPONSOR_TRON_WALLET_PRIVATE_KEY || "").trim());
}

export function sponsorTronAddress(): string {
  return evmToTronAddress(privateKeyToAccount(sponsorPrivateKey()).address);
}

/** Signs with the sponsor key: 65 bytes r||s||v, v = 0x1b/0x1c. */
export async function signWithSponsor(tx: TronTransaction): Promise<TronTransaction> {
  assertTxId(tx);
  const signature = await sign({ hash: `0x${tx.txID}`, privateKey: sponsorPrivateKey() });
  return { ...tx, signature: [serializeSignature(signature).slice(2)] };
}

/**
 * Completes a Privy `raw_sign` signature for `owner`: a 65-byte one is checked as is; a 64-byte
 * compact one gets the recovery byte (0x1b or 0x1c) that recovers `owner`'s address.
 */
export async function completeTronSignature(
  txID: string,
  rawSignature: string,
  owner: string,
): Promise<string> {
  const base = rawSignature.replace(/^0x/, "").toLowerCase();
  const expected = tronToEvmAddress(owner).toLowerCase();
  const candidates = base.length === 130 ? [base] : [`${base}1b`, `${base}1c`];
  for (const candidate of candidates) {
    try {
      const recovered = await recoverAddress({
        hash: `0x${txID}`,
        signature: `0x${candidate}`,
      });
      if (recovered.toLowerCase() === expected) return candidate;
    } catch {
      // try the next recovery byte
    }
  }
  throw new Error("The wallet's signature does not match its address");
}

async function signWithPrivy(
  tx: TronTransaction,
  owner: string,
  signer: { walletId: string; userJwt: string; userId: string },
): Promise<TronTransaction> {
  assertTxId(tx);
  const raw = await rawSign(signer.walletId, `0x${tx.txID}`, {
    userJwt: signer.userJwt,
    userId: signer.userId,
  });
  return { ...tx, signature: [await completeTronSignature(tx.txID, raw, owner)] };
}

// --- sending ---------------------------------------------------------------------------------

async function broadcast(tx: TronTransaction): Promise<string> {
  let result: { result?: boolean; txid?: string; code?: string; message?: string };
  try {
    result = await tronPost("/wallet/broadcasttransaction", tx);
  } catch (error) {
    throw new TronOutcomeUnknownError(
      error instanceof Error ? error.message : "Failed to broadcast the Tron transaction",
    );
  }
  if (!result.result) {
    throw new TronRejectedError(
      decodeTronMessage(result.message) || result.code || "Tron rejected the transaction",
    );
  }
  return result.txid ?? tx.txID;
}

/** Waits (up to `timeoutMs`) until the transaction is in a block. True if it executed successfully. */
async function waitForConfirmation(txid: string, timeoutMs = 30_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const info = await tronPost<{ id?: string; receipt?: { result?: string } }>(
        "/wallet/gettransactioninfobyid",
        { value: txid },
      );
      if (info.id) return !info.receipt?.result || info.receipt.result === "SUCCESS";
    } catch {
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new TronOutcomeUnknownError("The TRX top-up did not confirm in time");
}

/** Approximate size of a signed TRC20 transfer, in bytes of bandwidth. */
const TRC20_TRANSFER_BANDWIDTH = 350;
/** Extra energy over the estimate, so the fee limit does not cut a transfer short. */
const ENERGY_MARGIN = 1.1;

export type TopUpPlan = {
  energy: number;
  /** TRX (sun) the transfer will burn after the account's own energy and bandwidth. */
  costSun: bigint;
  balanceSun: bigint;
  /** TRX (sun) the sponsor must send first; zero when the wallet can already pay. */
  topUpSun: bigint;
  /** fee_limit for the transfer (sun). */
  feeLimitSun: bigint;
};

/** How much TRX `owner` needs for this TRC20 transfer, net of what it already has. */
export async function planTrc20Transfer(
  owner: string,
  contract: string,
  to: string,
  amount: bigint,
): Promise<TopUpPlan> {
  const [{ energyFeeSun, bandwidthFeeSun }, energyUsed, resources, balanceSun] = await Promise.all([
    getChainParameters(),
    estimateTransferEnergy(owner, contract, to, amount),
    getAvailableResources(owner),
    getTrxBalance(owner),
  ]);
  const energy = Math.ceil(energyUsed * ENERGY_MARGIN);
  const energyShortfall = Math.max(0, energy - resources.energy);
  const bandwidthShortfall =
    resources.bandwidth >= TRC20_TRANSFER_BANDWIDTH ? 0 : TRC20_TRANSFER_BANDWIDTH;
  const costSun = BigInt(energyShortfall * energyFeeSun + bandwidthShortfall * bandwidthFeeSun);
  const topUpSun = costSun > balanceSun ? costSun - balanceSun : BigInt(0);
  const feeLimitSun = BigInt(Math.max(energy * energyFeeSun, 1_000_000));
  return { energy, costSun, balanceSun, topUpSun, feeLimitSun };
}

function maxTopUpSun(): bigint {
  const trx = envNumber(process.env.TRON_SPONSOR_MAX_TOPUP_TRX, 30);
  return BigInt(Math.round((trx > 0 ? trx : 30) * 1_000_000));
}

export type SponsoredTransferResult = { txid: string; toppedUpSun: bigint };

/**
 * Sends `amount` (base units) of the TRC20 `contract` from the user's Privy Tron wallet `owner`
 * to `to`. If the wallet cannot pay the TRX the transfer burns, the sponsor first sends exactly
 * the shortfall (capped by TRON_SPONSOR_MAX_TOPUP_TRX) and waits for it to land, unless
 * `allowTopUp` is false. Throws TronRejectedError when nothing was sent and
 * TronOutcomeUnknownError when the transfer may have gone out.
 */
/**
 * Claims a transfer's txID before it is signed and broadcast (one deposit per order). `take`
 * throws to stop the send; `release` runs when the transfer definitely did not execute.
 */
export type TransferClaim = {
  take: (txid: string) => Promise<void>;
  release: (txid: string) => Promise<void>;
};

export async function sendTrc20WithSponsor(params: {
  owner: string;
  to: string;
  contract: string;
  amount: bigint;
  signer: { walletId: string; userJwt: string; userId: string };
  allowTopUp?: boolean;
  claim?: TransferClaim;
}): Promise<SponsoredTransferResult> {
  const plan = await planTrc20Transfer(params.owner, params.contract, params.to, params.amount);

  if (plan.topUpSun > BigInt(0)) {
    if (params.allowTopUp === false) {
      throw new TronRejectedError("Add TRX to your Tron wallet to cover the network fee");
    }
    if (plan.topUpSun > maxTopUpSun()) {
      throw new TronRejectedError(
        "The Tron network fee is unusually high right now. Please try again later.",
      );
    }
    const created = await tronPost<TronTransaction & { Error?: string }>("/wallet/createtransaction", {
      owner_address: sponsorTronAddress(),
      to_address: params.owner,
      amount: Number(plan.topUpSun),
      visible: true,
    });
    if (!created.txID || created.Error) {
      throw new TronRejectedError(created.Error || "Could not prepare the TRX top-up");
    }
    const topUpTxid = await broadcast(await signWithSponsor(created));
    if (!(await waitForConfirmation(topUpTxid))) {
      throw new TronRejectedError("The TRX top-up failed");
    }
  }

  const built = await tronPost<{
    result?: { result?: boolean; message?: string };
    transaction?: TronTransaction;
  }>("/wallet/triggersmartcontract", {
    owner_address: params.owner,
    contract_address: params.contract,
    function_selector: "transfer(address,uint256)",
    parameter: encodeTransferParameter(params.to, params.amount),
    fee_limit: Number(plan.feeLimitSun),
    call_value: 0,
    visible: true,
  });
  if (!built.result?.result || !built.transaction?.txID) {
    throw new TronRejectedError(
      decodeTronMessage(built.result?.message) || "Could not prepare the Tron transfer",
    );
  }
  const builtTxid = built.transaction.txID;
  await params.claim?.take(builtTxid);
  let txid: string;
  try {
    const signed = await signWithPrivy(built.transaction, params.owner, params.signer);
    txid = await broadcast(signed);
  } catch (error) {
    // Signing failures and broadcast rejections leave nothing on chain.
    if (!(error instanceof TronOutcomeUnknownError)) await params.claim?.release(builtTxid);
    throw error;
  }
  return { txid, toppedUpSun: plan.topUpSun };
}

/**
 * A Tron transaction expires 60 seconds after it is built (TronGrid's default), so one the
 * chain has not seen two minutes after it was claimed can no longer land.
 */
const UNSEEN_TX_EXPIRY_MS = 120_000;

/**
 * Whether a deposit claimed earlier under `txid` can be superseded: it executed and failed (no
 * tokens moved), or the chain never saw it and it has expired. A transfer that succeeded or may
 * still land cannot be.
 */
export async function canReplaceTronDeposit(txid: string, claimedAt: Date): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/i.test(txid)) return true;
  const info = await tronPost<{ id?: string; receipt?: { result?: string } }>(
    "/wallet/gettransactioninfobyid",
    { value: txid },
  );
  if (info.id) return Boolean(info.receipt?.result) && info.receipt?.result !== "SUCCESS";
  return Date.now() - claimedAt.getTime() > UNSEEN_TX_EXPIRY_MS;
}

// --- sell fee --------------------------------------------------------------------------------

/**
 * Energy of a USDT transfer to an address that has never held it (every sell deposit address is
 * fresh), measured on mainnet (~130k). Used to quote the fee before the deposit address exists.
 */
const FRESH_RECIPIENT_TRANSFER_ENERGY = 131_000;

async function trxUsdPrice(): Promise<number | null> {
  try {
    const response = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=tron&vs_currencies=usd",
      { signal: AbortSignal.timeout(5000), headers: { Accept: "application/json" } },
    );
    const price = Number(((await response.json()) as { tron?: { usd?: number } })?.tron?.usd);
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}

function envNumber(raw: string | undefined, fallback: number): number {
  const value = raw === undefined || raw === "" ? NaN : Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/**
 * The fixed fee (in USD stablecoin units) a Tron sell is charged to recover the TRX the sponsor
 * burns for its deposit: worst-case energy at the live energy price plus bandwidth, converted at
 * the live TRX price with a margin, clamped to [TRON_SELL_FEE_MIN_USD, TRON_SELL_FEE_MAX_USD].
 * Uses TRON_SELL_FEE_FALLBACK_USD when a price is unavailable.
 */
export async function quoteTronSellFeeUsd(): Promise<number> {
  const min = envNumber(process.env.TRON_SELL_FEE_MIN_USD, 1);
  const max = envNumber(process.env.TRON_SELL_FEE_MAX_USD, 10);
  const fallback = envNumber(process.env.TRON_SELL_FEE_FALLBACK_USD, 5);
  const margin = envNumber(process.env.TRON_SELL_FEE_MARGIN, 0.15);
  const clamp = (value: number) => Math.min(max, Math.max(min, value));

  const [price, params] = await Promise.all([
    trxUsdPrice(),
    getChainParameters().catch(() => null),
  ]);
  if (price === null || params === null) return clamp(fallback);
  const trx =
    (FRESH_RECIPIENT_TRANSFER_ENERGY * params.energyFeeSun +
      TRC20_TRANSFER_BANDWIDTH * params.bandwidthFeeSun) /
    1_000_000;
  return clamp(Math.ceil(trx * price * (1 + margin) * 100) / 100);
}
