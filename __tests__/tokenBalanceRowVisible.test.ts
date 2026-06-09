import { tokenBalanceRowVisible } from "../app/utils";

describe("tokenBalanceRowVisible", () => {
  it("shows CNGN on non-selected network when raw > 0 but USD slot is 0", () => {
    expect(
      tokenBalanceRowVisible({ CNGN: 100 }, "CNGN", 0, false),
    ).toBe(true);
  });

  it("hides zero row on non-selected network when no raw", () => {
    expect(tokenBalanceRowVisible(undefined, "USDC", 0, false)).toBe(false);
  });

  it("always includes rows on selected network", () => {
    expect(tokenBalanceRowVisible(undefined, "USDC", 0, true)).toBe(true);
  });
});
