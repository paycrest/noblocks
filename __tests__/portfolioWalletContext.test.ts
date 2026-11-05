jest.mock("../app/lib/privy", () => ({
  getPrivyClient: jest.fn(),
}));

import { getPrivyClient } from "../app/lib/privy";
import { resolvePortfolioWalletContext } from "../app/lib/portfolio/wallet-context.server";

const mockedGetPrivyClient = getPrivyClient as jest.MockedFunction<
  typeof getPrivyClient
>;

describe("resolvePortfolioWalletContext", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("preserves Tron base58 address casing", async () => {
    const tronAddress = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";
    mockedGetPrivyClient.mockReturnValue({
      getUser: async () => ({
        linkedAccounts: [
          {
            type: "wallet",
            chainType: "tron",
            address: tronAddress,
          },
        ],
      }),
    } as ReturnType<typeof getPrivyClient>);

    const ctx = await resolvePortfolioWalletContext(
      "did:privy:test",
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    expect(ctx.tronAddress).toBe(tronAddress);
  });

  it("lowercases EVM smart wallet addresses", async () => {
    mockedGetPrivyClient.mockReturnValue({
      getUser: async () => ({
        linkedAccounts: [
          {
            type: "smart_wallet",
            address: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
          },
        ],
      }),
    } as ReturnType<typeof getPrivyClient>);

    const ctx = await resolvePortfolioWalletContext(
      "did:privy:test",
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    expect(ctx.evmBalanceAddress).toBe(
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    );
  });
});
