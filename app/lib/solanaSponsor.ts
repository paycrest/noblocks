/**
 * Server-only Solana sponsor (fee payer) wallet.
 * Mirrors SPONSOR_EVM_WALLET_PRIVATE_KEY: Privy signs as depositor; Noblocks
 * sponsor co-signs as fee payer and broadcasts create_order transactions.
 */
import bs58 from "bs58";

const SECRET_KEY_LENGTH = 64;

function sponsorKeyEnvRaw(): string {
  return (
    process.env.SPONSOR_SOLANA_WALLET_PRIVATE_KEY ??
    process.env.SPONSOR_SOLANA_WALLET_SECRET ??
    ""
  ).trim();
}

function parseSecretKeyBytes(raw: string): Uint8Array {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error(
      "SPONSOR_SOLANA_WALLET_PRIVATE_KEY is required for Solana sponsored transactions",
    );
  }

  if (trimmed.startsWith("[")) {
    const arr = JSON.parse(trimmed) as number[];
    if (!Array.isArray(arr) || arr.length !== SECRET_KEY_LENGTH) {
      throw new Error(
        `SPONSOR_SOLANA_WALLET_PRIVATE_KEY JSON must be a ${SECRET_KEY_LENGTH}-byte array`,
      );
    }
    return new Uint8Array(arr);
  }

  const decoded = bs58.decode(trimmed);
  if (decoded.length !== SECRET_KEY_LENGTH) {
    throw new Error(
      `SPONSOR_SOLANA_WALLET_PRIVATE_KEY base58 must decode to ${SECRET_KEY_LENGTH} bytes`,
    );
  }
  return decoded;
}

/** True when server env has a sponsor secret configured. */
export function isSolanaSponsorConfigured(): boolean {
  return sponsorKeyEnvRaw().length > 0;
}

/** 64-byte secret key for @solana/web3.js Keypair signing. */
export function getSolanaSponsorSecretKeyBytes(): Uint8Array {
  return parseSecretKeyBytes(sponsorKeyEnvRaw());
}
