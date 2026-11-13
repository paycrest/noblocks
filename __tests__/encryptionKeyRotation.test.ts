/**
 * ENCRYPTION_KEY rotation (KAN-876).
 *
 * Covers the three pieces that make a rotation safe:
 *   1. app/lib/encryption.ts encrypts with ENCRYPTION_KEY only and decrypts
 *      with ENCRYPTION_KEY then ENCRYPTION_KEY_FALLBACK;
 *   2. the pure helpers of scripts/lib/reencrypt-encryption-key.ts
 *      (argument parsing, key validation, payload encodings, row decisions);
 *   3. the rotation driver end to end against an in-memory store, including
 *      idempotency (a second run is a no-op) and the "0 rows" paths.
 *
 * The encrypt_recipient_data / decrypt_recipient_data RPCs are replaced by a
 * fake pgcrypto built on Node's AES-GCM: random nonce per call (so the same
 * input never yields the same ciphertext, as pgp_sym_encrypt behaves) and the
 * exact "Wrong key or corrupt data" message on a passphrase mismatch. All keys
 * below are synthetic test strings.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import {
  decryptRecipientData,
  encryptRecipientData,
  isWrongKeyError,
  resolveDecryptKeys,
  resolveEncryptKey,
} from "../app/lib/encryption";
import { supabaseAdmin } from "../app/lib/supabase";
import {
  decideRowAction,
  describeError,
  detectPayloadEncoding,
  exitCodeFor,
  formatSummary,
  isMissingColumnError,
  isMissingTableError,
  parseArgs,
  rotate,
  rotateRow,
  rpcBase64ToStored,
  storedToRpcBase64,
  validateKeys,
  type FetchResult,
  type PayloadRow,
  type RotationCrypto,
  type RotationStore,
} from "../scripts/lib/reencrypt-encryption-key";
import type { Recipient } from "../app/types";

// Relative specifier: the "@/" alias resolves for imports but not for jest.mock.
jest.mock("../app/lib/supabase", () => ({
  supabaseAdmin: { rpc: jest.fn() },
}));

const OLD_KEY = "test-old-passphrase-not-a-real-key";
const NEW_KEY = "test-new-passphrase-not-a-real-key";
const OTHER_KEY = "test-third-passphrase-not-a-real-key";

// ─── Fake pgcrypto ─────────────────────────────────────────────────────────────

class PgcryptoError extends Error {
  code = "39000";
}

function fakePgpSymEncrypt(plaintext: string, passphrase: string): string {
  const key = createHash("sha256").update(passphrase).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Postgres' encode(..., 'base64') wraps at 76 columns; mimic it so callers
  // must tolerate embedded newlines.
  return Buffer.concat([iv, tag, body])
    .toString("base64")
    .replace(/(.{76})/g, "$1\n");
}

function fakePgpSymDecrypt(base64: string, passphrase: string): string {
  const raw = Buffer.from(base64, "base64");
  const key = createHash("sha256").update(passphrase).digest();
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    throw new PgcryptoError("Wrong key or corrupt data");
  }
}

const fakeCrypto: RotationCrypto = {
  async encrypt(plaintext, key) {
    return fakePgpSymEncrypt(plaintext, key);
  },
  async decrypt(base64, key) {
    return fakePgpSymDecrypt(base64, key);
  },
};

const mockedRpc = supabaseAdmin.rpc as unknown as jest.Mock;

/** Routes supabaseAdmin.rpc to the fake pgcrypto, returning PostgREST-shaped results. */
function installRpcFake() {
  mockedRpc.mockImplementation(async (fn: string, params: Record<string, string>) => {
    try {
      if (fn === "encrypt_recipient_data") {
        return { data: fakePgpSymEncrypt(params.recipient_json, params.encryption_key), error: null };
      }
      if (fn === "decrypt_recipient_data") {
        return { data: fakePgpSymDecrypt(params.encrypted_data, params.encryption_key), error: null };
      }
      return { data: null, error: { code: "PGRST202", message: `function ${fn} not found` } };
    } catch (error) {
      return { data: null, error: { code: "39000", message: (error as Error).message } };
    }
  });
}

const recipient: Recipient = {
  account_name: "Test Person",
  institution: "Test Bank",
  account_identifier: "9876543210",
};

const originalEnv = { ...process.env };

beforeEach(() => {
  mockedRpc.mockReset();
  installRpcFake();
  process.env = { ...originalEnv };
  delete process.env.ENCRYPTION_KEY;
  delete process.env.ENCRYPTION_KEY_FALLBACK;
});

afterAll(() => {
  process.env = originalEnv;
});

// ─── app/lib/encryption ────────────────────────────────────────────────────────

describe("resolveEncryptKey / resolveDecryptKeys", () => {
  it("throws when ENCRYPTION_KEY is unset or blank", () => {
    expect(() => resolveEncryptKey({})).toThrow("ENCRYPTION_KEY is not set");
    expect(() => resolveEncryptKey({ ENCRYPTION_KEY: "   " })).toThrow("ENCRYPTION_KEY is not set");
  });

  it("returns only the primary when no fallback is set", () => {
    expect(resolveDecryptKeys({ ENCRYPTION_KEY: NEW_KEY })).toEqual([NEW_KEY]);
    expect(resolveDecryptKeys({ ENCRYPTION_KEY: NEW_KEY, ENCRYPTION_KEY_FALLBACK: "" })).toEqual([NEW_KEY]);
  });

  it("orders primary before fallback and drops a fallback equal to the primary", () => {
    expect(resolveDecryptKeys({ ENCRYPTION_KEY: NEW_KEY, ENCRYPTION_KEY_FALLBACK: OLD_KEY })).toEqual([
      NEW_KEY,
      OLD_KEY,
    ]);
    expect(resolveDecryptKeys({ ENCRYPTION_KEY: NEW_KEY, ENCRYPTION_KEY_FALLBACK: NEW_KEY })).toEqual([NEW_KEY]);
  });
});

describe("isWrongKeyError", () => {
  it("matches pgcrypto's passphrase mismatch and nothing else", () => {
    expect(isWrongKeyError({ message: "Wrong key or corrupt data" })).toBe(true);
    expect(isWrongKeyError(new Error("wrong key or corrupt data"))).toBe(true);
    expect(isWrongKeyError({ message: "function decrypt_recipient_data not found" })).toBe(false);
    expect(isWrongKeyError(new Error("fetch failed"))).toBe(false);
    expect(isWrongKeyError(null)).toBe(false);
    expect(isWrongKeyError("Wrong key")).toBe(false);
  });
});

describe("encryptRecipientData / decryptRecipientData", () => {
  it("round-trips through the RPCs under the primary key", async () => {
    process.env.ENCRYPTION_KEY = NEW_KEY;
    const sealed = await encryptRecipientData(recipient);
    expect(Buffer.isBuffer(sealed)).toBe(true);
    await expect(decryptRecipientData(sealed)).resolves.toEqual(recipient);
  });

  it("encrypts with the primary key only, even when a fallback is set", async () => {
    process.env.ENCRYPTION_KEY = NEW_KEY;
    process.env.ENCRYPTION_KEY_FALLBACK = OLD_KEY;
    const sealed = await encryptRecipientData(recipient);

    const encryptCalls = mockedRpc.mock.calls.filter(([fn]) => fn === "encrypt_recipient_data");
    expect(encryptCalls).toHaveLength(1);
    expect(encryptCalls[0][1].encryption_key).toBe(NEW_KEY);

    // Proof by decryption: readable under NEW, not under OLD.
    expect(fakePgpSymDecrypt(sealed.toString("base64"), NEW_KEY)).toBe(JSON.stringify(recipient));
    expect(() => fakePgpSymDecrypt(sealed.toString("base64"), OLD_KEY)).toThrow("Wrong key");
  });

  it("falls back to ENCRYPTION_KEY_FALLBACK when the primary does not match", async () => {
    process.env.ENCRYPTION_KEY = OLD_KEY;
    const sealedUnderOld = await encryptRecipientData(recipient);

    process.env.ENCRYPTION_KEY = NEW_KEY;
    process.env.ENCRYPTION_KEY_FALLBACK = OLD_KEY;
    mockedRpc.mockClear();

    await expect(decryptRecipientData(sealedUnderOld)).resolves.toEqual(recipient);

    const decryptKeys = mockedRpc.mock.calls
      .filter(([fn]) => fn === "decrypt_recipient_data")
      .map(([, params]) => params.encryption_key);
    expect(decryptKeys).toEqual([NEW_KEY, OLD_KEY]);
  });

  it("does not try the fallback when the primary already matches", async () => {
    process.env.ENCRYPTION_KEY = NEW_KEY;
    process.env.ENCRYPTION_KEY_FALLBACK = OLD_KEY;
    const sealed = await encryptRecipientData(recipient);
    mockedRpc.mockClear();

    await decryptRecipientData(sealed);
    const decryptCalls = mockedRpc.mock.calls.filter(([fn]) => fn === "decrypt_recipient_data");
    expect(decryptCalls).toHaveLength(1);
  });

  it("fails when neither key matches", async () => {
    process.env.ENCRYPTION_KEY = OTHER_KEY;
    const sealedUnderOther = await encryptRecipientData(recipient);

    process.env.ENCRYPTION_KEY = NEW_KEY;
    process.env.ENCRYPTION_KEY_FALLBACK = OLD_KEY;
    await expect(decryptRecipientData(sealedUnderOther)).rejects.toThrow("Failed to decrypt sensitive data");
  });

  it("does not retry with the fallback on a non-key error", async () => {
    process.env.ENCRYPTION_KEY = NEW_KEY;
    process.env.ENCRYPTION_KEY_FALLBACK = OLD_KEY;
    mockedRpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "function decrypt_recipient_data not found" },
    });

    await expect(decryptRecipientData(Buffer.from("anything"))).rejects.toThrow(
      "Failed to decrypt sensitive data",
    );
    expect(mockedRpc).toHaveBeenCalledTimes(1);
  });

  it("refuses to encrypt or decrypt without ENCRYPTION_KEY", async () => {
    await expect(encryptRecipientData(recipient)).rejects.toThrow("Failed to encrypt sensitive data");
    await expect(decryptRecipientData(Buffer.from("x"))).rejects.toThrow("Failed to decrypt sensitive data");
    expect(mockedRpc).not.toHaveBeenCalled();
  });
});

// ─── Script helpers ────────────────────────────────────────────────────────────

describe("parseArgs", () => {
  it("defaults to a dry run on saved_recipients.encrypted_payload", () => {
    const args = parseArgs([]);
    expect(args.execute).toBe(false);
    expect(args.table).toBe("saved_recipients");
    expect(args.column).toBe("encrypted_payload");
    expect(args.batchSize).toBe(100);
    expect(args.after).toBeNull();
    expect(args.resume).toBe(false);
    expect(args.maxRows).toBeNull();
  });

  it("parses execute, batch size, table, column, resume and max rows", () => {
    const args = parseArgs([
      "--execute",
      "--batch-size",
      "25",
      "--table=recipient_secrets",
      "--column",
      "ciphertext",
      "--after",
      "00000000-0000-0000-0000-000000000005",
      "--resume",
      "--max-rows=10",
      "--state-file",
      "/tmp/state.json",
    ]);
    expect(args).toMatchObject({
      execute: true,
      batchSize: 25,
      table: "recipient_secrets",
      column: "ciphertext",
      after: "00000000-0000-0000-0000-000000000005",
      resume: true,
      maxRows: 10,
      stateFile: "/tmp/state.json",
    });
  });

  it("lets a later --dry-run override --execute", () => {
    expect(parseArgs(["--execute", "--dry-run"]).execute).toBe(false);
  });

  it("rejects bad values and unknown flags", () => {
    expect(() => parseArgs(["--batch-size", "0"])).toThrow("--batch-size must be a positive integer");
    expect(() => parseArgs(["--batch-size"])).toThrow("--batch-size requires a value");
    expect(() => parseArgs(["--table", "saved_recipients; drop table"])).toThrow("plain identifiers");
    expect(() => parseArgs(["--wat"])).toThrow("Unknown argument: --wat");
  });
});

describe("validateKeys", () => {
  it("requires both keys and rejects identical ones without echoing them", () => {
    expect(() => validateKeys({})).toThrow("OLD_ENCRYPTION_KEY is not set");
    expect(() => validateKeys({ OLD_ENCRYPTION_KEY: OLD_KEY })).toThrow("NEW_ENCRYPTION_KEY is not set");
    let message = "";
    try {
      validateKeys({ OLD_ENCRYPTION_KEY: OLD_KEY, NEW_ENCRYPTION_KEY: OLD_KEY });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/identical/);
    expect(message).not.toContain(OLD_KEY);
  });

  it("trims and returns the pair", () => {
    expect(validateKeys({ OLD_ENCRYPTION_KEY: ` ${OLD_KEY} `, NEW_ENCRYPTION_KEY: NEW_KEY })).toEqual({
      oldKey: OLD_KEY,
      newKey: NEW_KEY,
    });
  });
});

describe("payload encodings", () => {
  it("passes text base64 through with Postgres line wrapping removed", () => {
    const wrapped = "QUJD\nREVG\n";
    expect(detectPayloadEncoding(wrapped)).toBe("base64");
    expect(storedToRpcBase64(wrapped)).toBe("QUJDREVG");
    expect(rpcBase64ToStored("QUJD\nREVG", "base64")).toBe("QUJDREVG");
  });

  it("converts a bytea hex payload to base64 and back", () => {
    const bytes = Buffer.from("hello");
    const stored = `\\x${bytes.toString("hex")}`;
    expect(detectPayloadEncoding(stored)).toBe("hex-bytea");
    expect(storedToRpcBase64(stored)).toBe(bytes.toString("base64"));
    expect(rpcBase64ToStored(bytes.toString("base64"), "hex-bytea")).toBe(stored);
  });
});

describe("PostgREST error classification", () => {
  it("recognises a missing column as the documented 'nothing to rotate' state", () => {
    expect(isMissingColumnError({ code: "42703", message: "column saved_recipients.encrypted_payload does not exist" })).toBe(true);
    expect(isMissingColumnError({ code: "PGRST204", message: "Could not find the 'encrypted_payload' column" })).toBe(true);
    expect(isMissingColumnError({ code: "42P01", message: "relation x does not exist" })).toBe(false);
    expect(isMissingColumnError(null)).toBe(false);
  });

  it("recognises a missing table separately", () => {
    expect(isMissingTableError({ code: "42P01", message: "relation \"nope\" does not exist" })).toBe(true);
    expect(isMissingTableError({ code: "42703", message: "column nope does not exist" })).toBe(false);
  });
});

describe("describeError", () => {
  it("renders Error instances and PostgREST error objects as text", () => {
    expect(describeError(new Error("fetch failed"))).toBe("fetch failed");
    expect(
      describeError({ message: "Could not find the function", code: "PGRST202", details: null, hint: "Perhaps you meant" }),
    ).toBe("Could not find the function (code PGRST202) Perhaps you meant");
    expect(describeError({ code: "" })).toBe('{"code":""}');
    expect(describeError("plain")).toBe("plain");
  });
});

describe("decideRowAction", () => {
  it("skips rows already under the new key, re-encrypts old ones, flags the rest", () => {
    expect(decideRowAction({ decryptsWithNew: true, decryptsWithOld: false })).toBe("skip_already_new");
    expect(decideRowAction({ decryptsWithNew: true, decryptsWithOld: true })).toBe("skip_already_new");
    expect(decideRowAction({ decryptsWithNew: false, decryptsWithOld: true })).toBe("reencrypt");
    expect(decideRowAction({ decryptsWithNew: false, decryptsWithOld: false })).toBe("unreadable");
  });
});

// ─── Rotation driver ───────────────────────────────────────────────────────────

/** In-memory stand-in for saved_recipients with a nullable ciphertext column. */
class MemoryStore implements RotationStore {
  rows = new Map<string, string | null>();
  fetchCalls: Array<[string | null, number]> = [];
  updateCalls = 0;
  columnExists = true;

  seed(id: string, plaintext: string | null, key?: string) {
    this.rows.set(id, plaintext === null ? null : fakePgpSymEncrypt(plaintext, key ?? OLD_KEY));
  }

  async fetchBatch(after: string | null, limit: number): Promise<FetchResult> {
    this.fetchCalls.push([after, limit]);
    if (!this.columnExists) return { kind: "missing_column" };
    const rows: PayloadRow[] = [...this.rows.entries()]
      .filter(([id, payload]) => payload !== null && (after === null || id > after))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .slice(0, limit)
      .map(([id, payload]) => ({ id, payload: payload as string }));
    return { kind: "rows", rows };
  }

  async updatePayload(id: string, expected: string, next: string): Promise<boolean> {
    this.updateCalls++;
    if (this.rows.get(id) !== expected) return false;
    this.rows.set(id, next);
    return true;
  }

  decryptable(id: string, key: string): boolean {
    try {
      fakePgpSymDecrypt(this.rows.get(id) as string, key);
      return true;
    } catch {
      return false;
    }
  }
}

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

function options(overrides: Partial<Parameters<typeof rotate>[2]> = {}) {
  return {
    oldKey: OLD_KEY,
    newKey: NEW_KEY,
    execute: false,
    batchSize: 100,
    after: null,
    maxRows: null,
    log: () => {},
    ...overrides,
  };
}

describe("rotate", () => {
  it("reports 0 rows and exits 0 when the ciphertext column does not exist", async () => {
    const store = new MemoryStore();
    store.columnExists = false;
    const summary = await rotate(store, fakeCrypto, options({ execute: true }));
    expect(summary.columnMissing).toBe(true);
    expect(summary.scanned).toBe(0);
    expect(exitCodeFor(summary)).toBe(0);
    expect(formatSummary(summary)).toContain("0 rows");
  });

  it("reports 0 rows and exits 0 when every payload is null", async () => {
    const store = new MemoryStore();
    store.seed(id(1), null);
    store.seed(id(2), null);
    const summary = await rotate(store, fakeCrypto, options({ execute: true }));
    expect(summary.scanned).toBe(0);
    expect(store.updateCalls).toBe(0);
    expect(exitCodeFor(summary)).toBe(0);
    expect(formatSummary(summary)).toContain("0 rows: nothing to do");
  });

  it("dry run classifies rows without writing", async () => {
    const store = new MemoryStore();
    store.seed(id(1), JSON.stringify(recipient), OLD_KEY);
    store.seed(id(2), JSON.stringify(recipient), NEW_KEY);
    store.seed(id(3), JSON.stringify(recipient), OTHER_KEY);
    store.seed(id(4), null);

    const summary = await rotate(store, fakeCrypto, options());
    expect(summary.mode).toBe("dry-run");
    expect(summary.scanned).toBe(3);
    expect(summary.counts).toMatchObject({ would_reencrypt: 1, already_new: 1, unreadable: 1, reencrypted: 0 });
    expect(summary.problemIds).toEqual([id(3)]);
    expect(store.updateCalls).toBe(0);
    expect(store.decryptable(id(1), OLD_KEY)).toBe(true);
    expect(exitCodeFor(summary)).toBe(1);
  });

  it("execute re-encrypts old rows, leaves new ones alone, and a second run is a no-op", async () => {
    const store = new MemoryStore();
    const plain = JSON.stringify(recipient);
    store.seed(id(1), plain, OLD_KEY);
    store.seed(id(2), plain, NEW_KEY);
    store.seed(id(3), plain, OLD_KEY);
    const before2 = store.rows.get(id(2));

    const first = await rotate(store, fakeCrypto, options({ execute: true }));
    expect(first.counts).toMatchObject({ reencrypted: 2, already_new: 1, unreadable: 0 });
    expect(store.updateCalls).toBe(2);
    expect(store.rows.get(id(2))).toBe(before2);
    for (const rowId of [id(1), id(2), id(3)]) {
      expect(store.decryptable(rowId, NEW_KEY)).toBe(true);
      expect(store.decryptable(rowId, OLD_KEY)).toBe(false);
      expect(fakePgpSymDecrypt(store.rows.get(rowId) as string, NEW_KEY)).toBe(plain);
    }
    expect(exitCodeFor(first)).toBe(0);

    const second = await rotate(store, fakeCrypto, options({ execute: true }));
    expect(second.counts).toMatchObject({ reencrypted: 0, already_new: 3 });
    expect(store.updateCalls).toBe(2);
    expect(exitCodeFor(second)).toBe(0);
  });

  it("pages in batches, reports progress after each, and resumes from --after", async () => {
    const store = new MemoryStore();
    for (let n = 1; n <= 5; n++) store.seed(id(n), JSON.stringify({ n }), OLD_KEY);
    const checkpoints: string[] = [];

    const summary = await rotate(
      store,
      fakeCrypto,
      options({ execute: true, batchSize: 2, onBatchComplete: (lastId) => void checkpoints.push(lastId) }),
    );
    expect(summary.scanned).toBe(5);
    expect(store.fetchCalls.map(([after, limit]) => [after, limit])).toEqual([
      [null, 2],
      [id(2), 2],
      [id(4), 2],
    ]);
    expect(checkpoints).toEqual([id(2), id(4), id(5)]);
    expect(summary.lastId).toBe(id(5));

    // Resume after a checkpoint: only rows after it are scanned.
    const store2 = new MemoryStore();
    for (let n = 1; n <= 5; n++) store2.seed(id(n), JSON.stringify({ n }), OLD_KEY);
    const resumed = await rotate(store2, fakeCrypto, options({ execute: true, after: id(3) }));
    expect(resumed.scanned).toBe(2);
    expect(store2.decryptable(id(3), OLD_KEY)).toBe(true);
    expect(store2.decryptable(id(4), NEW_KEY)).toBe(true);
    expect(store2.decryptable(id(5), NEW_KEY)).toBe(true);
  });

  it("honours --max-rows", async () => {
    const store = new MemoryStore();
    for (let n = 1; n <= 5; n++) store.seed(id(n), JSON.stringify({ n }), OLD_KEY);
    const summary = await rotate(store, fakeCrypto, options({ execute: true, batchSize: 2, maxRows: 3 }));
    expect(summary.scanned).toBe(3);
    expect(summary.counts.reencrypted).toBe(3);
    expect(store.decryptable(id(4), OLD_KEY)).toBe(true);
  });

  it("does not overwrite a row the app changed mid-run", async () => {
    const store = new MemoryStore();
    const plain = JSON.stringify(recipient);
    store.seed(id(1), plain, OLD_KEY);
    const stale = { id: id(1), payload: store.rows.get(id(1)) as string };
    // Simulate the app rewriting the row between our read and our write.
    store.seed(id(1), JSON.stringify({ ...recipient, memo: "updated" }), OLD_KEY);

    const outcome = await rotateRow(stale, store, fakeCrypto, { oldKey: OLD_KEY, newKey: NEW_KEY, execute: true });
    expect(outcome).toBe("concurrent_change");
    expect(fakePgpSymDecrypt(store.rows.get(id(1)) as string, OLD_KEY)).toContain("updated");
  });

  it("refuses to write ciphertext that does not round-trip under the new key", async () => {
    const store = new MemoryStore();
    store.seed(id(1), JSON.stringify(recipient), OLD_KEY);
    const broken: RotationCrypto = {
      decrypt: fakeCrypto.decrypt,
      // Encrypts under a different key than asked, so verification under NEW fails.
      encrypt: (plaintext) => fakeCrypto.encrypt(plaintext, OTHER_KEY),
    };
    const summary = await rotate(store, broken, options({ execute: true }));
    expect(summary.counts.verify_failed).toBe(1);
    expect(store.updateCalls).toBe(0);
    expect(store.decryptable(id(1), OLD_KEY)).toBe(true);
    expect(exitCodeFor(summary)).toBe(1);
  });

  it("surfaces transport errors per row instead of treating them as a key mismatch", async () => {
    const store = new MemoryStore();
    store.seed(id(1), JSON.stringify(recipient), OLD_KEY);
    const flaky: RotationCrypto = {
      ...fakeCrypto,
      decrypt: async () => {
        throw new Error("fetch failed");
      },
    };
    const logs: string[] = [];
    const summary = await rotate(store, flaky, options({ execute: true, log: (l) => logs.push(l) }));
    expect(summary.counts.error).toBe(1);
    expect(summary.problemIds).toEqual([id(1)]);
    expect(store.updateCalls).toBe(0);
    expect(logs.some((l) => l.includes("fetch failed"))).toBe(true);
  });

  it("never logs keys or plaintext", async () => {
    const store = new MemoryStore();
    store.seed(id(1), JSON.stringify(recipient), OLD_KEY);
    const logs: string[] = [];
    const summary = await rotate(store, fakeCrypto, options({ execute: true, log: (l) => logs.push(l) }));
    const everything = [...logs, formatSummary(summary)].join("\n");
    expect(everything).not.toContain(OLD_KEY);
    expect(everything).not.toContain(NEW_KEY);
    expect(everything).not.toContain(recipient.account_identifier);
    expect(everything).not.toContain(recipient.account_name);
  });
});
