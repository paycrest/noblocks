jest.mock("../app/lib/config", () => ({
  __esModule: true,
  default: {
    kesOnrampEnabled: true,
  },
}));

import config from "../app/lib/config";
import { normalizeRefundAccountCurrency } from "../app/utils";

const mockConfig = config as { kesOnrampEnabled: boolean };

describe("normalizeRefundAccountCurrency", () => {
  afterEach(() => {
    mockConfig.kesOnrampEnabled = true;
  });

  it("accepts NGN as a supported onramp fiat code", () => {
    expect(normalizeRefundAccountCurrency("ngn")).toBe("NGN");
    expect(normalizeRefundAccountCurrency(" NGN ")).toBe("NGN");
  });

  it("accepts KES when KES onramp is enabled", () => {
    mockConfig.kesOnrampEnabled = true;
    expect(normalizeRefundAccountCurrency(" KES ")).toBe("KES");
  });

  it("rejects KES when KES onramp is disabled", () => {
    mockConfig.kesOnrampEnabled = false;
    expect(normalizeRefundAccountCurrency("KES")).toBeNull();
  });

  it("rejects unsupported or empty codes", () => {
    expect(normalizeRefundAccountCurrency("")).toBeNull();
    expect(normalizeRefundAccountCurrency("USD")).toBeNull();
    expect(normalizeRefundAccountCurrency(null)).toBeNull();
  });
});
