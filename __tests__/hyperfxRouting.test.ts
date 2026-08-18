/// <reference types="jest" />

jest.mock("../app/hooks/useEIP7702Account", () => ({
  get7702AuthorizedImplementationForAddress: jest.fn(),
}));

jest.mock("../app/lib/bridgeFeature", () => ({
  HYPERFX_SUPPORTED_NETWORKS: new Set(["Base"]),
  isHyperfxSwapEnabled: jest.fn(() => true),
}));

import {
  isHyperfxRoute,
  selectEngine,
  type BridgeLeg,
} from "../app/lib/bridge";

const leg = (
  network: string,
  token: string,
  tokenAddress: string,
): BridgeLeg => ({
  network,
  chainId: network === "Base" ? 8453 : 137,
  token,
  tokenAddress,
  decimals: 6,
  amount: "0",
  rawAmount: "0",
});

describe("HyperFX routing", () => {
  it("selects hyperfx for same-chain Base USDC→cNGN when enabled", () => {
    const from = leg("Base", "USDC", "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
    const to = leg("Base", "cNGN", "0x46C85152bFe9f96829aA94755D9f915F9B10EF5F");
    expect(isHyperfxRoute(from, to)).toBe(true);
    expect(selectEngine(from, to)).toBe("hyperfx");
  });

  it("selects hyperfx for same-chain Base cNGN→USDC when enabled", () => {
    const from = leg("Base", "cNGN", "0x46C85152bFe9f96829aA94755D9f915F9B10EF5F");
    const to = leg("Base", "USDC", "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
    expect(selectEngine(from, to)).toBe("hyperfx");
  });

  it("selects hyperfx for same-chain Base USDT→cNGN when enabled", () => {
    const from = leg("Base", "USDT", "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2");
    const to = leg("Base", "cNGN", "0x46C85152bFe9f96829aA94755D9f915F9B10EF5F");
    expect(isHyperfxRoute(from, to)).toBe(true);
    expect(selectEngine(from, to)).toBe("hyperfx");
  });

  it("selects hyperfx for same-chain Base cNGN→USDT when enabled", () => {
    const from = leg("Base", "cNGN", "0x46C85152bFe9f96829aA94755D9f915F9B10EF5F");
    const to = leg("Base", "USDT", "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2");
    expect(selectEngine(from, to)).toBe("hyperfx");
  });

  it("falls back to lifi for cross-chain cNGN legs", () => {
    const from = leg("Base", "USDC", "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
    const to = leg("Polygon", "cNGN", "0xabc");
    expect(isHyperfxRoute(from, to)).toBe(false);
    expect(selectEngine(from, to)).toBe("lifi");
  });

  it("does not route hyperfx on unsupported networks", () => {
    const from = leg("Polygon", "USDC", "0xabc");
    const to = leg("Polygon", "cNGN", "0xdef");
    expect(isHyperfxRoute(from, to)).toBe(false);
    expect(selectEngine(from, to)).toBe("lifi");
  });
});

describe("HyperFX disabled", () => {
  beforeEach(() => {
    const { isHyperfxSwapEnabled } = jest.requireMock("../app/lib/bridgeFeature");
    isHyperfxSwapEnabled.mockReturnValue(false);
  });

  it("uses lifi for Base USDC→cNGN when hyperfx is off", () => {
    const from = leg("Base", "USDC", "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
    const to = leg("Base", "cNGN", "0x46C85152bFe9f96829aA94755D9f915F9B10EF5F");
    expect(isHyperfxRoute(from, to)).toBe(false);
    expect(selectEngine(from, to)).toBe("lifi");
  });
});
