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

import {
  engineFromQuote,
  normalizeTextileQuote,
  selectEngine,
  type BridgeLeg,
} from "../app/lib/bridge";
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

describe("engineFromQuote", () => {
  it("maps textile-swap quotes to the textile engine", () => {
    expect(
      engineFromQuote({
        kind: "textile-swap",
        amountOut: "100",
        feeReceivingToken: "0",
        chainId: 56,
        sellToken: "0xabc",
        buyToken: "0xdef",
        sellAmount: "1000000",
        toDecimals: 6,
        raw: {},
      }),
    ).toBe("textile");
  });
});

describe("normalizeTextileQuote (v2 RFQ preview)", () => {
  const baseParams = {
    chainId: 56,
    sellToken: "0x55d398326f99059ff775485246999027b3197955",
    buyToken: "0xa8aea66b361a8d53e8865c62d142167af28af058",
    sellAmount: "1000000000000000000",
    toDecimals: 6,
  };

  it("accepts preview status with buyAmount", () => {
    const result = normalizeTextileQuote(
      {
        data: {
          status: "preview",
          sellAmount: "1000000000000000000",
          buyAmount: "1625000000",
          feeAmount: "99990",
          takerPays: "1000000000000000000",
          rateRay: "1625000000000000000000000000",
        },
      },
      baseParams,
    );

    expect(result).not.toBeNull();
    expect(result?.amountOut).toBe("1625");
    expect(result?.sellAmount).toBe("1000000000000000000");
  });

  it("rejects no_quote preview", () => {
    const result = normalizeTextileQuote(
      {
        data: {
          status: "no_quote",
          reason: "no_valid_quote",
        },
      },
      baseParams,
    );

    expect(result).toBeNull();
  });

  it("rejects zero buyAmount", () => {
    const result = normalizeTextileQuote(
      {
        data: {
          status: "preview",
          buyAmount: "0",
        },
      },
      baseParams,
    );

    expect(result).toBeNull();
  });

  it("rejects missing status", () => {
    const result = normalizeTextileQuote(
      {
        data: {
          buyAmount: "1625000000",
        },
      },
      baseParams,
    );

    expect(result).toBeNull();
  });
});

describe("textileServer validation", () => {
  const validBscPreview = {
    chainId: 56,
    sellToken: "0x55d398326f99059ff775485246999027b3197955",
    buyToken: "0xa8aea66b361a8d53e8865c62d142167af28af058",
    sellAmount: "1000000000000000000",
  };

  const validBscRequest = {
    ...validBscPreview,
    taker: "0x0000000000000000000000000000000000000001",
  };

  it("parseJsonObjectBody rejects null and arrays", () => {
    const { parseJsonObjectBody } = require("../app/lib/textileServer");

    expect(parseJsonObjectBody(null).ok).toBe(false);
    expect(parseJsonObjectBody([]).ok).toBe(false);
    expect(parseJsonObjectBody({ chainId: 56 }).ok).toBe(true);
  });

  it("validateTextilePreviewBody accepts BSC USDT to cNGN", () => {
    const { validateTextilePreviewBody } = require("../app/lib/textileServer");

    expect(validateTextilePreviewBody(validBscPreview).ok).toBe(true);
  });

  it("validateTextilePreviewBody rejects missing sellAmount", () => {
    const { validateTextilePreviewBody } = require("../app/lib/textileServer");

    const { sellAmount: _, ...rest } = validBscPreview;
    expect(validateTextilePreviewBody(rest).ok).toBe(false);
  });

  it("validateTextileRequestBody requires taker", () => {
    const { validateTextileRequestBody } = require("../app/lib/textileServer");

    expect(validateTextileRequestBody(validBscPreview).ok).toBe(false);
    expect(validateTextileRequestBody(validBscRequest).ok).toBe(true);
  });

  it("validateTextileRequestBody rejects unsupported chainId", () => {
    const { validateTextileRequestBody } = require("../app/lib/textileServer");

    expect(
      validateTextileRequestBody({ ...validBscRequest, chainId: 8453 }).ok,
    ).toBe(false);
  });

  it("validateTextileRequestBody rejects non-positive sellAmount", () => {
    const { validateTextileRequestBody } = require("../app/lib/textileServer");

    expect(
      validateTextileRequestBody({ ...validBscRequest, sellAmount: "0" }).ok,
    ).toBe(false);
  });

  it("validateTextileRequestBody rejects invalid addresses", () => {
    const { validateTextileRequestBody } = require("../app/lib/textileServer");

    expect(
      validateTextileRequestBody({ ...validBscRequest, taker: "not-an-address" }).ok,
    ).toBe(false);
  });

  it("validateTextileRequestBody rejects unsupported token pairs", () => {
    const { validateTextileRequestBody } = require("../app/lib/textileServer");

    expect(
      validateTextileRequestBody({
        ...validBscRequest,
        buyToken: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
      }).ok,
    ).toBe(false);
  });

  it("validateTextileRequestBody accepts Celo USDT to cNGN", () => {
    const { validateTextileRequestBody } = require("../app/lib/textileServer");

    expect(
      validateTextileRequestBody({
        chainId: 42220,
        sellToken: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
        buyToken: "0xF6829D7393dAe24509eb1E52eE8e572e2E271a4f",
        sellAmount: "1000000",
        taker: "0x0000000000000000000000000000000000000001",
      }).ok,
    ).toBe(true);
  });

  it("validateTextileSubmitBody accepts rfqId alias swapId", () => {
    const { validateTextileSubmitBody } = require("../app/lib/textileServer");

    expect(
      validateTextileSubmitBody({
        rfqId: "rfq_abc",
        txHash: "0xabc",
      }).ok,
    ).toBe(true);

    expect(
      validateTextileSubmitBody({
        swapId: "rfq_legacy",
        txHash: "0xabc",
      }).ok,
    ).toBe(true);
  });
});
