import {
  INJECTED_USER_ID_PREFIX,
  isInjectedUserId,
} from "@/app/lib/injected-identity";

describe("isInjectedUserId", () => {
  it("recognizes the subject middleware mints for injected sessions", () => {
    expect(
      isInjectedUserId("injected-0x1234567890abcdef1234567890abcdef12345678"),
    ).toBe(true);
  });

  it("rejects Privy subjects", () => {
    expect(isInjectedUserId("did:privy:clx0000000000000000000000")).toBe(false);
  });

  it("rejects missing or empty ids without throwing", () => {
    expect(isInjectedUserId(null)).toBe(false);
    expect(isInjectedUserId(undefined)).toBe(false);
    expect(isInjectedUserId("")).toBe(false);
  });

  it("requires the prefix at the start, not merely somewhere in the id", () => {
    expect(isInjectedUserId("did:privy:injected-0xabc")).toBe(false);
  });

  it("exports the prefix middleware builds the subject from", () => {
    expect(INJECTED_USER_ID_PREFIX).toBe("injected-");
    expect(isInjectedUserId(`${INJECTED_USER_ID_PREFIX}0xabc`)).toBe(true);
  });
});
