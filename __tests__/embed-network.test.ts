import {
  hasEmbedNetworkLockParams,
  hasEmbedNetworksAllowlistParam,
  parseChainIdParam,
  parseCsvParam,
  parseEmbedNetworkConfig,
  resolveNetworkByChainId,
  resolveNetworkByName,
  resolveNetworkBySlug,
  resolveNetworkFromEmbedParams,
  resolveNetworksAllowlist,
  networkSlug,
  isNetworkInAllowlist,
} from "../app/lib/embed-network";
import { networks } from "../app/mocks";

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

  describe("resolveNetworkBySlug", () => {
    it("matches rate-fetch slugs and display names", () => {
      expect(resolveNetworkBySlug("base")?.chain.name).toBe("Base");
      expect(resolveNetworkBySlug("arbitrum-one")?.chain.name).toBe(
        "Arbitrum One",
      );
      expect(resolveNetworkBySlug("starknet")?.chain.name).toBe("Starknet");
      expect(resolveNetworkBySlug("Starknet")?.chain.name).toBe("Starknet");
    });

    it("accepts legacy starknet-mainnet alias", () => {
      expect(resolveNetworkBySlug("starknet-mainnet")?.chain.name).toBe(
        "Starknet",
      );
    });

    it("returns null for unknown slugs", () => {
      expect(resolveNetworkBySlug("NotAChain")).toBeNull();
    });
  });

  describe("resolveNetworkByName", () => {
    it("matches case-insensitively via slug resolve", () => {
      expect(resolveNetworkByName("base")?.chain.name).toBe("Base");
      expect(resolveNetworkByName("Starknet")?.chain.name).toBe("Starknet");
    });
  });

  describe("networkSlug", () => {
    it("slugifies Starknet to starknet (not starknet-mainnet)", () => {
      const starknet = networks.find((n) => n.chain.name === "Starknet");
      expect(starknet).toBeDefined();
      expect(networkSlug(starknet!)).toBe("starknet");
      expect(starknet!.chain.network).toBe("starknet");
    });
  });

  describe("parseCsvParam / resolveNetworksAllowlist", () => {
    it("parses CSV and drops unknown slugs", () => {
      expect(parseCsvParam("base, arbitrum-one")).toEqual([
        "base",
        "arbitrum-one",
      ]);
      const list = resolveNetworksAllowlist("base,nope,starknet");
      expect(list.map((n) => n.chain.name)).toEqual(["Base", "Starknet"]);
    });
  });

  describe("isNetworkInAllowlist", () => {
    it("allows all when allowlist is null", () => {
      expect(isNetworkInAllowlist(networks[0], null)).toBe(true);
    });

    it("checks membership by chain name", () => {
      const base = resolveNetworkBySlug("base")!;
      const arb = resolveNetworkBySlug("arbitrum-one")!;
      expect(isNetworkInAllowlist(base, [base])).toBe(true);
      expect(isNetworkInAllowlist(arb, [base])).toBe(false);
    });
  });

  describe("resolveNetworkFromEmbedParams", () => {
    it("prefers chainId over network when both are set", () => {
      const network = resolveNetworkFromEmbedParams(
        params({ chainId: "8453", network: "Arbitrum One" }),
      );
      expect(network?.chain.name).toBe("Base");
    });

    it("falls back to network slug when chainId is absent", () => {
      const network = resolveNetworkFromEmbedParams(
        params({ network: "starknet" }),
      );
      expect(network?.chain.name).toBe("Starknet");
    });

    it("returns null when chainId is present but invalid", () => {
      expect(
        resolveNetworkFromEmbedParams(params({ chainId: "999999" })),
      ).toBeNull();
    });
  });

  describe("parseEmbedNetworkConfig", () => {
    it("locks on legacy network/chainId without networks=", () => {
      const config = parseEmbedNetworkConfig(params({ chainId: "8453" }));
      expect(config.isLocked).toBe(true);
      expect(config.allowlist).toHaveLength(1);
      expect(config.defaultNetwork?.chain.name).toBe("Base");
      expect(config.unresolved).toBe(false);
    });

    it("uses networks CSV as a multi-chain allowlist", () => {
      const config = parseEmbedNetworkConfig(
        params({ networks: "base,arbitrum-one", network: "arbitrum-one" }),
      );
      expect(config.isLocked).toBe(false);
      expect(config.allowlist?.map((n) => n.chain.name)).toEqual([
        "Base",
        "Arbitrum One",
      ]);
      expect(config.defaultNetwork?.chain.name).toBe("Arbitrum One");
    });

    it("is unrestricted when no network params are set", () => {
      const config = parseEmbedNetworkConfig(params({}));
      expect(config.allowlist).toBeNull();
      expect(config.isLocked).toBe(false);
    });

    it("uses chainIds CSV as a multi-chain allowlist", () => {
      const config = parseEmbedNetworkConfig(
        params({ chainIds: "8453,42161" }),
      );
      expect(config.isLocked).toBe(false);
      expect(config.allowlist?.map((n) => n.chain.name)).toEqual([
        "Base",
        "Arbitrum One",
      ]);
      expect(config.defaultNetwork?.chain.name).toBe("Base");
    });

    it("locks on a single-entry chainIds allowlist", () => {
      const config = parseEmbedNetworkConfig(params({ chainIds: "0x2105" }));
      expect(config.isLocked).toBe(true);
      expect(config.allowlist?.map((n) => n.chain.name)).toEqual(["Base"]);
      expect(config.defaultNetwork?.chain.name).toBe("Base");
    });

    it("unions networks and chainIds, deduping by chain", () => {
      const config = parseEmbedNetworkConfig(
        params({ networks: "base", chainIds: "42161,8453" }),
      );
      expect(config.allowlist?.map((n) => n.chain.name)).toEqual([
        "Base",
        "Arbitrum One",
      ]);
      expect(config.isLocked).toBe(false);
    });

    it("drops unknown chainIds and keeps the valid remainder", () => {
      const config = parseEmbedNetworkConfig(
        params({ chainIds: "999999,8453" }),
      );
      expect(config.allowlist?.map((n) => n.chain.name)).toEqual(["Base"]);
      expect(config.isLocked).toBe(true);
    });

    it("marks all-invalid chainIds unresolved, matching networks= behavior", () => {
      const config = parseEmbedNetworkConfig(params({ chainIds: "999999" }));
      expect(config.allowlist).toEqual([]);
      expect(config.unresolved).toBe(true);
      expect(config.isLocked).toBe(false);
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

  describe("hasEmbedNetworksAllowlistParam", () => {
    it("detects the networks and chainIds keys", () => {
      expect(hasEmbedNetworksAllowlistParam(params({ networks: "base" }))).toBe(
        true,
      );
      expect(
        hasEmbedNetworksAllowlistParam(params({ chainIds: "8453" })),
      ).toBe(true);
      expect(hasEmbedNetworksAllowlistParam(params({}))).toBe(false);
    });
  });
});
