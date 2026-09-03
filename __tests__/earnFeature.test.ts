import {
  filterEarnActivityForChain,
  isEarnActionVisible,
  isEarnUiVisible,
  isEvmEarnFlow,
} from "../app/lib/earnFeature";

jest.mock("../app/lib/config", () => ({
  __esModule: true,
  default: {
    earnEnabled: true,
    evmEarnEnabled: true,
  },
}));

describe("earnFeature", () => {
  it("shows full earn UI on Starknet", () => {
    expect(isEarnUiVisible("Starknet")).toBe(true);
    expect(isEvmEarnFlow("Starknet")).toBe(false);
  });

  it("shows full earn UI on supported EVM chains when phase 2 is enabled", () => {
    expect(isEarnUiVisible("Base")).toBe(true);
    expect(isEvmEarnFlow("Base")).toBe(true);
  });

  it("shows earn action on Lisk (unavailable tooltip, not full UI)", () => {
    expect(isEarnActionVisible("Lisk")).toBe(true);
    expect(isEarnUiVisible("Lisk")).toBe(false);
  });

  it("scopes EVM-sourced activity to the source chain wallet view", () => {
    const entries = [
      { sourceChain: "Base", type: "deposit" as const },
      { sourceChain: "Polygon", type: "deposit" as const },
      { type: "deposit" as const },
    ];
    expect(filterEarnActivityForChain(entries, "Base")).toEqual([
      { sourceChain: "Base", type: "deposit" },
    ]);
    expect(
      filterEarnActivityForChain(entries, "Base", {
        includeLegacyUntaggedDeposits: true,
      }),
    ).toHaveLength(2);
    expect(filterEarnActivityForChain(entries, "Starknet")).toEqual([
      { type: "deposit" },
    ]);
  });
});
