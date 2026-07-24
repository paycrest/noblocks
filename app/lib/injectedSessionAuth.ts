import { SignJWT, jwtVerify } from "jose";

/**
 * Injected-wallet session auth (SIWE / EIP-4361).
 *
 * A connected wallet proves it can sign transactions, but a client-supplied
 * `x-injected-wallet: <address>` header proves nothing — anyone can claim any
 * address. Instead, the wallet signs a short-lived SIWE challenge once;
 * POST /api/auth/injected/verify checks the signature (EOA + EIP-1271 via
 * ERC-6492) and mints an HS256 session JWT. The middleware then verifies that
 * JWT statelessly (`x-injected-token`) — mirroring the Privy JWT branch — and
 * derives the wallet address from the token's `sub`, never from a raw header.
 *
 * This module is edge-safe (jose only, no Node/Supabase imports) so the
 * middleware can share the verify path with the Node route.
 */

export const INJECTED_JWT_ISSUER = "noblocks";
export const INJECTED_JWT_AUDIENCE = "injected-session";
/** 1 hour — matches Privy's access-token lifetime. No refresh token: expiry costs one re-sign. */
export const INJECTED_SESSION_TTL_SECONDS = 60 * 60;
/** A SIWE challenge is only good for 5 minutes after issuedAt (stateless anti-replay bound). */
export const SIWE_MAX_AGE_MS = 5 * 60_000;
/** Tolerated forward clock skew on issuedAt. */
export const SIWE_CLOCK_SKEW_MS = 30_000;

function getSecretKey(): Uint8Array {
  const secret = process.env.INJECTED_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "INJECTED_SESSION_SECRET must be set (32+ chars; generate with `openssl rand -hex 32`)",
    );
  }
  // Re-wrap in the ambient realm's Uint8Array: under jest/jsdom the polyfilled
  // Node TextEncoder yields a foreign-realm array that fails jose's instanceof.
  return new Uint8Array(new TextEncoder().encode(secret));
}

/** True when `issuedAt` is within [now - SIWE_MAX_AGE_MS, now + SIWE_CLOCK_SKEW_MS]. */
export function isSiweIssuedAtFresh(issuedAt: Date, now: number): boolean {
  const t = issuedAt.getTime();
  if (Number.isNaN(t)) return false;
  return t >= now - SIWE_MAX_AGE_MS && t <= now + SIWE_CLOCK_SKEW_MS;
}

/**
 * Match an EIP-4361 `domain` (authority: host[:port], scheme-less) against one
 * allowlisted origin pattern (`https://partner.com`, `https://*.partner.com`,
 * `http://localhost:3000`). Wildcards cover subdomains only — `*.partner.com`
 * matches `app.partner.com`, never bare `partner.com` (list both if needed).
 * Mirrors EMBED_ORIGIN_RE semantics in middleware.ts.
 */
export function siweDomainMatchesOrigin(
  domain: string,
  originPattern: string,
): boolean {
  if (!domain || !originPattern) return false;
  const patternHost = originPattern.replace(/^https?:\/\//, "");
  if (!patternHost) return false;
  const normalizedDomain = domain.toLowerCase();
  if (patternHost.startsWith("*.")) {
    const base = patternHost.slice(2).toLowerCase();
    return (
      normalizedDomain.endsWith(`.${base}`) &&
      normalizedDomain.length > base.length + 1
    );
  }
  return normalizedDomain === patternHost.toLowerCase();
}

/** True when the SIWE domain matches any allowlisted origin. */
export function isSiweDomainAllowed(
  domain: string,
  allowedOrigins: string[],
): boolean {
  return allowedOrigins.some((origin) =>
    siweDomainMatchesOrigin(domain, origin),
  );
}

/** Mint the injected-wallet session JWT for a verified address. */
export async function signInjectedSessionJwt(
  address: string,
): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = Date.now() + INJECTED_SESSION_TTL_SECONDS * 1000;
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(address.toLowerCase())
    .setIssuer(INJECTED_JWT_ISSUER)
    .setAudience(INJECTED_JWT_AUDIENCE)
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt / 1000))
    .sign(getSecretKey());
  return { token, expiresAt };
}

/**
 * Verify an injected-wallet session JWT. Returns the wallet address (lowercase)
 * or null on any failure (bad signature, expired, wrong issuer/audience,
 * missing/short secret).
 */
export async function verifyInjectedSessionJwt(
  token: string,
): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      issuer: INJECTED_JWT_ISSUER,
      audience: INJECTED_JWT_AUDIENCE,
      algorithms: ["HS256"],
    });
    const sub = payload.sub;
    if (!sub || !/^0x[0-9a-fA-F]{40}$/.test(sub)) return null;
    return sub.toLowerCase();
  } catch {
    return null;
  }
}
