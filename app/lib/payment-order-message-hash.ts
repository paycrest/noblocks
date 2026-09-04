import "server-only";
import type { NextRequest } from "next/server";
import {
  constants,
  createPublicKey,
  publicEncrypt,
  randomBytes,
  type KeyObject,
} from "crypto";
import config from "./config";
import { getAggregatorSenderApiKey } from "./server-config";
import {
  trackApiRequest,
  trackApiResponse,
  trackApiError,
} from "./server-analytics";
import { KES_MPESA_INSTITUTION_CODE } from "../utils";
import { fetchAggregatorPublicKey } from "../api/aggregator";
import type { KesMpesaChannel } from "../types";

/**
 * Server-side construction of the encrypted offramp recipient payload.
 *
 * Offramp orders are created on-chain by the user's wallet, and the aggregator
 * learns which sender profile owns the order only from `metadata.apiKey`
 * inside the RSA-encrypted recipient blob passed as `messageHash`. Building
 * that blob here — rather than in the browser — is what keeps the sender API
 * key out of the client bundle. The payload shape is unchanged from the
 * previous client-side implementation, so the aggregator needs no change.
 *
 * Handler follows app/lib/refund-account-api.ts: a minimal request surface in,
 * `{ status, body }` out, so it is unit-testable without NextRequest.
 */

export const MESSAGE_HASH_ENDPOINT = "/api/v1/payment-orders/message-hash";

const KES_CHANNELS: readonly string[] = ["Mobile", "Till", "Paybill"];
const MAX_ACCOUNT_IDENTIFIER = 32;
const MAX_ACCOUNT_NAME = 100;
/** Mirrors the memo input's maxLength in TransactionForm. */
const MAX_MEMO = 25;
/** Comes straight from the `?provider=` query string — bounded, not trusted. */
const MAX_PROVIDER_ID = 64;
const INSTITUTION_RE = /^[A-Za-z0-9_.-]{2,32}$/;
const PROVIDER_ID_RE = /^[\w-]+$/;
const BUSINESS_NUMBER_RE = /^\d{1,12}$/;
/** PKCS#1 v1.5 EME: 0x00 0x02, at least 8 non-zero padding bytes, 0x00. */
const PKCS1_V15_OVERHEAD_BYTES = 11;

export type MessageHashInput = {
  accountIdentifier: string;
  accountName: string;
  institution: string;
  memo?: string;
  providerId?: string;
  kesChannel?: KesMpesaChannel;
  businessNumber?: string;
};

/** Exactly the shape the aggregator indexer decrypts (OrderEVM.CreateOrder). */
export type OfframpRecipient = {
  accountIdentifier: string;
  accountName: string;
  institution: string;
  memo: string;
  providerId?: string;
  nonce: string;
  metadata: { apiKey: string; channel?: string; businessNumber?: string };
};

/** Minimal request surface used by the handler (avoids NextRequest in tests). */
export type MessageHashRequest = {
  headers: { get(name: string): string | null };
  json?: () => Promise<unknown>;
};

export type MessageHashApiResult = {
  status: number;
  body: Record<string, unknown>;
};

export type ParseMessageHashResult =
  | { ok: true; input: MessageHashInput }
  | { ok: false; error: string };

export class RecipientTooLongError extends Error {
  constructor(message = "Recipient details are too long to encrypt") {
    super(message);
    this.name = "RecipientTooLongError";
  }
}

/**
 * Allowlist parser. Only the seven recipient fields the client legitimately
 * knows are read; `metadata`, `apiKey`, `nonce` or anything else in the body
 * is ignored by construction.
 */
export function parseMessageHashBody(raw: unknown): ParseMessageHashResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Request body must be a JSON object" };
  }
  const body = raw as Record<string, unknown>;

  const accountIdentifier = requiredString(body, "accountIdentifier", MAX_ACCOUNT_IDENTIFIER);
  if ("error" in accountIdentifier) return { ok: false, error: accountIdentifier.error };
  const accountName = requiredString(body, "accountName", MAX_ACCOUNT_NAME);
  if ("error" in accountName) return { ok: false, error: accountName.error };
  const institution = requiredString(body, "institution", 32);
  if ("error" in institution) return { ok: false, error: institution.error };
  if (!INSTITUTION_RE.test(institution.value)) {
    return { ok: false, error: "institution is not a valid institution code" };
  }

  const memo = optionalString(body, "memo", MAX_MEMO);
  if ("error" in memo) return { ok: false, error: memo.error };
  const providerId = optionalString(body, "providerId", MAX_PROVIDER_ID);
  if ("error" in providerId) return { ok: false, error: providerId.error };
  if (providerId.value && !PROVIDER_ID_RE.test(providerId.value)) {
    return { ok: false, error: "providerId contains invalid characters" };
  }
  const kesChannel = optionalString(body, "kesChannel", 16);
  if ("error" in kesChannel) return { ok: false, error: kesChannel.error };
  if (kesChannel.value && !KES_CHANNELS.includes(kesChannel.value)) {
    return { ok: false, error: "kesChannel must be one of Mobile, Till, Paybill" };
  }
  const businessNumber = optionalString(body, "businessNumber", 12);
  if ("error" in businessNumber) return { ok: false, error: businessNumber.error };
  if (businessNumber.value && !BUSINESS_NUMBER_RE.test(businessNumber.value)) {
    return { ok: false, error: "businessNumber must be 1–12 digits" };
  }

  return {
    ok: true,
    input: {
      accountIdentifier: accountIdentifier.value,
      accountName: accountName.value,
      institution: institution.value,
      ...(memo.value !== undefined && { memo: memo.value }),
      ...(providerId.value !== undefined && { providerId: providerId.value }),
      ...(kesChannel.value !== undefined && {
        kesChannel: kesChannel.value as KesMpesaChannel,
      }),
      ...(businessNumber.value !== undefined && {
        businessNumber: businessNumber.value,
      }),
    },
  };
}

function requiredString(
  body: Record<string, unknown>,
  key: string,
  max: number,
): { value: string } | { error: string } {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) {
    return { error: `${key} is required` };
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    return { error: `${key} must be at most ${max} characters` };
  }
  return { value: trimmed };
}

function optionalString(
  body: Record<string, unknown>,
  key: string,
  max: number,
): { value: string | undefined } | { error: string } {
  const value = body[key];
  if (value === undefined || value === null || value === "") {
    return { value: undefined };
  }
  if (typeof value !== "string") {
    return { error: `${key} must be a string` };
  }
  const trimmed = value.trim();
  if (!trimmed) return { value: undefined };
  if (trimmed.length > max) {
    return { error: `${key} must be at most ${max} characters` };
  }
  return { value: trimmed };
}

/**
 * 12 URL-safe chars (72 bits) from a CSPRNG. The aggregator never reads the
 * nonce; it only makes ciphertexts unique. Kept at or below the old client
 * nonce length (13 chars) so the payload never grows against the 245-byte
 * PKCS#1 v1.5 budget.
 */
export function generateRecipientNonce(): string {
  return randomBytes(9).toString("base64url");
}

/**
 * Builds the recipient exactly as the client used to, with the KES M-Pesa
 * rules from TransactionPreview: `channel` is included for Till/Paybill (never
 * "Mobile", the default), `businessNumber` only for Paybill, and both only when
 * the institution is M-Pesa. `memo` is always present (possibly "") to keep the
 * on-chain payload byte-compatible with the previous client build.
 */
export function buildOfframpRecipient(
  input: MessageHashInput,
  apiKey: string,
  nonce: string = generateRecipientNonce(),
): OfframpRecipient {
  const metadata: OfframpRecipient["metadata"] = { apiKey };
  if (input.institution === KES_MPESA_INSTITUTION_CODE && input.kesChannel) {
    if (input.kesChannel !== "Mobile") {
      metadata.channel = input.kesChannel;
    }
    if (input.kesChannel === "Paybill" && input.businessNumber) {
      metadata.businessNumber = input.businessNumber;
    }
  }

  return {
    accountIdentifier: input.accountIdentifier,
    accountName: input.accountName,
    institution: input.institution,
    memo: input.memo ?? "",
    ...(input.providerId ? { providerId: input.providerId } : {}),
    nonce,
    metadata,
  };
}

/**
 * Parses the aggregator's `/pubkey` PEM by its DER body, not its label. The
 * aggregator's own reference config ships a key labelled `RSA PUBLIC KEY`
 * whose body is SPKI; Go and jsencrypt accept it, Node's PEM parser does not.
 */
export function parseAggregatorPublicKey(pem: string): KeyObject {
  const base64 = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  if (!base64) {
    throw new Error("Aggregator public key is empty");
  }
  const der = Buffer.from(base64, "base64");
  let key: KeyObject;
  try {
    key = createPublicKey({ key: der, format: "der", type: "spki" });
  } catch {
    key = createPublicKey({ key: der, format: "der", type: "pkcs1" });
  }
  if (key.asymmetricKeyType !== "rsa") {
    throw new Error(
      `Aggregator public key is ${key.asymmetricKeyType ?? "unknown"}, expected rsa`,
    );
  }
  return key;
}

/** Largest plaintext PKCS#1 v1.5 can carry for this key (245 bytes for the production 2047-bit key). */
export function maxPkcs1v15PlaintextBytes(key: KeyObject): number {
  const modulusBits = key.asymmetricKeyDetails?.modulusLength;
  if (!modulusBits) {
    throw new Error("Cannot determine RSA modulus length");
  }
  return Math.ceil(modulusBits / 8) - PKCS1_V15_OVERHEAD_BYTES;
}

/**
 * RSA PKCS#1 v1.5 via Node crypto (CSPRNG padding). Byte-identical output
 * format to the jsencrypt call this replaces, and what the aggregator's
 * `rsa.DecryptPKCS1v15` expects. Never use jsencrypt server-side: without
 * `window.crypto` it seeds its padding RNG from Math.random().
 */
export function encryptRecipient(recipient: unknown, key: KeyObject): string {
  const plaintext = Buffer.from(JSON.stringify(recipient), "utf8");
  if (plaintext.length > maxPkcs1v15PlaintextBytes(key)) {
    throw new RecipientTooLongError();
  }
  try {
    return publicEncrypt(
      { key, padding: constants.RSA_PKCS1_PADDING },
      plaintext,
    ).toString("base64");
  } catch (error) {
    if (/too large/i.test(error instanceof Error ? error.message : "")) {
      throw new RecipientTooLongError();
    }
    throw error;
  }
}

function errorBody(message: string): Record<string, unknown> {
  return { status: "error", message };
}

export async function handleCreateMessageHash(
  request: MessageHashRequest,
): Promise<MessageHashApiResult> {
  const startTime = Date.now();
  const req = request as unknown as NextRequest;
  const walletAddress = request.headers.get("x-wallet-address")?.toLowerCase();

  if (!walletAddress) {
    trackApiError(req, MESSAGE_HASH_ENDPOINT, "POST", new Error("Unauthorized"), 401);
    return { status: 401, body: errorBody("Unauthorized") };
  }

  trackApiRequest(req, MESSAGE_HASH_ENDPOINT, "POST", { wallet_address: walletAddress });

  try {
    const apiKey = getAggregatorSenderApiKey();
    if (!apiKey || !config.aggregatorUrl) {
      // Env names stay server-side; the client only sees a generic 503.
      const cause = !apiKey
        ? "AGGREGATOR_SENDER_API_KEY_ID is not configured"
        : "NEXT_PUBLIC_AGGREGATOR_URL is not configured";
      console.error(`[message-hash] ${cause}`);
      trackApiError(req, MESSAGE_HASH_ENDPOINT, "POST", new Error(cause), 503);
      return { status: 503, body: errorBody("Order service temporarily unavailable") };
    }

    let raw: unknown;
    try {
      raw = await request.json?.();
    } catch {
      trackApiError(req, MESSAGE_HASH_ENDPOINT, "POST", new Error("Invalid JSON body"), 400);
      return { status: 400, body: errorBody("Invalid JSON body") };
    }
    const parsed = parseMessageHashBody(raw);
    if (!parsed.ok) {
      trackApiError(req, MESSAGE_HASH_ENDPOINT, "POST", new Error(parsed.error), 400);
      return { status: 400, body: errorBody(parsed.error) };
    }

    let publicKey: KeyObject;
    try {
      const response = await fetchAggregatorPublicKey();
      if (response?.status !== "success" || typeof response.data !== "string") {
        throw new Error(`Unexpected /pubkey response: ${String(response?.status)}`);
      }
      publicKey = parseAggregatorPublicKey(response.data);
    } catch (error) {
      trackApiError(
        req,
        MESSAGE_HASH_ENDPOINT,
        "POST",
        error instanceof Error ? error : new Error(String(error)),
        502,
      );
      return {
        status: 502,
        body: errorBody("Could not reach the aggregator. Please try again."),
      };
    }

    // No pubkey cache on purpose: an aggregator key rotation would otherwise
    // fail silently for the cache lifetime. One GET per order is negligible.
    const recipient = buildOfframpRecipient(parsed.input, apiKey);

    let messageHash: string;
    try {
      messageHash = encryptRecipient(recipient, publicKey);
    } catch (error) {
      if (error instanceof RecipientTooLongError) {
        trackApiError(req, MESSAGE_HASH_ENDPOINT, "POST", error, 422);
        return {
          status: 422,
          body: errorBody(
            "Recipient details are too long to encrypt. Shorten the memo and try again.",
          ),
        };
      }
      throw error;
    }

    trackApiResponse(MESSAGE_HASH_ENDPOINT, "POST", 200, Date.now() - startTime, {
      wallet_address: walletAddress,
      institution: parsed.input.institution,
    });
    return {
      status: 200,
      body: { status: "success", message: "OK", data: { messageHash } },
    };
  } catch (error) {
    console.error("[message-hash] unexpected error:", error);
    trackApiError(
      req,
      MESSAGE_HASH_ENDPOINT,
      "POST",
      error instanceof Error ? error : new Error(String(error)),
      500,
      { response_time_ms: Date.now() - startTime },
    );
    return { status: 500, body: errorBody("Internal server error") };
  }
}
