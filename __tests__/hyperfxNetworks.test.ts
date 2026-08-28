/// <reference types="jest" />

import { isHyperfxSupportedNetwork } from "../app/lib/hyperfxNetworks";

describe("isHyperfxSupportedNetwork", () => {
  it("accepts configured networks", () => {
    expect(isHyperfxSupportedNetwork("Base")).toBe(true);
    expect(isHyperfxSupportedNetwork("Polygon")).toBe(true);
  });

  it("rejects inherited object keys", () => {
    expect(isHyperfxSupportedNetwork("toString")).toBe(false);
  });
});
