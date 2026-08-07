import {
  evmWalletDisplayTotalUsd,
  parseEarnDepositedUsd,
  resolveEvmEarnWalletDisplayTotal,
  selectedChainLiquidUsd,
} from "../app/lib/evmEarnWalletTotal";
import type { CrossChainBalanceEntry } from "../app/context";

jest.mock("../app/lib/config", () => ({
  __esModule: true,
  default: {
    earnEnabled: true,
    evmEarnEnabled: true,
  },
}));

function entry(chainName: string, total: number): CrossChainBalanceEntry {
  return {
    network: { chain: { name: chainName, id: 1 } } as CrossChainBalanceEntry["network"],
    balances: {
      total,
      balances: { USDC: total },
      rawBalances: { USDC: total },
    },
  };
}

describe("evmEarnWalletTotal", () => {
  it("sums liquid and earn for EVM earn chains", () => {
    const result = resolveEvmEarnWalletDisplayTotal({
      chainName: "Base",
      crossChainBalances: [entry("Base", 0.05), entry("Polygon", 1)],
      earnDepositedUsd: 0.048,
    });
    expect(result.liquidUsd).toBe(0.05);
    expect(result.displayTotalUsd).toBeCloseTo(0.098, 6);
    expect(result.includesEarn).toBe(true);
  });

  it("does not add earn on non-earn chains", () => {
    const result = resolveEvmEarnWalletDisplayTotal({
      chainName: "Lisk",
      crossChainBalances: [entry("Lisk", 0.2)],
      earnDepositedUsd: 0.048,
    });
    expect(result.displayTotalUsd).toBe(0.2);
    expect(result.includesEarn).toBe(false);
  });

  it("selectedChainLiquidUsd reads one network entry", () => {
    expect(
      selectedChainLiquidUsd([entry("Base", 0.05), entry("Polygon", 1)], "Base"),
    ).toBe(0.05);
  });

  it("parseEarnDepositedUsd rejects invalid values", () => {
    expect(parseEarnDepositedUsd("0.048")).toBe(0.048);
    expect(parseEarnDepositedUsd("")).toBe(0);
    expect(parseEarnDepositedUsd(undefined)).toBe(0);
  });

  it("evmWalletDisplayTotalUsd adds safely", () => {
    expect(evmWalletDisplayTotalUsd(0.05, 0.048)).toBeCloseTo(0.098, 6);
  });
});
