import { screenAddress, __clearScorechainCache } from "../app/lib/scorechain";

const ADDR = "0x1111111111111111111111111111111111111111";

function mockFetchOnce(impl: () => Promise<Partial<Response>> | Partial<Response>) {
  (global.fetch as unknown as jest.Mock).mockImplementationOnce(impl as never);
}

describe("screenAddress", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    __clearScorechainCache();
    process.env.SCORECHAIN_API_KEY = "test-key";
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetAllMocks();
  });

  it("returns isSanctioned=false for a clean address", async () => {
    mockFetchOnce(() => ({
      ok: true,
      status: 200,
      json: async () => [{ isSanctioned: false }],
    }));
    const result = await screenAddress(ADDR);
    expect(result.isSanctioned).toBe(false);
    expect(result.details).toBeUndefined();
  });

  it("returns isSanctioned=true with details for a sanctioned address", async () => {
    mockFetchOnce(() => ({
      ok: true,
      status: 200,
      json: async () => [
        {
          isSanctioned: true,
          details: {
            name: "Bad Actor (OFAC)",
            sanctionDate: 1587562485,
            prettySanctionDate: "2020-04-22T13:34:45.000Z",
            blockchain: "Ethereum",
          },
        },
      ],
    }));
    const result = await screenAddress(ADDR);
    expect(result.isSanctioned).toBe(true);
    expect(result.details?.name).toBe("Bad Actor (OFAC)");
    expect(result.details?.blockchain).toBe("Ethereum");
  });

  it("treats an empty array as clean", async () => {
    mockFetchOnce(() => ({ ok: true, status: 200, json: async () => [] }));
    const result = await screenAddress(ADDR);
    expect(result.isSanctioned).toBe(false);
  });

  it("throws on a malformed (non-array) 200 body so callers fail-closed", async () => {
    mockFetchOnce(() => ({ ok: true, status: 200, json: async () => ({}) }));
    await expect(screenAddress(ADDR)).rejects.toThrow(/unexpected response shape/i);
  });

  it("throws when the array element lacks a boolean isSanctioned", async () => {
    mockFetchOnce(() => ({
      ok: true,
      status: 200,
      json: async () => [{ foo: "bar" }],
    }));
    await expect(screenAddress(ADDR)).rejects.toThrow(/unexpected response shape/i);
  });

  it("throws on 429 so callers fail-closed", async () => {
    mockFetchOnce(() => ({ ok: false, status: 429, json: async () => ({}) }));
    await expect(screenAddress(ADDR)).rejects.toThrow(/rate limit/i);
  });

  it("throws on non-2xx so callers fail-closed", async () => {
    mockFetchOnce(() => ({ ok: false, status: 500, json: async () => ({}) }));
    await expect(screenAddress(ADDR)).rejects.toThrow(/HTTP 500/);
  });

  it("throws when the API key is missing", async () => {
    delete process.env.SCORECHAIN_API_KEY;
    await expect(screenAddress(ADDR)).rejects.toThrow(/SCORECHAIN_API_KEY/);
  });

  it("throws on empty address without calling fetch", async () => {
    await expect(screenAddress("")).rejects.toThrow(/address is required/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("caches results to respect the rate limit (single fetch for repeat calls)", async () => {
    mockFetchOnce(() => ({
      ok: true,
      status: 200,
      json: async () => [{ isSanctioned: false }],
    }));
    await screenAddress(ADDR);
    await screenAddress(ADDR.toUpperCase()); // case-insensitive cache key
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
