/// <reference types="jest" />

import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

import { useBridgeQuote } from "../app/hooks/bridge";
import type { BridgeLeg } from "../app/lib/bridge";

const mockNearQuote = jest.fn();
const mockLifiQuote = jest.fn();

// app/lib/bridge reaches Privy through useEIP7702Account, which ships ESM that jest cannot
// parse. Only the execution path needs it; quote routing does not, so stub the one import.
jest.mock("../app/hooks/useEIP7702Account", () => ({
  get7702AuthorizedImplementationForAddress: jest.fn(),
}));

jest.mock("../app/lib/bridge", () => {
  const actual = jest.requireActual("../app/lib/bridge");
  return {
    ...actual,
    NearIntentsClient: class {
      getQuote = (...args: unknown[]) => mockNearQuote(...args);
    },
    LifiClient: class {
      getQuote = (...args: unknown[]) => mockLifiQuote(...args);
    },
  };
});

const EVM_ADDRESS = "0x000000000000000000000000000000000000dEaD";

/**
 * NEAR Intents' live Base list: USDC is present, USDT is not. This is the exact gap that
 * made same-chain Base USDC -> USDT report "no conversion rail" instead of routing.
 */
const NEAR_TOKENS = [
  {
    assetId: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
    symbol: "USDC",
    blockchain: "base",
    decimals: 6,
  },
  {
    assetId: "nep245:v2_1.omni.hot.tg:137_qiStmoQJDQPTebaPjgx5VBxZv6L",
    symbol: "USDC",
    blockchain: "pol",
    decimals: 6,
  },
  {
    assetId: "nep245:v2_1.omni.hot.tg:137_3hpYoaLtt8MP1Z2GH1U473DMRKgr",
    symbol: "USDT",
    blockchain: "pol",
    decimals: 6,
  },
];

const leg = (network: string, token: string, tokenAddress: string): BridgeLeg => ({
  network,
  chainId: network === "Base" ? 8453 : 137,
  token,
  tokenAddress,
  decimals: 6,
  amount: "0",
  rawAmount: "0",
});

const BASE_USDC = leg("Base", "USDC", "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
const BASE_USDT = leg("Base", "USDT", "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2");
const POLYGON_USDT = leg("Polygon", "USDT", "0xc2132d05d31c914a87c6611c10748aeb04b58e8f");
const BASE_ETH = leg("Base", "ETH", "");

function setup(from: BridgeLeg, to: BridgeLeg, amount = "0.217639") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return renderHook(
    () =>
      useBridgeQuote({
        from,
        to,
        amount,
        evmAddress: EVM_ADDRESS,
        starknetAddress: "",
        slippageBps: 50,
        enabled: true,
      }),
    {
      wrapper: ({ children }) =>
        React.createElement(QueryClientProvider, { client }, children),
    },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNearQuote.mockResolvedValue({ kind: "near-deposit", amountOut: "1" });
  mockLifiQuote.mockResolvedValue({ kind: "lifi-tx", amountOut: "1" });
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => NEAR_TOKENS,
  }) as unknown as typeof fetch;
});

describe("useBridgeQuote engine routing", () => {
  it("falls back to LI.FI when NEAR has no asset for a leg (Base USDT)", async () => {
    const { result } = setup(BASE_USDC, BASE_USDT);

    await waitFor(() => expect(result.current.quote).not.toBeNull());
    expect(mockNearQuote).not.toHaveBeenCalled();
    expect(mockLifiQuote).toHaveBeenCalledTimes(1);
    expect(mockLifiQuote.mock.calls[0][0]).toMatchObject({
      fromChain: 8453,
      toChain: 8453,
      fromToken: BASE_USDC.tokenAddress,
      toToken: BASE_USDT.tokenAddress,
      slippage: 0.005,
    });
  });

  it("still uses NEAR Intents when both legs resolve", async () => {
    const { result } = setup(BASE_USDC, POLYGON_USDT);

    await waitFor(() => expect(result.current.quote).not.toBeNull());
    expect(mockLifiQuote).not.toHaveBeenCalled();
    expect(mockNearQuote).toHaveBeenCalledTimes(1);
  });

  it("sends the zero address to LI.FI for native tokens", async () => {
    const { result } = setup(BASE_USDT, BASE_ETH);

    await waitFor(() => expect(result.current.quote).not.toBeNull());
    expect(mockLifiQuote.mock.calls[0][0]).toMatchObject({
      fromToken: BASE_USDT.tokenAddress,
      toToken: "0x0000000000000000000000000000000000000000",
    });
  });

  it("reports no rail only once a quote attempt has actually run", async () => {
    mockLifiQuote.mockResolvedValue(null);
    const { result } = setup(BASE_USDC, BASE_USDT);

    expect(result.current.isFetched).toBe(false);
    await waitFor(() => expect(result.current.isFetched).toBe(true));
    expect(result.current.quote).toBeNull();
  });
});
