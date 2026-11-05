import "server-only";

import { createPublicClient, http, type Chain } from "viem";
import { networks } from "@/app/mocks";
import {
  fetchEvmBalancesUnifiedUncached,
  fetchStarknetBalancesUnified,
  fetchTronBalancesUnified,
  getNetworkTokens,
  getRpcUrl,
  type ChainBalanceEntry,
  type UnifiedWalletBalances,
} from "@/app/utils";
import {
  getVesuPosition,
  STARKNET_USDC_TOKEN,
  STARKNET_USDT_TOKEN,
  VESU_USDC_POOL_ADDRESS,
  VESU_USDT_POOL_ADDRESS,
  type EarnTokenSymbol,
} from "@/app/lib/earn";
import { isFeatureEnabled } from "@/app/lib/flags";
import type { PortfolioWalletContext } from "./wallet-context.server";
import { formatBaseUnitsToDecimal } from "./money";
import type { PortfolioBuildInputHolding } from "./types";

const RPC_TIMEOUT_MS = 12_000;

export type FetchHoldingsResult = {
  holdings: PortfolioBuildInputHolding[];
  stale: boolean;
  asOf: string;
  /** When true, do not replace the cached snapshot with this payload. */
  refreshFailed: boolean;
};

function nowIso(): string {
  return new Date().toISOString();
}

function assertBalanceReadOk(
  unified: UnifiedWalletBalances,
  label: string,
): void {
  if (unified.readOk === false) {
    throw new Error(`${label} balance read failed`);
  }
}

async function withTimeout<T>(
  label: string,
  promise: Promise<T>,
  ms = RPC_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${ms}ms`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function entriesToTokenHoldings(
  entries: ChainBalanceEntry[],
  chainName: string,
  asOf: string,
  stale: boolean,
): PortfolioBuildInputHolding[] {
  const out: PortfolioBuildInputHolding[] = [];
  for (const e of entries) {
    const wei = e.balanceWei ?? BigInt(0);
    const amount = formatBaseUnitsToDecimal(wei, e.decimals);
    out.push({
      chain: chainName,
      symbol: e.symbol,
      tokenAddress: e.address,
      amount,
      decimals: e.decimals,
      bucket: "tokens",
      positionId: "wallet",
      asOf,
      ...(stale ? { stale: true } : {}),
    });
  }
  return out;
}

async function fetchEvmTokenHoldings(
  evmAddress: string,
  asOf: string,
): Promise<{ rows: PortfolioBuildInputHolding[]; stale: boolean; refreshFailed: boolean }> {
  const evmNetworks = networks.filter(
    (n) => n.chain.name !== "Starknet" && n.chain.name !== "Tron",
  );
  const rows: PortfolioBuildInputHolding[] = [];
  let stale = false;
  let refreshFailed = false;

  const settled = await Promise.allSettled(
    evmNetworks.map(async (network) => {
      const rpcUrl = getRpcUrl(network.chain.name);
      if (!rpcUrl) return;
      const publicClient = createPublicClient({
        chain: network.chain as Chain,
        transport: http(rpcUrl),
      });
      const unified = await withTimeout(
        `evm:${network.chain.name}`,
        fetchEvmBalancesUnifiedUncached(publicClient, evmAddress),
      );
      assertBalanceReadOk(unified, `evm:${network.chain.name}`);
      rows.push(
        ...entriesToTokenHoldings(unified.entries, network.chain.name, asOf, false),
      );
    }),
  );

  for (const s of settled) {
    if (s.status === "rejected") {
      stale = true;
      refreshFailed = true;
      console.error("[portfolio] EVM chain fetch failed:", s.reason);
    }
  }

  return { rows, stale, refreshFailed };
}

async function fetchStarknetTokenHoldings(
  address: string,
  asOf: string,
): Promise<PortfolioBuildInputHolding[]> {
  const tokens = await getNetworkTokens("Starknet");
  const unified = await withTimeout(
    "starknet:wallet",
    fetchStarknetBalancesUnified(address, tokens),
  );
  assertBalanceReadOk(unified, "starknet:wallet");
  return entriesToTokenHoldings(unified.entries, "Starknet", asOf, false);
}

async function fetchTronTokenHoldings(
  address: string,
  asOf: string,
): Promise<PortfolioBuildInputHolding[]> {
  const tokens = await getNetworkTokens("Tron");
  const unified = await withTimeout(
    "tron:wallet",
    fetchTronBalancesUnified(address, tokens),
  );
  assertBalanceReadOk(unified, "tron:wallet");
  return entriesToTokenHoldings(unified.entries, "Tron", asOf, false);
}

async function fetchVesuEarnHoldings(
  starknetAddress: string,
  asOf: string,
): Promise<PortfolioBuildInputHolding[]> {
  const earnFlagOn = isFeatureEnabled("noblocks-earn-v2");
  const readOnly = !earnFlagOn;
  const tokens: EarnTokenSymbol[] = ["USDC", "USDT"];
  const rows: PortfolioBuildInputHolding[] = [];

  for (const tokenSymbol of tokens) {
    const summary = await withTimeout(
      `vesu:${tokenSymbol}`,
      getVesuPosition(starknetAddress, tokenSymbol),
    );
    if (summary.readOk === false) {
      throw new Error(`vesu:${tokenSymbol} position read failed`);
    }
    const tokenMeta =
      tokenSymbol === "USDC" ? STARKNET_USDC_TOKEN : STARKNET_USDT_TOKEN;
    const poolId =
      tokenSymbol === "USDC"
        ? String(VESU_USDC_POOL_ADDRESS)
        : String(VESU_USDT_POOL_ADDRESS);

    rows.push({
      chain: "Starknet",
      symbol: tokenSymbol,
      tokenAddress: String(tokenMeta.address),
      amount: summary.suppliedFormatted,
      decimals: tokenMeta.decimals,
      bucket: "earn",
      positionId: poolId.toLowerCase(),
      asOf,
      ...(readOnly ? { readOnly: true } : {}),
    });
  }

  return rows;
}

export async function fetchPortfolioHoldings(
  ctx: PortfolioWalletContext,
): Promise<FetchHoldingsResult> {
  const asOf = nowIso();
  const holdings: PortfolioBuildInputHolding[] = [];
  let stale = false;
  let refreshFailed = false;

  const evm = await fetchEvmTokenHoldings(ctx.evmBalanceAddress, asOf);
  holdings.push(...evm.rows);
  stale = stale || evm.stale;
  refreshFailed = refreshFailed || evm.refreshFailed;

  if (ctx.starknetAddress) {
    try {
      holdings.push(
        ...(await fetchStarknetTokenHoldings(ctx.starknetAddress, asOf)),
      );
    } catch (error) {
      console.error("[portfolio] Starknet wallet holdings failed:", error);
      stale = true;
      refreshFailed = true;
    }
    try {
      holdings.push(
        ...(await fetchVesuEarnHoldings(ctx.starknetAddress, asOf)),
      );
    } catch (error) {
      console.error("[portfolio] Vesu earn holdings failed:", error);
      stale = true;
      refreshFailed = true;
    }
  }

  if (ctx.tronAddress) {
    try {
      holdings.push(
        ...(await fetchTronTokenHoldings(ctx.tronAddress, asOf)),
      );
    } catch (error) {
      console.error("[portfolio] Tron holdings failed:", error);
      stale = true;
      refreshFailed = true;
    }
  }

  return { holdings, stale, asOf, refreshFailed };
}
