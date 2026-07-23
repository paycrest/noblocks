import {
  hasEmbedNetworkLockParams,
  parseChainIdParam,
  resolveNetworkByChainId,
  resolveNetworkByName,
  resolveNetworkFromEmbedParams,
} from "../app/lib/embed-network";

function params(entries: Record<string, string | null>) {
  return {
    get: (key: string) =>
      Object.prototype.hasOwnProperty.call(entries, key)
        ? entries[key]
        : null,
  };
}

describe("embed-network", () => {
  describe("parseChainIdParam", () => {
    it("parses decimal and hex chainIds", () => {
      expect(parseChainIdParam("8453")).toBe(8453);
      expect(parseChainIdParam("0x2105")).toBe(8453);
      expect(parseChainIdParam("0X2105")).toBe(8453);
    });

    it("returns null for missing or invalid values", () => {
      expect(parseChainIdParam(null)).toBeNull();
      expect(parseChainIdParam("")).toBeNull();
      expect(parseChainIdParam("  ")).toBeNull();
      expect(parseChainIdParam("abc")).toBeNull();
      expect(parseChainIdParam("84.53")).toBeNull();
    });
  });

  describe("resolveNetworkByChainId", () => {
    it("resolves Base by numeric and hex id", () => {
      expect(resolveNetworkByChainId(8453)?.chain.name).toBe("Base");
      expect(resolveNetworkByChainId("0x2105")?.chain.name).toBe("Base");
    });

    it("returns null for unknown EVM ids", () => {
      expect(resolveNetworkByChainId(999999)).toBeNull();
    });
  });

  describe("resolveNetworkByName", () => {
    it("matches case-insensitively", () => {
      expect(resolveNetworkByName("base")?.chain.name).toBe("Base");
      expect(resolveNetworkByName("Starknet")?.chain.name).toBe("Starknet");
    });

    it("returns null for unknown names", () => {
      expect(resolveNetworkByName("NotAChain")).toBeNull();
    });
  });

  describe("resolveNetworkFromEmbedParams", () => {
    it("prefers chainId over network when both are set", () => {
      const network = resolveNetworkFromEmbedParams(
        params({ chainId: "8453", network: "Arbitrum One" }),
      );
      expect(network?.chain.name).toBe("Base");
    });

    it("falls back to network name when chainId is absent", () => {
      const network = resolveNetworkFromEmbedParams(
        params({ network: "Starknet" }),
      );
      expect(network?.chain.name).toBe("Starknet");
    });

    it("returns null when chainId is present but invalid", () => {
      expect(
        resolveNetworkFromEmbedParams(params({ chainId: "999999" })),
      ).toBeNull();
    });
  });

  describe("hasEmbedNetworkLockParams", () => {
    it("is true when either param key is present", () => {
      expect(hasEmbedNetworkLockParams(params({ chainId: "8453" }))).toBe(
        true,
      );
      expect(hasEmbedNetworkLockParams(params({ network: "Base" }))).toBe(
        true,
      );
      expect(hasEmbedNetworkLockParams(params({ chainId: "" }))).toBe(true);
      expect(hasEmbedNetworkLockParams(params({}))).toBe(false);
    });
  });
});
