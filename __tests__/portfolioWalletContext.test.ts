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

  it("uses middleware primary EVM when only a legacy smart wallet is linked", async () => {
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
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
  });

  it("prefers embedded EOA over smart wallet for EVM balance reads", async () => {
    mockedGetPrivyClient.mockReturnValue({
      getUser: async () => ({
        linkedAccounts: [
          {
            type: "smart_wallet",
            address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          },
          {
            type: "wallet",
            connectorType: "embedded",
            address: "0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
          },
        ],
      }),
    } as ReturnType<typeof getPrivyClient>);

    const ctx = await resolvePortfolioWalletContext(
      "did:privy:test",
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    expect(ctx.evmBalanceAddress).toBe(
      "0xcccccccccccccccccccccccccccccccccccccccc",
    );
  });
});
