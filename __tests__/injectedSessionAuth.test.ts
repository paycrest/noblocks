import {
  INJECTED_JWT_AUDIENCE,
  INJECTED_JWT_ISSUER,
  INJECTED_SESSION_TTL_SECONDS,
  SIWE_CLOCK_SKEW_MS,
  SIWE_MAX_AGE_MS,
  isSiweDomainAllowed,
  isSiweIssuedAtFresh,
  siweDomainMatchesOrigin,
  signInjectedSessionJwt,
  verifyInjectedSessionJwt,
} from "@/app/lib/injectedSessionAuth";

describe("isSiweIssuedAtFresh", () => {
  const now = 1_700_000_000_000;

  it("accepts a just-issued message", () => {
    expect(isSiweIssuedAtFresh(new Date(now - 1_000), now)).toBe(true);
  });

  it("accepts a message at the edge of the max age", () => {
    expect(isSiweIssuedAtFresh(new Date(now - SIWE_MAX_AGE_MS), now)).toBe(true);
  });

  it("rejects a stale message past the max age", () => {
    expect(isSiweIssuedAtFresh(new Date(now - SIWE_MAX_AGE_MS - 1), now)).toBe(
      false,
    );
  });

  it("accepts slight forward clock skew", () => {
    expect(isSiweIssuedAtFresh(new Date(now + SIWE_CLOCK_SKEW_MS), now)).toBe(
      true,
    );
  });

  it("rejects a future-dated message beyond skew", () => {
    expect(
      isSiweIssuedAtFresh(new Date(now + SIWE_CLOCK_SKEW_MS + 1), now),
    ).toBe(false);
  });

  it("rejects an invalid date", () => {
    expect(isSiweIssuedAtFresh(new Date("not-a-date"), now)).toBe(false);
  });
});

describe("siweDomainMatchesOrigin", () => {
  it("matches an exact https host", () => {
    expect(siweDomainMatchesOrigin("partner.com", "https://partner.com")).toBe(
      true,
    );
  });

  it("matches case-insensitively", () => {
    expect(siweDomainMatchesOrigin("Partner.COM", "https://partner.com")).toBe(
      true,
    );
  });

  it("matches localhost with port (EIP-4361 domain is host:port)", () => {
    expect(
      siweDomainMatchesOrigin("localhost:3000", "http://localhost:3000"),
    ).toBe(true);
  });

  it("rejects a different host", () => {
    expect(siweDomainMatchesOrigin("evil.com", "https://partner.com")).toBe(
      false,
    );
  });

  it("rejects a superstring host (no substring matching)", () => {
    expect(
      siweDomainMatchesOrigin("notpartner.com", "https://partner.com"),
    ).toBe(false);
    expect(
      siweDomainMatchesOrigin("partner.com.evil.com", "https://partner.com"),
    ).toBe(false);
  });

  it("wildcard matches subdomains", () => {
    expect(
      siweDomainMatchesOrigin("app.partner.com", "https://*.partner.com"),
    ).toBe(true);
    expect(
      siweDomainMatchesOrigin("a.b.partner.com", "https://*.partner.com"),
    ).toBe(true);
  });

  it("wildcard does NOT match the bare apex", () => {
    expect(
      siweDomainMatchesOrigin("partner.com", "https://*.partner.com"),
    ).toBe(false);
  });

  it("wildcard does NOT match a suffix-similar stranger", () => {
    expect(
      siweDomainMatchesOrigin("evilpartner.com", "https://*.partner.com"),
    ).toBe(false);
  });

  it("rejects empty inputs", () => {
    expect(siweDomainMatchesOrigin("", "https://partner.com")).toBe(false);
    expect(siweDomainMatchesOrigin("partner.com", "")).toBe(false);
  });
});

describe("isSiweDomainAllowed", () => {
  const allowlist = [
    "https://noblocks.xyz",
    "https://*.partner.com",
    "http://localhost:3000",
  ];

  it("accepts any allowlisted origin", () => {
    expect(isSiweDomainAllowed("noblocks.xyz", allowlist)).toBe(true);
    expect(isSiweDomainAllowed("app.partner.com", allowlist)).toBe(true);
    expect(isSiweDomainAllowed("localhost:3000", allowlist)).toBe(true);
  });

  it("rejects strangers and the empty allowlist", () => {
    expect(isSiweDomainAllowed("evil.com", allowlist)).toBe(false);
    expect(isSiweDomainAllowed("noblocks.xyz", [])).toBe(false);
  });
});

describe("injected session JWT round-trip", () => {
  const ADDRESS = "0xAbCd000000000000000000000000000000001234";
  const OLD_ENV = process.env.INJECTED_SESSION_SECRET;

  beforeEach(() => {
    process.env.INJECTED_SESSION_SECRET =
      "test-secret-test-secret-test-secret!";
  });
  afterEach(() => {
    process.env.INJECTED_SESSION_SECRET = OLD_ENV;
  });

  it("mints a token that verifies back to the lowercased address", async () => {
    const { token, expiresAt } = await signInjectedSessionJwt(ADDRESS);
    expect(expiresAt).toBeGreaterThan(Date.now());
    expect(expiresAt).toBeLessThanOrEqual(
      Date.now() + INJECTED_SESSION_TTL_SECONDS * 1000 + 1_000,
    );
    await expect(verifyInjectedSessionJwt(token)).resolves.toBe(
      ADDRESS.toLowerCase(),
    );
  });

  it("rejects a tampered token", async () => {
    const { token } = await signInjectedSessionJwt(ADDRESS);
    const tampered = token.slice(0, -2) + "aa";
    await expect(verifyInjectedSessionJwt(tampered)).resolves.toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const { token } = await signInjectedSessionJwt(ADDRESS);
    process.env.INJECTED_SESSION_SECRET =
      "another-secret-another-secret-another!";
    await expect(verifyInjectedSessionJwt(token)).resolves.toBeNull();
  });

  it("rejects garbage tokens without throwing", async () => {
    await expect(verifyInjectedSessionJwt("not-a-jwt")).resolves.toBeNull();
    await expect(verifyInjectedSessionJwt("")).resolves.toBeNull();
  });

  it("refuses to mint or verify when the secret is missing/short", async () => {
    process.env.INJECTED_SESSION_SECRET = "short";
    await expect(signInjectedSessionJwt(ADDRESS)).rejects.toThrow(
      /INJECTED_SESSION_SECRET/,
    );
    await expect(verifyInjectedSessionJwt("whatever")).resolves.toBeNull();
  });

  it("uses the expected issuer/audience constants", () => {
    expect(INJECTED_JWT_ISSUER).toBe("noblocks");
    expect(INJECTED_JWT_AUDIENCE).toBe("injected-session");
  });
});
