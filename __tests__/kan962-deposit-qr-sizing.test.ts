/// <reference types="jest" />

import { getCompactQrLayout } from "../app/components/deposit/depositQrSizing";

const evm42 = "0x" + "a".repeat(40);
const evm43 = "0x" + "a".repeat(41);
const starknet66 = "0x" + "b".repeat(64);

// Independent M-level byte capacities, used to assert whole-module sizing.
const M_CAPACITY = [14, 26, 42, 62, 84, 106, 122, 152, 180, 213];
function moduleCountFor(bytes: number) {
  const index = M_CAPACITY.findIndex((capacity) => bytes <= capacity);
  const version = index === -1 ? M_CAPACITY.length : index + 1;
  return 17 + 4 * version;
}

describe("getCompactQrLayout", () => {
  it("keeps the Figma 116/8 layout for a 42-char EVM address", () => {
    expect(getCompactQrLayout(evm42)).toEqual({ size: 116, quietZone: 8 });
  });

  it("snaps a 43-char payload (v4, 33 modules) to 3px modules", () => {
    expect(getCompactQrLayout(evm43)).toEqual({ size: 99, quietZone: 16 });
  });

  it("snaps a 66-char Starknet-style address (v5, 37 modules) to 3px modules", () => {
    expect(getCompactQrLayout(starknet66)).toEqual({
      size: 111,
      quietZone: 10,
    });
  });

  it("picks the version from the error-correction capacity table", () => {
    // 42 bytes fits v3 at L/M but needs v4 at Q and v5 at H.
    expect(getCompactQrLayout(evm42, "L")).toEqual({ size: 116, quietZone: 8 });
    expect(getCompactQrLayout(evm42, "Q")).toEqual({ size: 99, quietZone: 16 });
    expect(getCompactQrLayout(evm42, "H")).toEqual({ size: 111, quietZone: 10 });
  });

  it("always fits the 132px inner box with whole-pixel modules", () => {
    const lengths = [
      1, 7, 8, 14, 15, 26, 27, 42, 43, 46, 47, 62, 63, 66, 84, 85, 106, 107,
      122, 123, 152, 153, 180, 181, 213, 214,
    ];

    for (const length of lengths) {
      const { size, quietZone } = getCompactQrLayout("a".repeat(length));
      const moduleCount = moduleCountFor(length);
      const modulePx = size / moduleCount;

      expect(Number.isInteger(modulePx)).toBe(true);
      expect(modulePx).toBeGreaterThanOrEqual(2);
      expect(Number.isInteger(quietZone)).toBe(true);
      expect(quietZone).toBeGreaterThanOrEqual(0);
      expect(size + 2 * quietZone).toBeLessThanOrEqual(132);
    }
  });
});
