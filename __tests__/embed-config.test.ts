import {
  parseCurrencyAllowlist,
  parseEmbedConfig,
  parseTokenAllowlist,
  isTokenInAllowlist,
  isCurrencyInAllowlist,
} from "../app/lib/embed-config";

function params(entries: Record<string, string | null>) {
  return {
    get: (key: string) =>
      Object.prototype.hasOwnProperty.call(entries, key)
        ? entries[key]
        : null,
  };
}

describe("embed-config allowlists", () => {
  describe("parseTokenAllowlist", () => {
    it("returns null when the key is absent", () => {
      expect(parseTokenAllowlist(null)).toBeNull();
    });

    it("canonicalizes and dedupes cNGN variants", () => {
      expect(parseTokenAllowlist("cNGN,USDC,CNGN")).toEqual(["cNGN", "USDC"]);
    });

    it("returns empty array for empty CSV", () => {
      expect(parseTokenAllowlist("")).toEqual([]);
      expect(parseTokenAllowlist("  ,  ")).toEqual([]);
    });
  });

  describe("parseCurrencyAllowlist", () => {
    it("returns null when absent and uppercases present values", () => {
      expect(parseCurrencyAllowlist(null)).toBeNull();
      expect(parseCurrencyAllowlist("ngn,kes")).toEqual(["NGN", "KES"]);
    });
  });

  describe("isTokenInAllowlist / isCurrencyInAllowlist", () => {
    it("allows all when allowlist is null", () => {
      expect(isTokenInAllowlist("USDC", null)).toBe(true);
      expect(isCurrencyInAllowlist("NGN", null)).toBe(true);
    });

    it("matches tokens case-insensitively against the allowlist", () => {
      expect(isTokenInAllowlist("CNGN", ["cNGN"])).toBe(true);
      expect(isTokenInAllowlist("USDT", ["cNGN"])).toBe(false);
    });
  });

  describe("parseEmbedConfig", () => {
    it("parses allowlists, defaults, and hideSideToggle", () => {
      const config = parseEmbedConfig(
        params({
          token: "CNGN",
          tokens: "cNGN,USDC",
          currency: "ngn",
          currencies: "NGN",
          network: "base",
          networks: "base,arbitrum-one",
          hideSideToggle: "1",
          side: "sell",
        }),
      );

      expect(config.tokenAllowlist).toEqual(["cNGN", "USDC"]);
      expect(config.currencyAllowlist).toEqual(["NGN"]);
      expect(config.defaultToken).toBe("cNGN");
      expect(config.defaultCurrency).toBe("NGN");
      expect(config.hideSideToggle).toBe(true);
      expect(config.hideSupport).toBe(false);
      expect(config.sideLockedFromUrl).toBe(true);
      expect(config.networkConfig.isLocked).toBe(false);
      expect(config.networkConfig.allowlist?.map((n) => n.chain.name)).toEqual([
        "Base",
        "Arbitrum One",
      ]);
      expect(config.networkConfig.defaultNetwork?.chain.name).toBe("Base");
    });

    it("parses hideSupport from truthy flag values", () => {
      expect(parseEmbedConfig(params({ hideSupport: "1" })).hideSupport).toBe(
        true,
      );
      expect(parseEmbedConfig(params({ hideSupport: "true" })).hideSupport).toBe(
        true,
      );
      expect(parseEmbedConfig(params({ hideSupport: "on" })).hideSupport).toBe(
        true,
      );
      expect(parseEmbedConfig(params({})).hideSupport).toBe(false);
      expect(parseEmbedConfig(params({ hideSupport: "0" })).hideSupport).toBe(
        false,
      );
    });

    it("locks network when networks has a single entry", () => {
      const config = parseEmbedConfig(params({ networks: "base" }));
      expect(config.networkConfig.isLocked).toBe(true);
      expect(config.networkConfig.allowlist).toHaveLength(1);
    });

    it("rejects default token outside the allowlist", () => {
      const config = parseEmbedConfig(
        params({ token: "USDT", tokens: "cNGN" }),
      );
      expect(config.defaultToken).toBeNull();
    });
  });
});
