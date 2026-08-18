/// <reference types="jest" />

import { getHyperfxBundlerUrl, requireHyperfxBundlerUrl } from "../app/utils";

describe("HyperFX bundler URL", () => {
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

  it("throws when ALCHEMY_API_KEY is missing", () => {
    expect(() => requireHyperfxBundlerUrl("Base")).toThrow(
      /Set ALCHEMY_API_KEY/,
    );
  });
});
