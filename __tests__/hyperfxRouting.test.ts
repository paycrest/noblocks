/// <reference types="jest" />

jest.mock("../app/hooks/useEIP7702Account", () => ({
  get7702AuthorizedImplementationForAddress: jest.fn(),
}));

jest.mock("../app/lib/bridgeFeature", () => ({
  HYPERFX_SUPPORTED_NETWORKS: new Set([
    "Base",
    "Polygon",
    "BNB Smart Chain",
    "Ethereum",
  ]),
  isHyperfxSwapEnabled: jest.fn(() => true),
  isTextileRoute: jest.fn(() => false),
}));

import {
  isHyperfxRoute,
  selectEngine,
  type BridgeLeg,
} from "../app/lib/bridge";

const CHAIN_ID: Record<string, number> = {
  Base: 8453,
  Polygon: 137,
  "BNB Smart Chain": 56,
  Ethereum: 1,
  Lisk: 1135,
};

const leg = (
  network: string,
  token: string,
  tokenAddress: string,
): BridgeLeg => ({
  network,
  chainId: CHAIN_ID[network] ?? 137,
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

  it("selects hyperfx for same-chain Polygon USDC→cNGN when enabled", () => {
    const from = leg("Polygon", "USDC", "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359");
    const to = leg("Polygon", "cNGN", "0x52828daa48c1a9a06f37500882b42daf0be04c3b");
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

  it("does not route hyperfx on Lisk (cNGN present but not on Hyperbridge)", () => {
    const from = leg("Lisk", "USDT", "0x05D032ac25d322df992303dCa074EE7392C117b9");
    const to = leg("Lisk", "cNGN", "0xC7aB2C35Ea37236e644C24A4E4a1911c082887c0");
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
