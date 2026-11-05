jest.mock("../app/lib/portfolio/service.server", () => ({
  buildPortfolioForWallet: jest.fn(),
}));

jest.mock("../app/lib/portfolio/wallet-context.server", () => ({
  resolvePortfolioWalletContext: jest.fn(),
}));

jest.mock("../app/lib/server-analytics", () => ({
  trackApiRequest: jest.fn(),
  trackApiResponse: jest.fn(),
  trackApiError: jest.fn(),
}));

import { handleGetPortfolio } from "../app/lib/portfolio/route-handler.server";
import { buildPortfolioForWallet } from "../app/lib/portfolio/service.server";
import { resolvePortfolioWalletContext } from "../app/lib/portfolio/wallet-context.server";

const mockedBuild = buildPortfolioForWallet as jest.MockedFunction<
  typeof buildPortfolioForWallet
>;
const mockedResolve = resolvePortfolioWalletContext as jest.MockedFunction<
  typeof resolvePortfolioWalletContext
>;

function request(
  headers: Record<string, string>,
  query = "",
) {
  const params = new URLSearchParams(query);
  return {
    headers: {
      get: (key: string) => headers[key.toLowerCase()] ?? null,
    },
    nextUrl: {
      searchParams: {
        has: (name: string) => params.has(name),
      },
    },
  };
}

describe("GET /api/v1/portfolio auth", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 without session wallet header", async () => {
    const res = await handleGetPortfolio(request({}));
    expect(res.status).toBe(401);
  });

  it("returns 403 when wallet query param is present", async () => {
    const res = await handleGetPortfolio(
      request(
        { "x-wallet-address": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
        "address=0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      ),
    );
    expect(res.status).toBe(403);
    expect(res.body).toBeNull();
  });

  it("returns 403 without x-user-id", async () => {
    const res = await handleGetPortfolio(
      request({
        "x-wallet-address": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns portfolio summary for authenticated session", async () => {
    mockedResolve.mockResolvedValue({
      primaryEvm: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      evmBalanceAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      starknetAddress: null,
      tronAddress: null,
    });
    mockedBuild.mockResolvedValue({
      success: true,
      totalUsd: "0",
      stale: false,
      asOf: "2026-11-05T12:00:00.000Z",
      buckets: {
        tokens: { totalUsd: "0", stale: false, asOf: "2026-11-05T12:00:00.000Z", holdings: [] },
        earn: { totalUsd: "0", stale: false, asOf: "2026-11-05T12:00:00.000Z", holdings: [] },
        stocks: { totalUsd: "0", stale: false, asOf: "2026-11-05T12:00:00.000Z", holdings: [] },
      },
    });

    const res = await handleGetPortfolio(
      request({
        "x-wallet-address": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "x-user-id": "did:privy:abc",
      }),
    );
    expect(res.status).toBe(200);
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
    }
    expect(mockedBuild).toHaveBeenCalled();
  });
});
