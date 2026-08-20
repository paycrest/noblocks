/// <reference types="jest" />

jest.mock("../app/hooks/useEIP7702Account", () => ({
  get7702AuthorizedImplementationForAddress: jest.fn(),
}));

jest.mock("../app/lib/config", () => ({
  __esModule: true,
  default: {
    bridgeEnabled: true,
    textileEnabled: true,
  },
}));

import { normalizeTextileQuote, selectEngine, type BridgeLeg } from "../app/lib/bridge";
import { isTextileRoute } from "../app/lib/bridgeFeature";

const leg = (
  network: string,
  chainId: number,
  token: string,
  tokenAddress: string,
): BridgeLeg => ({
  network,
  chainId,
  token,
  tokenAddress,
  decimals: token === "USDT" && network === "BNB Smart Chain" ? 18 : 6,
  amount: "100",
  rawAmount: "100000000",
});

const BSC_USDT = leg(
  "BNB Smart Chain",
  56,
  "USDT",
  "0x55d398326f99059ff775485246999027b3197955",
);
const BSC_CNGN = leg(
  "BNB Smart Chain",
  56,
  "cNGN",
  "0xa8aea66b361a8d53e8865c62d142167af28af058",
);
const CELO_USDT = leg(
  "Celo",
  42220,
  "USDT",
  "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
);
const CELO_CNGN = leg(
  "Celo",
  42220,
  "cNGN",
  "0xF6829D7393dAe24509eb1E52eE8e572e2E271a4f",
);
const BASE_USDC = leg(
  "Base",
  8453,
  "USDC",
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
);
const BSC_USDC = leg(
  "BNB Smart Chain",
  56,
  "USDC",
  "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
);

describe("textile routing", () => {
  it("selects textile for same-chain USDT↔cNGN on BSC", () => {
    expect(selectEngine(BSC_USDT, BSC_CNGN)).toBe("textile");
    expect(selectEngine(BSC_CNGN, BSC_USDT)).toBe("textile");
  });

  it("selects textile for same-chain USDT↔cNGN on Celo", () => {
    expect(selectEngine(CELO_USDT, CELO_CNGN)).toBe("textile");
    expect(selectEngine(CELO_CNGN, CELO_USDT)).toBe("textile");
  });

  it("does not select textile for USDC↔cNGN on BSC", () => {
    expect(isTextileRoute(BSC_USDC, BSC_CNGN)).toBe(false);
    expect(selectEngine(BSC_USDC, BSC_CNGN)).toBe("lifi");
  });

  it("does not select textile for cross-chain USDT↔cNGN", () => {
    expect(isTextileRoute(BSC_USDT, CELO_CNGN)).toBe(false);
    expect(selectEngine(BSC_USDT, CELO_CNGN)).toBe("lifi");
  });

  it("does not select textile for non-cNGN pairs on BSC", () => {
    expect(selectEngine(BSC_USDC, BASE_USDC)).toBe("near");
  });
});

describe("normalizeTextileQuote", () => {
  const baseParams = {
    chainId: 56,
    sellToken: "0x55d398326f99059ff775485246999027b3197955",
    buyToken: "0xa8aea66b361a8d53e8865c62d142167af28af058",
    sellAmount: "500000000000000000",
    slippageBps: 200,
    toDecimals: 6,
  };

  it("accepts partial fills when fillableAmount > 0", () => {
    const result = normalizeTextileQuote(
      {
        data: {
          hasLiquidity: true,
          fullyFilled: false,
          fillableAmount: "400000000000000000",
          proceeds: "650000000",
          effectiveRateRay: "1000000000000000000000000000",
        },
      },
      baseParams,
    );

    expect(result).not.toBeNull();
    expect(result?.sellAmount).toBe("400000000000000000");
    expect(result?.requestedSellAmount).toBe("500000000000000000");
    expect(result?.fullyFilled).toBe(false);
    expect(result?.amountOut).toBe("650");
  });

  it("rejects when fillableAmount is zero", () => {
    const result = normalizeTextileQuote(
      {
        data: {
          hasLiquidity: true,
          fullyFilled: false,
          fillableAmount: "0",
          proceeds: "0",
        },
      },
      baseParams,
    );

    expect(result).toBeNull();
  });

  it("accepts full fills", () => {
    const result = normalizeTextileQuote(
      {
        data: {
          hasLiquidity: true,
          fullyFilled: true,
          fillableAmount: "500000000000000000",
          proceeds: "812500000",
          effectiveRateRay: "1000000000000000000000000000",
        },
      },
      baseParams,
    );

    expect(result).not.toBeNull();
    expect(result?.fullyFilled).toBe(true);
    expect(result?.sellAmount).toBe("500000000000000000");
  });
});
