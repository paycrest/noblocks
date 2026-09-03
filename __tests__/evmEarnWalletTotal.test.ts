import {
  evmWalletDisplayTotalUsd,
  parseEarnDepositedUsd,
  resolveEvmEarnWalletDisplayTotal,
  selectedChainLiquidUsd,
  sumAllChainLiquidUsd,
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
  it("sums cross-chain liquid and earn for EVM earn chains", () => {
    const result = resolveEvmEarnWalletDisplayTotal({
      chainName: "Base",
      crossChainBalances: [entry("Base", 0.05), entry("Polygon", 1)],
      earnDepositedUsd: 0.048,
    });
    expect(result.liquidUsd).toBe(1.05);
    expect(result.displayTotalUsd).toBeCloseTo(1.098, 6);
    expect(result.includesEarn).toBe(true);
  });

  it("includes all chains in total when selected chain is Base", () => {
    const result = resolveEvmEarnWalletDisplayTotal({
      chainName: "Base",
      crossChainBalances: [
        entry("Base", 298.77),
        entry("Ethereum", 200.1),
        entry("Lisk", 200),
      ],
      earnDepositedUsd: 0,
    });
    expect(result.liquidUsd).toBeCloseTo(698.87, 2);
    expect(result.displayTotalUsd).toBeCloseTo(698.87, 2);
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

  it("sumAllChainLiquidUsd sums every network entry", () => {
    expect(
      sumAllChainLiquidUsd([entry("Base", 0.05), entry("Polygon", 1)]),
    ).toBe(1.05);
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
