import { keccak256, stringToBytes } from "viem";

/**
 * Per Moralis Webhook Security: `sha3(JSON.stringify(body) + secret)` (Web3)
 * and compare to `x-signature`. See: streams → webhook security in Moralis docs.
 */
export function moralisExpectedSignature(
  rawBody: string,
  secret: string,
): `0x${string}` {
  let stringToHash: string;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    stringToHash = JSON.stringify(parsed) + secret;
  } catch {
    stringToHash = rawBody + secret;
  }
  return keccak256(stringToBytes(stringToHash));
}

function strip0x(s: string): string {
  const t = s.trim().toLowerCase();
  return t.startsWith("0x") ? t.slice(2) : t;
}

export function verifyMoralisSignature(
  rawBody: string,
  xSignature: string | null | undefined,
  secret: string,
): boolean {
  if (!xSignature) return false;
  const expected = moralisExpectedSignature(rawBody, secret);
  const a = strip0x(xSignature);
  const b = strip0x(expected);
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}
