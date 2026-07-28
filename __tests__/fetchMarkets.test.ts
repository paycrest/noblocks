/**
 * GET /v2/markets client: envelope tolerance, caching and request dedupe.
 *
 * The exact response envelope is not pinned down by a contract we control, so
 * these tests fix the shapes the parser must survive — and prove an
 * unrecognized shape degrades to "unknown" rather than throwing.
 */
import axios from "axios";

import { fetchMarkets } from "../app/api/aggregator";

jest.mock("axios");

const mockedGet = axios.get as jest.MockedFunction<typeof axios.get>;
// The real module reads this at import time via config.
const OFFER = { min: 1, max: 100, balance: 100, rate: 1500 };

/** Each test uses a fresh corridor so the module-level cache never bleeds over. */
let corridor = 0;
function nextCorridor() {
  corridor += 1;
  return {
    side: "buy" as const,
    token: `TOK${corridor}`,
    currency: "NGN",
    network: "base",
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (axios as unknown as { isAxiosError: () => boolean }).isAxiosError = () =>
    false;
});

describe("fetchMarkets envelope parsing", () => {
  it("reads a standard { data: [...] } envelope", async () => {
    mockedGet.mockResolvedValue({
      data: { status: "success", message: "ok", data: [OFFER] },
    } as never);

    await expect(fetchMarkets(nextCorridor())).resolves.toEqual([OFFER]);
  });

  it("reads a bare array response", async () => {
    mockedGet.mockResolvedValue({ data: [OFFER] } as never);

    await expect(fetchMarkets(nextCorridor())).resolves.toEqual([OFFER]);
  });

  it("reads the live shape, where the book sits beside metadata", async () => {
    mockedGet.mockResolvedValue({
      data: {
        status: "success",
        message: "OK",
        data: {
          asOf: "2026-07-28T03:12:14Z",
          aggregates: { corridors: 4, tokens: 3, networks: 8 },
          book: [OFFER],
        },
      },
    } as never);

    await expect(fetchMarkets(nextCorridor())).resolves.toEqual([OFFER]);
  });

  it("returns an empty book for an unrecognized shape instead of throwing", async () => {
    mockedGet.mockResolvedValue({ data: { status: "success" } } as never);

    await expect(fetchMarkets(nextCorridor())).resolves.toEqual([]);
  });

  it("surfaces an error envelope as a rejection", async () => {
    mockedGet.mockResolvedValue({
      data: { status: "error", message: "corridor disabled" },
    } as never);

    await expect(fetchMarkets(nextCorridor())).rejects.toThrow(
      "corridor disabled",
    );
  });

  it("sends the corridor as query params and omits network when absent", async () => {
    mockedGet.mockResolvedValue({ data: { data: [] } } as never);
    const { network, ...withoutNetwork } = nextCorridor();

    await fetchMarkets(withoutNetwork);

    expect(mockedGet).toHaveBeenCalledWith(
      expect.stringContaining("/v2/markets"),
      expect.objectContaining({
        params: {
          side: "buy",
          fiat: "NGN",
          token: withoutNetwork.token,
        },
      }),
    );
  });
});

describe("fetchMarkets caching", () => {
  it("serves a repeat call for the same corridor from cache", async () => {
    mockedGet.mockResolvedValue({ data: { data: [OFFER] } } as never);
    const payload = nextCorridor();

    await fetchMarkets(payload);
    await fetchMarkets(payload);

    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it("does not share a result across corridors", async () => {
    mockedGet.mockResolvedValue({ data: { data: [OFFER] } } as never);

    await fetchMarkets(nextCorridor());
    await fetchMarkets(nextCorridor());

    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it("collapses concurrent callers onto one request", async () => {
    mockedGet.mockResolvedValue({ data: { data: [OFFER] } } as never);
    const payload = nextCorridor();

    await Promise.all([fetchMarkets(payload), fetchMarkets(payload)]);

    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failure", async () => {
    const payload = nextCorridor();
    mockedGet.mockRejectedValueOnce(new Error("boom"));

    await expect(fetchMarkets(payload)).rejects.toThrow("boom");

    mockedGet.mockResolvedValue({ data: { data: [OFFER] } } as never);
    await expect(fetchMarkets(payload)).resolves.toEqual([OFFER]);
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });
});
