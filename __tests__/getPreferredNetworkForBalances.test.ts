/// <reference types="jest" />

import { getPreferredNetworkForBalances } from "../app/lib/getPreferredNetworkForBalances";

type BalanceEntry = Parameters<typeof getPreferredNetworkForBalances>[0][number];

const makeEntry = (name: string, total: number): BalanceEntry => ({
  network: {
    chain: {
      name,
    },
    imageUrl: "",
  },
  balances: {
    total,
    balances: {},
  },
});

describe("getPreferredNetworkForBalances", () => {
  it("returns null when there are no positive balances", () => {
    expect(
      getPreferredNetworkForBalances([
        makeEntry("Arbitrum One", 0),
        makeEntry("Base", 0),
      ]),
    ).toBeNull();
  });

  it("returns the network with the highest total balance", () => {
    expect(
      getPreferredNetworkForBalances([
        makeEntry("Arbitrum One", 25),
        makeEntry("Base", 75),
        makeEntry("Polygon", 10),
      ])?.chain.name,
    ).toBe("Base");
  });

  it("prefers the current network when totals tie", () => {
    expect(
      getPreferredNetworkForBalances(
        [
          makeEntry("Arbitrum One", 50),
          makeEntry("Base", 50),
        ],
        "Base",
      )?.chain.name,
    ).toBe("Base");
  });
});
