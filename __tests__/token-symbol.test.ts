/**
 * Token symbol helpers — display `cNGN` vs aggregator wire `CNGN`.
 */
import {
  canonicalTokenSymbol,
  tokensEqual,
  toAggregatorToken,
} from "../app/lib/token-symbol";

describe("token-symbol", () => {
  describe("canonicalTokenSymbol", () => {
    it("normalizes cngn variants to cNGN", () => {
      expect(canonicalTokenSymbol("cNGN")).toBe("cNGN");
      expect(canonicalTokenSymbol("CNGN")).toBe("cNGN");
      expect(canonicalTokenSymbol("cngn")).toBe("cNGN");
      expect(canonicalTokenSymbol(" CnGn ")).toBe("cNGN");
    });

    it("passes through other symbols", () => {
      expect(canonicalTokenSymbol("USDC")).toBe("USDC");
      expect(canonicalTokenSymbol("usdt")).toBe("usdt");
    });

    it("returns empty for missing values", () => {
      expect(canonicalTokenSymbol(null)).toBe("");
      expect(canonicalTokenSymbol("")).toBe("");
      expect(canonicalTokenSymbol("  ")).toBe("");
    });
  });

  describe("tokensEqual", () => {
    it("matches case-insensitively", () => {
      expect(tokensEqual("cNGN", "CNGN")).toBe(true);
      expect(tokensEqual("usdc", "USDC")).toBe(true);
      expect(tokensEqual("USDC", "USDT")).toBe(false);
    });
  });

  describe("toAggregatorToken", () => {
    it("maps cNGN to CNGN for aggregator APIs", () => {
      expect(toAggregatorToken("cNGN")).toBe("CNGN");
      expect(toAggregatorToken("CNGN")).toBe("CNGN");
      expect(toAggregatorToken("cngn")).toBe("CNGN");
    });

    it("leaves other tokens unchanged", () => {
      expect(toAggregatorToken("USDC")).toBe("USDC");
    });
  });
});
