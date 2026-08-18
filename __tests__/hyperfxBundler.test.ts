/// <reference types="jest" />

import {
  getHyperfxBundlerUrl,
  requireHyperfxBundlerUrl,
  resolveHyperfxBundlerUrl,
} from "../app/utils";

describe("HyperFX bundler URL (server)", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.ALCHEMY_API_KEY;
  });

  afterAll(() => {
    process.env = env;
  });

  it("builds Alchemy Base bundler URL from ALCHEMY_API_KEY", () => {
    process.env.ALCHEMY_API_KEY = "test-key";
    expect(getHyperfxBundlerUrl("Base")).toBe(
      "https://base-mainnet.g.alchemy.com/v2/test-key",
    );
  });

  it("builds Alchemy Polygon bundler URL from ALCHEMY_API_KEY", () => {
    process.env.ALCHEMY_API_KEY = "test-key";
    expect(getHyperfxBundlerUrl("Polygon")).toBe(
      "https://polygon-mainnet.g.alchemy.com/v2/test-key",
    );
  });

  it("returns undefined for unsupported networks", () => {
    process.env.ALCHEMY_API_KEY = "test-key";
    expect(getHyperfxBundlerUrl("Lisk")).toBeUndefined();
  });

  it("throws when Alchemy key is missing", () => {
    expect(() => requireHyperfxBundlerUrl("Base")).toThrow(/bundler URL not configured/i);
  });

  it("resolveHyperfxBundlerUrl uses ALCHEMY_API_KEY on the server", async () => {
    const originalWindow = global.window;
    // @ts-expect-error simulate Node server runtime
    delete global.window;
    process.env.ALCHEMY_API_KEY = "server-key";
    try {
      await expect(resolveHyperfxBundlerUrl("Base")).resolves.toBe(
        "https://base-mainnet.g.alchemy.com/v2/server-key",
      );
    } finally {
      global.window = originalWindow;
    }
  });
});

describe("HyperFX bundler URL (browser)", () => {
  const env = process.env;
  const originalWindow = global.window;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.ALCHEMY_API_KEY;
    // @ts-expect-error simulate browser runtime
    global.window = {};
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.window = originalWindow;
    global.fetch = originalFetch;
  });

  afterAll(() => {
    process.env = env;
  });

  it("fetches bundler URL from the server API in the browser", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        bundlerUrl: "https://base-mainnet.g.alchemy.com/v2/server-key",
      }),
    });

    await expect(resolveHyperfxBundlerUrl("Base", "test-token")).resolves.toBe(
      "https://base-mainnet.g.alchemy.com/v2/server-key",
    );
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/bridge/hyperfx/bundler?network=Base",
      { headers: { Authorization: "Bearer test-token" } },
    );
  });
});
