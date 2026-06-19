import { createHash } from "crypto";
import { formatUnits } from "viem";
import { triggerActivepiecesDeposit } from "@/app/lib/activepieces-deposit";
import {
  getEmailForMonitoredAddress,
  getMoralisDepositNetworkAndExplorer,
} from "@/app/utils";
import { supabaseAdmin } from "@/app/lib/supabase";
import type { MoralisWebhookBody } from "../types";

type MoralisDepositIdempotencyInput =
  | { kind: "native"; chainId: string; txHash: string; to: string }
  | {
      kind: "erc20";
      chainId: string;
      txHash: string;
      to: string;
      from: string;
      valueWithDecimals: string;
      /** Token contract; primary idempotency discriminator (symbol is not unique). */
      tokenAddress: string;
      /** `tokenSymbol` is for display only; not used in the hash. */
      tokenSymbol: string;
      /** Set when `tokenAddress` is missing (use Moralis `logIndex`). */
      erc20LogIndex?: string;
    };

function isPostgresUniqueViolation(e: { code?: string; message?: string }): boolean {
  if (e.code === "23505") {
    return true;
  }
  return /unique|duplicate key/i.test(e.message || "");
}

/** Normalizes Moralis `chainId` so `0x1` and `0x01` map to the same idempotency key. */
function normalizeChainIdForIdempotency(chainId: string): string {
  const s = chainId.trim();
  if (!s) {
    return s;
  }
  try {
    if (/^0x/i.test(s)) {
      return `0x${BigInt(s).toString(16)}`;
    }
    if (/^\d+$/.test(s)) {
      return `0x${BigInt(s).toString(16)}`;
    }
    return `0x${BigInt(`0x${s}`).toString(16)}`;
  } catch {
    return s.toLowerCase();
  }
}

function buildMoralisDepositIdempotencyKey(
  input: MoralisDepositIdempotencyInput,
): string {
  const c = normalizeChainIdForIdempotency(input.chainId);
  const h = input.txHash.toLowerCase().trim();
  if (input.kind === "native") {
    const s = `v1|${c}|${h}|native|${input.to.toLowerCase().trim()}`;
    return createHash("sha256").update(s).digest("hex");
  }
  const to = input.to.toLowerCase().trim();
  const from = input.from.toLowerCase().trim();
  const v = input.valueWithDecimals.trim();
  const contract = input.tokenAddress.trim().toLowerCase();
  const tokenId =
    contract || `nocontract|${(input.erc20LogIndex ?? "na").trim()}`;
  const s = `v1|${c}|${h}|erc20|${to}|${from}|${v}|${tokenId}`;
  return createHash("sha256").update(s).digest("hex");
}

async function tryClaimMoralisDepositIdempotencyKey(
  idempotencyKey: string,
): Promise<boolean> {
  const { error } = await supabaseAdmin.from("moralis_deposit_idempotency").insert({
    idempotency_key: idempotencyKey,
  });
  if (error) {
    if (isPostgresUniqueViolation(error)) {
      if (process.env.NODE_ENV === "development") {
        console.log(
          "[moralis idempotency] duplicate, skipping",
          idempotencyKey.slice(0, 16) + "…",
        );
      }
      return false;
    }
    console.error("[moralis idempotency] claim insert failed", error);
    throw new Error("[moralis idempotency] claim insert failed", { cause: error });
  }
  return true;
}

async function releaseMoralisDepositIdempotencyKey(
  idempotencyKey: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("moralis_deposit_idempotency")
    .delete()
    .eq("idempotency_key", idempotencyKey);
  if (error) {
    console.error(
      "[moralis idempotency] release delete failed",
      idempotencyKey.slice(0, 16) + "…",
      error,
    );
  }
}

/** Claim key → run work → on failure release so a Moralis retry can succeed. */
async function moralisDepositNotificationOnce(
  input: MoralisDepositIdempotencyInput,
  work: () => Promise<void>,
): Promise<"ok" | "duplicate"> {
  const key = buildMoralisDepositIdempotencyKey(input);
  const claimed = await tryClaimMoralisDepositIdempotencyKey(key);
  if (!claimed) {
    return "duplicate";
  }
  try {
    await work();
  } catch (e) {
    await releaseMoralisDepositIdempotencyKey(key);
    throw e;
  }
  return "ok";
}

/** Native token ticker for display (simplified; most EVMs use 18 decimals for native in Moralis). */
const CHAIN_NATIVE_SYMBOL: Record<string, string> = {
  "0x1": "ETH",
  "0x38": "BNB",
  "0x89": "MATIC",
  "0xa4b1": "ETH",
  "0x2105": "ETH", // Base
  "0x46f": "LSK", // Lisk
};

function nativeSymbol(chainId: string): string {
  return CHAIN_NATIVE_SYMBOL[chainId] ?? "NATIVE";
}

/**
 * Test webhooks from Moralis may use empty chainId and empty tx arrays; skip processing.
 */
function isEmptyTestPayload(body: MoralisWebhookBody): boolean {
  const noChain = !body.chainId || body.chainId.trim() === "";
  const noData =
    !(body.txs && body.txs.length) && !(body.erc20Transfers && body.erc20Transfers.length);
  return noChain && noData;
}

/**
 * After Moralis has delivered a confirmed block payload, link recipients to Privy and Activepieces.
 */
export async function processMoralisDepositPayload(
  body: MoralisWebhookBody,
): Promise<void> {
  if (isEmptyTestPayload(body)) {
    if (process.env.NODE_ENV === "development") {
      console.log("[moralis deposit] skipping empty test / heartbeat payload");
    }
    return;
  }

  if (!body.confirmed) {
    return;
  }

  for (const tx of body.txs ?? []) {
    const to = tx.toAddress?.toLowerCase();
    if (!to) continue;
    try {
      if (tx.value && BigInt(tx.value) === BigInt(0)) {
        continue;
      }
    } catch {
      /* value might be invalid; still try to notify with amount 0? skip */
    }

    const email = await getEmailForMonitoredAddress(to);
    if (!email) {
      if (process.env.NODE_ENV === "development") {
        console.log(
          "[moralis deposit] no Privy user (wallet + smart) for toAddress",
          to,
        );
      }
      continue;
    }

    let amountStr: string;
    try {
      amountStr = formatUnits(BigInt(tx.value), 18);
    } catch {
      amountStr = tx.value;
    }
    const symbol = nativeSymbol(body.chainId);
    if (process.env.NODE_ENV === "development") {
      console.log(
        "[moralis deposit] native →",
        email,
        amountStr,
        symbol,
        tx.hash,
      );
    }
    try {
      await moralisDepositNotificationOnce(
        { kind: "native", chainId: body.chainId, txHash: tx.hash, to },
        async () => {
          const { network, txExplorerUrl } = getMoralisDepositNetworkAndExplorer(
            body.chainId,
            tx.hash,
          );
          await triggerActivepiecesDeposit({
            email,
            amount: amountStr,
            symbol,
            from: tx.fromAddress,
            txHash: tx.hash,
            network,
            txExplorerUrl,
            kind: "native",
          });
          await supabaseAdmin.from("transactions").insert({
            wallet_address: to,
            transaction_type: "credit",
            from_currency: symbol,
            to_currency: symbol,
            amount_sent: parseFloat(amountStr) || 0,
            amount_received: parseFloat(amountStr) || 0,
            fee: 0,
            recipient: {
              account_name: "Deposit",
              institution: network,
              account_identifier: (tx.fromAddress ?? "").toLowerCase(),
              memo: "",
            },
            status: "completed",
            network,
            tx_hash: tx.hash,
            explorer_link: txExplorerUrl || null,
          });
        },
      );
    } catch (e) {
      console.error("[moralis deposit] activepieces native", e);
    }
  }

  for (const tr of body.erc20Transfers ?? []) {
    const to = tr.to?.toLowerCase();
    if (!to) continue;
    const txId = tr.transactionHash || tr.txHash;
    if (!txId) continue;
    const email = await getEmailForMonitoredAddress(to);
    if (!email) {
      if (process.env.NODE_ENV === "development") {
        console.log(
          "[moralis deposit] no Privy user for ERC-20 to",
          to,
        );
      }
      continue;
    }
    if (process.env.NODE_ENV === "development") {
      console.log(
        "[moralis deposit] erc20 →",
        email,
        tr.valueWithDecimals,
        tr.tokenSymbol,
        txId,
      );
    }
    try {
      const token = tr.tokenSymbol || "TOKEN";
      const tokenAddress = (tr.contract ?? "").trim().toLowerCase();
      await moralisDepositNotificationOnce(
        {
          kind: "erc20",
          chainId: body.chainId,
          txHash: txId,
          to,
          from: tr.from,
          valueWithDecimals: tr.valueWithDecimals,
          tokenAddress,
          tokenSymbol: token,
          erc20LogIndex: tr.logIndex,
        },
        async () => {
          const { network, txExplorerUrl } = getMoralisDepositNetworkAndExplorer(
            body.chainId,
            txId,
          );
          await triggerActivepiecesDeposit({
            email,
            amount: tr.valueWithDecimals,
            symbol: token,
            from: tr.from,
            txHash: txId,
            network,
            txExplorerUrl,
            kind: "erc20",
          });
          await supabaseAdmin.from("transactions").insert({
            wallet_address: to,
            transaction_type: "credit",
            from_currency: token,
            to_currency: token,
            amount_sent: parseFloat(tr.valueWithDecimals ?? "0") || 0,
            amount_received: parseFloat(tr.valueWithDecimals ?? "0") || 0,
            fee: 0,
            recipient: {
              account_name: "Deposit",
              institution: network,
              account_identifier: (tr.from ?? "").toLowerCase(),
              memo: "",
            },
            status: "completed",
            network,
            tx_hash: txId,
            explorer_link: txExplorerUrl || null,
          });
        },
      );
    } catch (e) {
      console.error("[moralis deposit] activepieces erc20", e);
    }
  }
}
