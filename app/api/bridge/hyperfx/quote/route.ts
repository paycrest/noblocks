import { NextRequest, NextResponse } from "next/server";
import {
  EvmChain,
  IntentGateway,
  IntentsCoprocessor,
  createQueryClient,
} from "@hyperbridge/sdk";
import { formatUnits, parseUnits } from "viem";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
  trackApiRequest,
  trackApiResponse,
  trackApiError,
} from "@/app/lib/server-analytics";
import { getRpcUrl } from "@/app/utils";
import { requireHyperfxBundlerUrl } from "@/app/utils";
import {
  HYPERFX_SUPPORTED_NETWORKS,
  isHyperfxSwapEnabled,
} from "@/app/lib/bridgeFeature";
import type { HyperfxIntentQuote } from "@/app/lib/bridge";

const UPSTREAM_TIMEOUT_MS = 20_000;
const QUOTE_TTL_MS = 5 * 60 * 1000;

const WS_URL =
  process.env.HYPERBRIDGE_WS_URL || "wss://nexus.rpc.polytope.technology";
const INDEXER_URL =
  process.env.HYPERBRIDGE_INDEXER_URL ||
  "https://nexus.indexer.polytope.technology";

function normalizeTokenSymbol(symbol: string): string {
  const s = symbol.trim().toLowerCase();
  if (s === "cngn") return "cNGN";
  if (s === "usdc") return "USDC";
  if (s === "usdt") return "USDT";
  return symbol.trim();
}

function isHyperfxQuotePair(fromToken: string, toToken: string): boolean {
  const stables = new Set(["USDC", "USDT"]);
  return (
    (stables.has(fromToken) && toToken === "cNGN") ||
    (fromToken === "cNGN" && stables.has(toToken))
  );
}

function resolveTokenAddress(
  chain: Awaited<ReturnType<typeof EvmChain.create>>,
  sourceId: string,
  symbol: string,
): string | null {
  const sym = symbol.toLowerCase();
  if (sym === "usdc") {
    return chain.configService.getUsdcAsset(sourceId) ?? null;
  }
  if (sym === "usdt") {
    return chain.configService.getUsdtAsset(sourceId) ?? null;
  }
  if (sym === "cngn") {
    return chain.configService.getCNgnAsset(sourceId) ?? null;
  }
  return null;
}

export const GET = withRateLimit(async (request: NextRequest) => {
  const startTime = Date.now();

  if (!isHyperfxSwapEnabled()) {
    return NextResponse.json({ error: "HyperFX is not enabled" }, { status: 404 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const network = searchParams.get("network")?.trim() ?? "";
    const fromToken = normalizeTokenSymbol(searchParams.get("fromToken") ?? "");
    const toToken = normalizeTokenSymbol(searchParams.get("toToken") ?? "");
    const fromAmount = searchParams.get("fromAmount")?.trim() ?? "";
    const fromDecimalsRaw = searchParams.get("fromDecimals");
    const fromDecimals = fromDecimalsRaw ? Number(fromDecimalsRaw) : 6;

    trackApiRequest(request, "/api/bridge/hyperfx/quote", "GET", {
      network,
      from_token: fromToken,
      to_token: toToken,
    });

    if (!network || !fromToken || !toToken || !fromAmount) {
      return NextResponse.json(
        { error: "network, fromToken, toToken, and fromAmount are required" },
        { status: 400 },
      );
    }

    if (!HYPERFX_SUPPORTED_NETWORKS.has(network)) {
      return NextResponse.json(
        { error: `HyperFX is not supported on ${network}` },
        { status: 422 },
      );
    }

    if (!isHyperfxQuotePair(fromToken, toToken)) {
      return NextResponse.json(
        { error: "HyperFX only supports USDC/USDT↔cNGN pairs" },
        { status: 422 },
      );
    }

    const parsedAmount = Number(fromAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json(
        { error: "fromAmount must be a positive number" },
        { status: 400 },
      );
    }

    const rpcUrl = getRpcUrl(network);
    if (!rpcUrl) {
      return NextResponse.json(
        { error: `RPC URL not configured for ${network}` },
        { status: 500 },
      );
    }

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("HyperFX quote timed out")), UPSTREAM_TIMEOUT_MS),
    );

    const quotePromise = (async (): Promise<HyperfxIntentQuote> => {
      const bundlerUrl = requireHyperfxBundlerUrl(network);
      const chain = await EvmChain.create(rpcUrl, bundlerUrl);
      const coprocessor = await IntentsCoprocessor.connect(WS_URL);
      const queryClient = createQueryClient({ url: INDEXER_URL });
      const gateway = (
        await IntentGateway.create(chain, chain, coprocessor)
      ).withQueryClient(queryClient);

      const sourceId = chain.config.stateMachineId;
      const tokenIn = resolveTokenAddress(chain, sourceId, fromToken);
      const tokenOut = resolveTokenAddress(chain, sourceId, toToken);
      if (!tokenIn || !tokenOut) {
        throw new Error(`Token pair not configured for ${network}`);
      }

      const amountIn = parseUnits(fromAmount, fromDecimals);
      const chainIdParam = Number(searchParams.get("chainId"));
      const chainId = Number.isFinite(chainIdParam) ? chainIdParam : 8453;

      const quote = await gateway.quoteIntent({
        tokenIn: tokenIn as `0x${string}`,
        tokenOut: tokenOut as `0x${string}`,
        amountIn,
      });

      const toDecimals = 6;
      const amountOutFormatted = formatUnits(quote.amountOut, toDecimals);
      const protocolFeeBps = Number(quote.quoteMetadata?.protocolFeeBps ?? 5);
      const feeRaw = (amountIn * BigInt(protocolFeeBps)) / BigInt(10000);
      const feeInReceiving =
        toToken === "cNGN"
          ? (feeRaw * quote.amountOut) / (amountIn || BigInt(1))
          : feeRaw;
      const feeFormatted = formatUnits(feeInReceiving, toDecimals);

      return {
        kind: "hyperfx-intent",
        amountOut: amountOutFormatted,
        fee: feeFormatted,
        amountIn: fromAmount,
        rawAmountIn: amountIn.toString(),
        rawAmountOut: quote.amountOut.toString(),
        tokenIn,
        tokenOut,
        network,
        chainId,
        protocolFeeBps,
        expiresAt: Date.now() + QUOTE_TTL_MS,
      };
    })();

    const quote = await Promise.race([quotePromise, timeout]);

    trackApiResponse(
      "/api/bridge/hyperfx/quote",
      "GET",
      200,
      Date.now() - startTime,
      { network, from_token: fromToken, to_token: toToken },
    );

    return NextResponse.json({ quote });
  } catch (err) {
    trackApiError(request, "/api/bridge/hyperfx/quote", "GET", err as Error, 502, {
      response_time_ms: Date.now() - startTime,
    });
    const message =
      err instanceof Error ? err.message : "Failed to fetch HyperFX quote";
    return NextResponse.json({ error: message }, { status: 502 });
  }
});
