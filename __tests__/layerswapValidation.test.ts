import {
  parseLayerswapAmountBody,
  parseLayerswapAmountParam,
} from "../app/lib/layerswapValidation";
import { resolveLayerswapApiBaseUrl } from "../app/lib/layerswapConfig";

describe("parseLayerswapAmountParam", () => {
  it("accepts valid positive amounts", () => {
    expect(parseLayerswapAmountParam("0.1")).toBe(0.1);
    expect(parseLayerswapAmountParam("1")).toBe(1);
  });

  it("rejects partial parse strings", () => {
    expect(parseLayerswapAmountParam("1abc")).toBeNull();
  });

  it("rejects non-finite values", () => {
    expect(parseLayerswapAmountParam("Infinity")).toBeNull();
    expect(parseLayerswapAmountParam("-1")).toBeNull();
    expect(parseLayerswapAmountParam("0")).toBeNull();
  });
});

describe("parseLayerswapAmountBody", () => {
  it("rejects invalid body amounts", () => {
    expect(parseLayerswapAmountBody("1abc")).toBeNull();
    expect(parseLayerswapAmountBody(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("resolveLayerswapApiBaseUrl", () => {
  it("strips trailing slashes and requires https", () => {
    expect(resolveLayerswapApiBaseUrl("https://api.layerswap.io/")).toBe(
      "https://api.layerswap.io",
    );
  });

  it("falls back when http is configured", () => {
    expect(resolveLayerswapApiBaseUrl("http://evil.example")).toBe(
      "https://api.layerswap.io",
    );
  });
});
