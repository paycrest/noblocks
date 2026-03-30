/// <reference types="jest" />

import { getPreferredNetworkForBalances } from "../app/lib/getPreferredNetworkForBalances";

type BalanceEntry = Parameters<typeof getPreferredNetworkForBalances>[0][number];

const makeEntry = (
  name: string,
  balances: Record<string, number>,
  total = Object.values(balances).reduce((sum, value) => sum + value, 0),
): BalanceEntry => ({
  network: {
    chain: {
      name,
    },
    imageUrl: "",
  },
  balances: {
    total,
    balances,
  },
});

describe("getPreferredNetworkForBalances", () => {
  it("returns null for an empty balance list", () => {
    expect(getPreferredNetworkForBalances([])).toBeNull();
  });

  it("returns null when there are no positive balances", () => {
    expect(
      getPreferredNetworkForBalances([
        makeEntry("Arbitrum One", { USDC: 0 }),
        makeEntry("Base", { USDT: 0 }),
      ]),
    ).toBeNull();
  });

  it("returns the network containing the highest-value token", () => {
    expect(
      getPreferredNetworkForBalances([
        makeEntry("Arbitrum One", { USDC: 60, USDT: 40 }),
        makeEntry("Base", { USDC: 80 }),
        makeEntry("Polygon", { USDT: 10 }),
      ])?.chain.name,
    ).toBe("Base");
  });

  it("ignores negative token balances", () => {
    expect(
      getPreferredNetworkForBalances([
        makeEntry("Arbitrum One", { USDC: -50 }),
        makeEntry("Base", { USDT: 10 }),
      ])?.chain.name,
    ).toBe("Base");
  });

  it("prefers the current network when the highest-value token ties", () => {
    expect(
      getPreferredNetworkForBalances(
        [
          makeEntry("Arbitrum One", { USDC: 50, USDT: 20 }),
          makeEntry("Base", { USDC: 50 }),
        ],
        "Base",
      )?.chain.name,
    ).toBe("Base");
  });

  it("keeps the first encountered network when ties have no current network", () => {
    expect(
      getPreferredNetworkForBalances([
        makeEntry("Arbitrum One", { USDC: 50 }),
        makeEntry("Base", { USDT: 50 }),
      ])?.chain.name,
    ).toBe("Arbitrum One");
  });

  it("compares ties using each network's highest positive token", () => {
    expect(
      getPreferredNetworkForBalances(
        [
          makeEntry("Arbitrum One", { DAI: 11, USDC: 50 }),
          makeEntry("Base", { DAI: 10, USDT: 50 }),
        ],
        "Base",
      )?.chain.name,
    ).toBe("Base");
  });
});
