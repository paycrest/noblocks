import "server-only";
import {
  createCipheriv,
  createPublicKey,
  constants,
  publicEncrypt,
  randomBytes,
  type KeyObject,
} from "crypto";
import axios from "axios";
import config from "./config";

const MESSAGE_HASH_MAX_SIZE = 500;

export type SolanaOnChainRecipient = {
  accountIdentifier: string;
  accountName: string;
  institution: string;
  providerId?: string;
  memo?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Load aggregator RSA pubkey for hybrid encryption.
 * Staging returns PEM labeled "RSA PUBLIC KEY" but the DER body is SPKI;
 * Node fails with "asn1 wrong tag" if we trust the PEM header alone.
 */
function loadAggregatorPublicKey(publicKeyPEM: string): KeyObject {
  const trimmed = publicKeyPEM.trim();
  const match = trimmed.match(
    /-----BEGIN(?: RSA)? PUBLIC KEY-----\s*([\s\S]+?)\s*-----END(?: RSA)? PUBLIC KEY-----/,
  );
  if (!match) {
    throw new Error("Invalid aggregator public key PEM");
  }

  const der = Buffer.from(match[1].replace(/\s/g, ""), "base64");
  try {
    return createPublicKey({ key: der, format: "der", type: "spki" });
  } catch {
    return createPublicKey({ key: der, format: "der", type: "pkcs1" });
  }
}

/** Hybrid AES-GCM + RSA-PKCS1 encryption (matches aggregator/utils/crypto). */
export function encryptHybridJSON(
  data: unknown,
  publicKeyPEM: string,
  maxSize = MESSAGE_HASH_MAX_SIZE,
): Buffer {
  const plaintext = Buffer.from(JSON.stringify(data), "utf8");
  if (plaintext.length > maxSize) {
    throw new Error(
      `Payload too large: ${plaintext.length} bytes (max ${maxSize})`,
    );
  }

  const aesKey = randomBytes(32);
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", aesKey, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const aesCiphertext = Buffer.concat([nonce, encrypted, authTag]);

  const publicKey = loadAggregatorPublicKey(publicKeyPEM);
  const encryptedKey = publicEncrypt(
    {
      key: publicKey,
      padding: constants.RSA_PKCS1_PADDING,
    },
    aesKey,
  );

  const result = Buffer.alloc(4 + encryptedKey.length + aesCiphertext.length);
  result.writeUInt32BE(encryptedKey.length, 0);
  encryptedKey.copy(result, 4);
  aesCiphertext.copy(result, 4 + encryptedKey.length);
  return result;
}

let cachedAggregatorPublicKeyPem: string | null = null;
let cachedAggregatorPublicKeyAt = 0;
const AGGREGATOR_PUBKEY_CACHE_MS = 10 * 60 * 1000;

async function fetchAggregatorPublicKeyPEM(): Promise<string> {
  const now = Date.now();
  if (
    cachedAggregatorPublicKeyPem &&
    now - cachedAggregatorPublicKeyAt < AGGREGATOR_PUBKEY_CACHE_MS
  ) {
    return cachedAggregatorPublicKeyPem;
  }

  const url = `${config.aggregatorUrl.replace(/\/$/, "")}/pubkey`;
  const response = await axios.get<{ data?: string }>(url);
  const pem = response.data?.data?.trim();
  if (!pem) {
    throw new Error("Empty aggregator public key");
  }
  cachedAggregatorPublicKeyPem = pem;
  cachedAggregatorPublicKeyAt = now;
  return pem;
}

/** Encrypt off-ramp recipient for Solana gateway create_order instruction bytes. */
export async function encryptSolanaMessageHash(
  recipient: SolanaOnChainRecipient,
): Promise<{ raw: Buffer; base64: string }> {
  const fields = {
    Nonce: "",
    AccountIdentifier: recipient.accountIdentifier,
    AccountName: recipient.accountName,
    Institution: recipient.institution,
    ProviderID: recipient.providerId ?? "",
    Memo: recipient.memo ?? "",
    Metadata: recipient.metadata ?? {},
  };
  fields.Nonce = randomBytes(12).toString("base64");

  const publicKeyPEM = await fetchAggregatorPublicKeyPEM();
  const raw = encryptHybridJSON(fields, publicKeyPEM);
  return { raw, base64: raw.toString("base64") };
}
