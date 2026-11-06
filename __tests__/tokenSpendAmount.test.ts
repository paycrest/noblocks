import { describe, expect, it } from "@jest/globals";
import type { Token } from "@/app/types";
import {
  amountNumberToBaseUnits,
  buildOfframpSpendWei,
  resolveSpendTokenFromList,
  toRawAmount,
} from "@/app/lib/tokenSpendAmount";

const baseUsdcAddress = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

describe("resolveSpendTokenFromList", () => {
  const tokens: Token[] = [
    {
      name: "USD Coin",
      symbol: "USDC",
      decimals: 6,
      address: baseUsdcAddress,
    },
  ];

  it("blocks when USDC has address but decimals are missing (invalid)", () => {
    const list: Token[] = [
      {
        ...tokens[0],
        decimals: undefined as unknown as number,
      },
    ];
    const r = resolveSpendTokenFromList({
      tokens: list,
      tokenAddress: baseUsdcAddress,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid_decimals");
  });

  it("blocks when symbol is present but there is no address match", () => {
    const r = resolveSpendTokenFromList({
      tokens,
      tokenAddress: "0x0000000000000000000000000000000000000001",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no_matching_token");
  });

  it("matches EVM addresses case-insensitively", () => {
    const r = resolveSpendTokenFromList({
      tokens,
      tokenAddress: baseUsdcAddress.toUpperCase(),
    });
    expect(r.ok).toBe(true);
  });

  it("blocks when tokenAddress is empty", () => {
    const r = resolveSpendTokenFromList({ tokens, tokenAddress: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("missing_token_address");
  });
});

describe("buildOfframpSpendWei", () => {
  const okResolution = resolveSpendTokenFromList({
    tokens: [
      {
        name: "USD Coin",
        symbol: "USDC",
        decimals: 6,
        address: baseUsdcAddress,
      },
    ],
    tokenAddress: baseUsdcAddress,
  });

  it("Base list USDC missing decimals: blocked, no fake 1e20 wei", () => {
    const blocked = resolveSpendTokenFromList({
      tokens: [
        {
          name: "USD Coin",
          symbol: "USDC",
          decimals: undefined as unknown as number,
          address: baseUsdcAddress,
        },
      ],
      tokenAddress: baseUsdcAddress,
    });
    const b = buildOfframpSpendWei(100, blocked);
    expect(b.ok).toBe(false);
  });

  it("normal 6-decimal USDC: 100 -> 100000000n", () => {
    if (!okResolution.ok) throw new Error("fixture");
    const b = buildOfframpSpendWei(100, okResolution);
    expect(b.ok).toBe(true);
    if (b.ok) expect(b.wei).toBe(100_000_000n);
  });

  it("exact fractional amount at 6 decimals", () => {
    if (!okResolution.ok) throw new Error("fixture");
    const b = buildOfframpSpendWei(1.234567, okResolution);
    expect(b.ok).toBe(true);
    if (b.ok) expect(b.wei).toBe(1234567n);
  });

  it("too many fractional digits fails closed (viem ParseUnitsError)", () => {
    if (!okResolution.ok) throw new Error("fixture");
    const b = buildOfframpSpendWei("1.2345678", okResolution);
    expect(b.ok).toBe(false);
  });
});

describe("toRawAmount", () => {
  it("throws on invalid decimals instead of returning 0", () => {
    expect(() => toRawAmount("100", NaN)).toThrow(
      "Token decimals missing or invalid",
    );
  });

  it("converts 100 at 6 decimals to base units string", () => {
    expect(toRawAmount("100", 6)).toBe("100000000");
  });
});

describe("amountNumberToBaseUnits", () => {
  it("converts 100 at 6 decimals", () => {
    expect(amountNumberToBaseUnits(100, 6)).toBe("100000000");
  });

  it("rejects excess fractional precision for number input (fail closed)", () => {
    expect(() => amountNumberToBaseUnits(1.2345678, 6)).toThrow(
      "Fractional amount exceeds the token's decimal precision.",
    );
  });
});
