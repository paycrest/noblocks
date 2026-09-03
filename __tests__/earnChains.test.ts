import {
  EVM_EARN_SOURCE_CHAINS,
  earnBridgeConfirmationCopy,
  isEvmEarnSourceChain,
  layerswapSourceNetwork,
} from "../app/lib/earnChains";

describe("earnChains", () => {
  it("lists seven EVM source chains", () => {
    expect(EVM_EARN_SOURCE_CHAINS).toHaveLength(7);
    expect(EVM_EARN_SOURCE_CHAINS).toContain("Base");
    expect(EVM_EARN_SOURCE_CHAINS).toContain("Scroll");
  });

  it("maps noblocks network names to LayerSwap identifiers", () => {
    expect(layerswapSourceNetwork("Base")).toBe("BASE_MAINNET");
    expect(layerswapSourceNetwork("BNB Smart Chain")).toBe("BSC_MAINNET");
    expect(layerswapSourceNetwork("Lisk")).toBeUndefined();
  });

  it("recognizes supported source chains", () => {
    expect(isEvmEarnSourceChain("Polygon")).toBe(true);
    expect(isEvmEarnSourceChain("Starknet")).toBe(false);
  });

  it("builds bridge confirmation copy with ETA fallback", () => {
    expect(earnBridgeConfirmationCopy()).toContain("~15 min");
    expect(earnBridgeConfirmationCopy("~8 min")).toContain("~8 min");
  });
});
