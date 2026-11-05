/**
 * @jest-environment node
 */

jest.mock("../app/lib/server-analytics", () => ({
  trackApiRequest: jest.fn(),
  trackApiResponse: jest.fn(),
  trackApiError: jest.fn(),
}));

jest.mock("../app/lib/market-data/chainlink", () => ({
  chainlinkPriceProvider: {
    readLatest: jest.fn(),
    readAt: jest.fn(),
    readHistoryAtTimestamps: jest.fn(),
  },
}));

const mockGetTokenMarketSnapshot = jest.fn();
const mockGetTokenHistory = jest.fn();

jest.mock("../app/lib/market-data/service", () => {
  const actual = jest.requireActual("../app/lib/market-data/service");
  return {
    ...actual,
    getTokenMarketSnapshot: (...args: unknown[]) =>
      mockGetTokenMarketSnapshot(...args),
    getTokenHistory: (...args: unknown[]) => mockGetTokenHistory(...args),
  };
});

import { NextRequest } from "next/server";
import { chainlinkPriceProvider } from "../app/lib/market-data/chainlink";
import { PriceUnavailableError } from "../app/lib/market-data/service";
import { GET as getTokenRoute } from "../app/api/market/tokens/[id]/route";
import { GET as getHistoryRoute } from "../app/api/market/tokens/[id]/history/route";

const mockedReadLatest = chainlinkPriceProvider.readLatest as jest.Mock;
const mockedHistoryReads =
  chainlinkPriceProvider.readHistoryAtTimestamps as jest.Mock;

function tokenRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/market/tokens/${id}`);
}

function historyRequest(id: string, range: string): NextRequest {
  return new NextRequest(
    `http://localhost/api/market/tokens/${id}/history?range=${range}`,
  );
}

beforeEach(() => {
  mockGetTokenMarketSnapshot.mockReset();
  mockGetTokenHistory.mockReset();
  mockedReadLatest.mockReset();
  mockedHistoryReads.mockReset();
});

describe("GET /api/market/tokens/[id]", () => {
  it("returns 200 with envelope on success", async () => {
    mockGetTokenMarketSnapshot.mockResolvedValue({
      id: "usdc",
      price: "1",
      change24h: { pct: "0", abs: "0" },
      asOf: new Date().toISOString(),
      source: "chainlink:base:usdc-usd",
      derived: false,
      stale: false,
      marketClosed: false,
      stats: null,
    });

    const res = await getTokenRoute(tokenRequest("usdc"), {
      params: Promise.resolve({ id: "usdc" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("usdc");
    expect(mockGetTokenMarketSnapshot).toHaveBeenCalledWith("usdc");
    expect(mockedReadLatest).not.toHaveBeenCalled();
  });

  it("returns 404 for unknown id without calling the service or Chainlink", async () => {
    const res = await getTokenRoute(tokenRequest("notreal"), {
      params: Promise.resolve({ id: "notreal" }),
    });
    expect(res.status).toBe(404);
    expect(mockGetTokenMarketSnapshot).not.toHaveBeenCalled();
    expect(mockedReadLatest).not.toHaveBeenCalled();
  });

  it("returns 503 when price is unavailable", async () => {
    mockGetTokenMarketSnapshot.mockRejectedValue(new PriceUnavailableError());
    const res = await getTokenRoute(tokenRequest("usdc"), {
      params: Promise.resolve({ id: "usdc" }),
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/unavailable/i);
  });
});

describe("GET /api/market/tokens/[id]/history", () => {
  it("returns 400 for invalid range", async () => {
    const res = await getHistoryRoute(historyRequest("usdc", "2D"), {
      params: Promise.resolve({ id: "usdc" }),
    });
    expect(res.status).toBe(400);
    expect(mockGetTokenHistory).not.toHaveBeenCalled();
  });

  it("returns 404 for unknown id without upstream calls", async () => {
    const res = await getHistoryRoute(historyRequest("badtoken", "1D"), {
      params: Promise.resolve({ id: "badtoken" }),
    });
    expect(res.status).toBe(404);
    expect(mockGetTokenHistory).not.toHaveBeenCalled();
    expect(mockedHistoryReads).not.toHaveBeenCalled();
  });

  it("returns 200 for valid range", async () => {
    mockGetTokenHistory.mockResolvedValue({
      id: "usdc",
      range: "1D",
      points: [[1_700_000_000, "1"]],
      from: 1_699_000_000,
      asOf: new Date().toISOString(),
      stale: false,
    });
    const res = await getHistoryRoute(historyRequest("usdc", "1D"), {
      params: Promise.resolve({ id: "usdc" }),
    });
    expect(res.status).toBe(200);
    expect(mockGetTokenHistory).toHaveBeenCalledWith("usdc", "1D");
  });
});
