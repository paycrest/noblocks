import {
  CallData,
  CairoCustomEnum,
  CairoOption,
  CairoOptionVariant,
  ec,
  hash,
} from "starknet";
import { STARKNET_READY_ACCOUNT_CLASSHASH } from "./config";

/**
 * Normalize plaintext from Privy HPKE export so it matches Starknet tooling (e.g. Argent, Braavos).
 * Handles BOM/whitespace, optional JSON envelope, missing 0x prefix.
 */
export function normalizePrivyStarknetExportedKey(plain: string): string {
  let s = plain.trim();
  if (s.charCodeAt(0) === 0xfeff) {
    s = s.slice(1).trim();
  }
  if (s.startsWith("{")) {
    try {
      const j = JSON.parse(s) as Record<string, unknown>;
      const pk =
        (typeof j.private_key === "string" && j.private_key) ||
        (typeof j.privateKey === "string" && j.privateKey);
      if (pk) s = String(pk);
    } catch {
      /* keep original */
    }
  }
  s = s.trim().replace(/^["']|["']$/g, "");
  if (/^[0-9a-fA-F]+$/.test(s) && !s.startsWith("0x")) {
    s = `0x${s}`;
  }
  return s;
}

/** Compare Stark hex felts (handles leading-zero / casing differences). */
export function starkHexFeltEq(a: string, b: string): boolean {
  try {
    return BigInt(a) === BigInt(b);
  } catch {
    return (
      a.replace(/^0x/i, "").toLowerCase() ===
      b.replace(/^0x/i, "").toLowerCase()
    );
  }
}

/** Starknet signer pubkey (x) from private key — matches Ready calldata `pubkey`. */
export function starkPubKeyFromPrivateKey(normalizedPrivateKey: string): string {
  return ec.starkCurve.getStarkKey(normalizedPrivateKey);
}

function buildReadyConstructor(publicKey: string) {
  const signerEnum = new CairoCustomEnum({ Starknet: { pubkey: publicKey } });
  const guardian = new CairoOption(CairoOptionVariant.None);
  return CallData.compile({ owner: signerEnum, guardian });
}

/** Counterfactual Ready account address (same formula as `computeReadyAddress` in starknet.ts). */
export function deriveReadyAddressFromPrivateKey(
  normalizedPrivateKey: string,
): string {
  const starkPub = starkPubKeyFromPrivateKey(normalizedPrivateKey);
  const calldata = buildReadyConstructor(starkPub);
  return hash.calculateContractAddressFromHash(
    starkPub,
    STARKNET_READY_ACCOUNT_CLASSHASH,
    calldata,
    0,
  );
}
