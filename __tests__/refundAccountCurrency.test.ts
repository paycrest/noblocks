import { normalizeRefundAccountCurrency } from "../app/utils";

describe("normalizeRefundAccountCurrency", () => {
  it("accepts NGN as a supported onramp fiat code", () => {
    expect(normalizeRefundAccountCurrency("ngn")).toBe("NGN");
    expect(normalizeRefundAccountCurrency(" NGN ")).toBe("NGN");
  });

  it("accepts KES when KES onramp is enabled", () => {
    if (process.env.NEXT_PUBLIC_KES_ONRAMP_ENABLED === "false") {
      expect(normalizeRefundAccountCurrency("KES")).toBeNull();
      return;
    }
    expect(normalizeRefundAccountCurrency(" KES ")).toBe("KES");
  });

  it("rejects unsupported or empty codes", () => {
    expect(normalizeRefundAccountCurrency("")).toBeNull();
    expect(normalizeRefundAccountCurrency("USD")).toBeNull();
    expect(normalizeRefundAccountCurrency(null)).toBeNull();
  });
});
