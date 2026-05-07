/**
 * Vesu lending integration via Starkzap SDK.
 *
 * Uses starkzap's VesuLendingProvider to prepare deposit/withdraw call lists
 * and read position/market data, while transaction execution runs through
 * noblocks' existing Ready Account + AVNU paymaster pipeline (`app/lib/starknet.ts`).
 *
 * Two earn tokens are supported, each routed to its own Vesu pool because no
 * single Vesu pool yields meaningfully on both:
 *   USDC → Clearstar USDC Reactor (single-asset, ~3.78% APY)
 *   USDT → Prime (multi-asset, ~1.61% APY) — best USDT yield available
 */

import {
  Amount,
  ChainId,
  VesuLendingProvider,
  fromAddress,
  type Address,
  type LendingMarket,
  type LendingProviderContext,
  type LendingUserPosition,
  type Token,
} from "starkzap";
import type { Call, RpcProvider } from "starknet";
import { getRpcProvider } from "./starknet";

export type EarnTokenSymbol = "USDC" | "USDT";

export const VESU_USDC_POOL_ADDRESS = fromAddress(
  "0x01bc5de51365ed7fbb11ebc81cef9fd66b70050ec10fd898f0c4698765bf5803",
);

export const VESU_USDT_POOL_ADDRESS = fromAddress(
  "0x0451fe483d5921a2919ddd81d0de6696669bccdacd859f72a4fba7656b97c3b5",
);

/**
 * Native USDC on Starknet (Circle / CCTP).
 * Per Circle's Starknet best-practices: name "USDC", symbol "USDC".
 * Bridged USDC.e (StarkGate) lives at 0x053c91…368a8 — distinct contract,
 * not used by this earn flow.
 */
export const STARKNET_USDC_TOKEN: Token = {
  name: "USDC",
  symbol: "USDC",
  decimals: 6,
  address: fromAddress(
    "0x033068F6539f8e6e6b131e6B2B814e6c34A5224bC66947c47DaB9dFeE93b35fb",
  ),
};

/**
 * Canonical Tether USDT on Starknet — used by all Vesu USDT markets and
 * exposed by Paycrest for Starknet onramps.
 */
export const STARKNET_USDT_TOKEN: Token = {
  name: "Tether USD",
  symbol: "USDT",
  decimals: 6,
  address: fromAddress(
    "0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8",
  ),
};

interface EarnTokenConfig {
  token: Token;
  poolAddress: Address;
}

const EARN_TOKEN_CONFIG: Record<EarnTokenSymbol, EarnTokenConfig> = {
  USDC: {
    token: STARKNET_USDC_TOKEN,
    poolAddress: VESU_USDC_POOL_ADDRESS as Address,
  },
  USDT: {
    token: STARKNET_USDT_TOKEN,
    poolAddress: VESU_USDT_POOL_ADDRESS as Address,
  },
};

export function getEarnTokenConfig(symbol: EarnTokenSymbol): EarnTokenConfig {
  return EARN_TOKEN_CONFIG[symbol];
}

const provider: VesuLendingProvider = new VesuLendingProvider();

function buildContext(
  walletAddress: string,
  rpc?: RpcProvider,
): LendingProviderContext {
  return {
    chainId: ChainId.MAINNET,
    provider: rpc ?? getRpcProvider(),
    walletAddress: fromAddress(walletAddress),
  };
}

export async function prepareVesuDepositCalls(opts: {
  walletAddress: string;
  amountBaseUnits: bigint;
  tokenSymbol: EarnTokenSymbol;
}): Promise<Call[]> {
  const { token, poolAddress } = getEarnTokenConfig(opts.tokenSymbol);
  const ctx = buildContext(opts.walletAddress);
  const amount = Amount.fromRaw(opts.amountBaseUnits, token);
  const prepared = await provider.prepareDeposit(ctx, {
    token,
    amount,
    poolAddress,
  });
  return prepared.calls;
}

export async function prepareVesuWithdrawCalls(opts: {
  walletAddress: string;
  amountBaseUnits: bigint;
  tokenSymbol: EarnTokenSymbol;
}): Promise<Call[]> {
  const { token, poolAddress } = getEarnTokenConfig(opts.tokenSymbol);
  const ctx = buildContext(opts.walletAddress);
  const amount = Amount.fromRaw(opts.amountBaseUnits, token);
  const prepared = await provider.prepareWithdraw(ctx, {
    token,
    amount,
    poolAddress,
  });
  return prepared.calls;
}

export async function prepareVesuWithdrawMaxCalls(opts: {
  walletAddress: string;
  tokenSymbol: EarnTokenSymbol;
}): Promise<Call[]> {
  const { token, poolAddress } = getEarnTokenConfig(opts.tokenSymbol);
  const ctx = buildContext(opts.walletAddress);
  const prepared = await provider.prepareWithdrawMax(ctx, {
    token,
    poolAddress,
  });
  return prepared.calls;
}

export interface VesuPositionSummary {
  /** Underlying token supplied to the pool, in base units (6 decimals for USDC/USDT). */
  suppliedBaseUnits: bigint;
  /** Same value formatted as a decimal string e.g. "12.345678". */
  suppliedFormatted: string;
  /** Annualized supply yield as a decimal (0.0523 = 5.23%). null if unknown. */
  supplyApy: number | null;
}

export async function getVesuPosition(
  walletAddress: string,
  tokenSymbol: EarnTokenSymbol,
): Promise<VesuPositionSummary> {
  const { token, poolAddress } = getEarnTokenConfig(tokenSymbol);
  const ctx = buildContext(walletAddress);

  let positions: LendingUserPosition[] = [];
  try {
    positions = (await provider.getPositions?.(ctx, {
      user: fromAddress(walletAddress),
    })) ?? [];
  } catch {
    positions = [];
  }

  const earn = positions.find(
    (p) =>
      p.type === "earn" &&
      p.collateral.token.address.toLowerCase() ===
        token.address.toLowerCase() &&
      p.pool.id.toLowerCase() === poolAddress.toLowerCase(),
  );

  const suppliedBaseUnits = earn?.collateral.amount ?? BigInt("0");
  const suppliedFormatted = Amount.fromRaw(suppliedBaseUnits, token).toUnit();
  const supplyApy = await getSupplyApy(tokenSymbol).catch(() => null);
  return { suppliedBaseUnits, suppliedFormatted, supplyApy };
}

export async function getSupplyApy(
  tokenSymbol: EarnTokenSymbol,
): Promise<number | null> {
  const { token, poolAddress } = getEarnTokenConfig(tokenSymbol);
  const markets: LendingMarket[] = await provider.getMarkets(ChainId.MAINNET);
  const target = markets.find(
    (m) =>
      m.poolAddress.toLowerCase() === poolAddress.toLowerCase() &&
      m.asset.address.toLowerCase() === token.address.toLowerCase(),
  );
  const apy = target?.stats?.supplyApy;
  if (!apy) return null;
  const raw = apy.toUnit();
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}
