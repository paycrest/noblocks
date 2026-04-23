import { formatUnits } from "viem";
import { triggerActivepiecesDeposit } from "@/app/lib/activepieces-deposit";
import {
  getEmailForMonitoredAddress,
  getMoralisDepositNetworkAndExplorer,
} from "@/app/utils";

export interface MoralisNativeTx {
  hash: string;
  fromAddress: string;
  toAddress: string;
  value: string;
}

export interface MoralisErc20Transfer {
  transactionHash?: string;
  txHash?: string;
  from: string;
  to: string;
  valueWithDecimals: string;
  tokenSymbol: string;
  tokenName: string;
}

export interface MoralisWebhookBody {
  confirmed: boolean;
  chainId: string;
  streamId?: string;
  tag?: string;
  txs?: MoralisNativeTx[];
  erc20Transfers?: MoralisErc20Transfer[];
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
      if (tx.value && BigInt(tx.value) === 0n) {
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
      const { network, txExplorerUrl } = getMoralisDepositNetworkAndExplorer(
        body.chainId,
        txId,
      );
      await triggerActivepiecesDeposit({
        email,
        amount: tr.valueWithDecimals,
        symbol: tr.tokenSymbol || "TOKEN",
        from: tr.from,
        txHash: txId,
        network,
        txExplorerUrl,
        kind: "erc20",
      });
    } catch (e) {
      console.error("[moralis deposit] activepieces erc20", e);
    }
  }
}
