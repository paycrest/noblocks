import {
  isPooledAllowance,
  monthlyLimitReachedMessage,
  sharedAllowanceNote,
} from "../app/lib/kyc-limit-copy";

// The copy shipped before identity pooling. Anyone whose allowance is not shared must
// keep seeing exactly this — pooling should be invisible to the unaffected majority.
const LEGACY_MESSAGE =
  "Monthly transaction limit of $5,000 reached. Upgrade your verification tier to continue.";

describe("isPooledAllowance", () => {
  it("treats a single wallet, missing, and zero counts as not pooled", () => {
    expect(isPooledAllowance(1)).toBe(false);
    expect(isPooledAllowance(0)).toBe(false);
    expect(isPooledAllowance(undefined)).toBe(false);
  });

  it("is pooled from two wallets up", () => {
    expect(isPooledAllowance(2)).toBe(true);
    expect(isPooledAllowance(7)).toBe(true);
  });
});

describe("sharedAllowanceNote", () => {
  it("is empty when the allowance is not shared", () => {
    expect(sharedAllowanceNote(1)).toBe("");
    expect(sharedAllowanceNote(undefined)).toBe("");
  });

  it("names the wallet count when shared", () => {
    expect(sharedAllowanceNote(3)).toBe("shared across your 3 wallets");
  });
});

describe("monthlyLimitReachedMessage", () => {
  it("returns the pre-pooling copy verbatim for a single wallet", () => {
    expect(monthlyLimitReachedMessage(5000, 1)).toBe(LEGACY_MESSAGE);
  });

  it("returns the pre-pooling copy when the count is missing", () => {
    expect(monthlyLimitReachedMessage(5000, undefined)).toBe(LEGACY_MESSAGE);
  });

  it("names the linked wallets when the allowance is shared", () => {
    expect(monthlyLimitReachedMessage(5000, 3)).toBe(
      "Monthly transaction limit of $5,000 reached across your 3 linked wallets. Upgrade your verification tier to continue.",
    );
  });

  it("keeps thousands separators on the limit", () => {
    expect(monthlyLimitReachedMessage(1234567, 1)).toContain("$1,234,567");
    expect(monthlyLimitReachedMessage(1234567, 2)).toContain("$1,234,567");
  });
});
