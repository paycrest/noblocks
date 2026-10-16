/**
 * Core of scripts/reencrypt-encryption-key.ts, kept free of I/O so the
 * decision logic is unit-testable (__tests__/encryptionKeyRotation.test.ts).
 *
 * The CLI wires `RotationStore` to Supabase and `RotationCrypto` to the
 * encrypt_recipient_data / decrypt_recipient_data RPCs. Tests inject in-memory
 * fakes. Nothing in this module ever logs a key or a plaintext payload: the log
 * lines carry row ids and outcome names only.
 */

import { isWrongKeyError } from "../../app/lib/encryption-keys";

export { isWrongKeyError };

// ─── CLI arguments ─────────────────────────────────────────────────────────────

export type ParsedArgs = {
  execute: boolean;
  batchSize: number;
  table: string;
  column: string;
  /** Row id to resume after (exclusive). Set by --after or --resume. */
  after: string | null;
  /** Load `after` from the state file. */
  resume: boolean;
  stateFile: string;
  /** Stop after this many rows (null = no cap). */
  maxRows: number | null;
  help: boolean;
};

export const DEFAULT_TABLE = "saved_recipients";
export const DEFAULT_COLUMN = "encrypted_payload";
export const DEFAULT_BATCH_SIZE = 100;
export const DEFAULT_STATE_FILE = "scripts/output/reencrypt-encryption-key.state.json";

export const USAGE = `Usage: tsx scripts/reencrypt-encryption-key.ts [options]

Re-encrypts every non-null ${DEFAULT_TABLE}.${DEFAULT_COLUMN} value from
OLD_ENCRYPTION_KEY to NEW_ENCRYPTION_KEY. Dry run is the default.

Env:     OLD_ENCRYPTION_KEY, NEW_ENCRYPTION_KEY, SUPABASE_URL, SUPABASE_SECRET_KEY
Options:
  --dry-run             Report what would change (default)
  --execute             Write re-encrypted payloads
  --batch-size <n>      Rows per batch (default ${DEFAULT_BATCH_SIZE})
  --table <name>        Table holding the ciphertext (default ${DEFAULT_TABLE})
  --column <name>       Ciphertext column (default ${DEFAULT_COLUMN})
  --after <id>          Resume after this row id
  --resume              Resume after the id saved in the state file
  --state-file <path>   Where progress is saved (default ${DEFAULT_STATE_FILE})
  --max-rows <n>        Stop after n rows
  --help
`;

function takeValue(argv: string[], index: number, flag: string): string {
  const inline = argv[index].slice(flag.length + 1);
  if (argv[index].startsWith(`${flag}=`)) return inline;
  const next = argv[index + 1];
  if (next === undefined || next.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return next;
}

function positiveInt(raw: string, flag: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return value;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    execute: false,
    batchSize: DEFAULT_BATCH_SIZE,
    table: DEFAULT_TABLE,
    column: DEFAULT_COLUMN,
    after: null,
    resume: false,
    stateFile: DEFAULT_STATE_FILE,
    maxRows: null,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const flag = arg.includes("=") ? arg.slice(0, arg.indexOf("=")) : arg;
    const consumesNext = (f: string) => {
      const value = takeValue(argv, i, f);
      if (!arg.startsWith(`${f}=`)) i++;
      return value;
    };

    switch (flag) {
      case "--execute":
        args.execute = true;
        break;
      case "--dry-run":
        args.execute = false;
        break;
      case "--batch-size":
        args.batchSize = positiveInt(consumesNext(flag), flag);
        break;
      case "--table":
        args.table = consumesNext(flag);
        break;
      case "--column":
        args.column = consumesNext(flag);
        break;
      case "--after":
        args.after = consumesNext(flag);
        break;
      case "--resume":
        args.resume = true;
        break;
      case "--state-file":
        args.stateFile = consumesNext(flag);
        break;
      case "--max-rows":
        args.maxRows = positiveInt(consumesNext(flag), flag);
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!/^[a-z_][a-z0-9_]*$/i.test(args.table) || !/^[a-z_][a-z0-9_]*$/i.test(args.column)) {
    throw new Error("--table and --column must be plain identifiers");
  }

  return args;
}

// ─── Keys ──────────────────────────────────────────────────────────────────────

export type RotationKeys = { oldKey: string; newKey: string };

/**
 * Both keys must be present and distinct. The message never includes the
 * values: a blank key is the only thing worth reporting about it.
 */
export function validateKeys(env: {
  OLD_ENCRYPTION_KEY?: string;
  NEW_ENCRYPTION_KEY?: string;
}): RotationKeys {
  const oldKey = env.OLD_ENCRYPTION_KEY?.trim() ?? "";
  const newKey = env.NEW_ENCRYPTION_KEY?.trim() ?? "";
  if (!oldKey) throw new Error("OLD_ENCRYPTION_KEY is not set");
  if (!newKey) throw new Error("NEW_ENCRYPTION_KEY is not set");
  if (oldKey === newKey) {
    throw new Error("OLD_ENCRYPTION_KEY and NEW_ENCRYPTION_KEY are identical; nothing to rotate");
  }
  return { oldKey, newKey };
}

// ─── Payload encoding ──────────────────────────────────────────────────────────

/**
 * How the ciphertext column serialises over PostgREST. A `text` column holds
 * the base64 the RPC returned (Postgres wraps it at 76 columns). A `bytea`
 * column comes back as `\x` followed by hex. The RPCs take and return base64,
 * so both forms are normalised on the way in and restored on the way out.
 */
export type PayloadEncoding = "base64" | "hex-bytea";

export function detectPayloadEncoding(stored: string): PayloadEncoding {
  return /^\\x[0-9a-f]*$/i.test(stored) ? "hex-bytea" : "base64";
}

/** Base64 as the RPC wants it: no whitespace, regardless of how the column stored it. */
export function storedToRpcBase64(stored: string): string {
  if (detectPayloadEncoding(stored) === "hex-bytea") {
    return Buffer.from(stored.slice(2), "hex").toString("base64");
  }
  return stored.replace(/\s+/g, "");
}

/** Inverse of storedToRpcBase64, matching the encoding the row already used. */
export function rpcBase64ToStored(base64: string, encoding: PayloadEncoding): string {
  const clean = base64.replace(/\s+/g, "");
  if (encoding === "hex-bytea") {
    return `\\x${Buffer.from(clean, "base64").toString("hex")}`;
  }
  return clean;
}

// ─── PostgREST error classification ────────────────────────────────────────────

type PgError = { code?: string; message?: string } | null | undefined;

/** The ciphertext column has not been added yet: the documented "nothing to rotate" state. */
export function isMissingColumnError(error: PgError): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  return /column .* does not exist/i.test(error.message ?? "");
}

/**
 * Readable text for an Error or a PostgREST error object ({ message, code,
 * details }), which is a plain object and would otherwise print as
 * "[object Object]". Never includes RPC arguments: PostgREST does not echo them.
 */
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const { message, code, details, hint } = error as Record<string, unknown>;
    const parts = [
      typeof message === "string" && message ? message : "",
      typeof code === "string" && code ? `(code ${code})` : "",
      typeof details === "string" && details ? details : "",
      typeof hint === "string" && hint ? hint : "",
    ].filter(Boolean);
    if (parts.length > 0) return parts.join(" ");
    return JSON.stringify(error);
  }
  return String(error);
}

export function isMissingTableError(error: PgError): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  return /relation .* does not exist/i.test(error.message ?? "");
}

// ─── Row decisions ─────────────────────────────────────────────────────────────

export type RowAction = "skip_already_new" | "reencrypt" | "unreadable";

/**
 * Idempotency lives here: a row that already decrypts with the new key is
 * never touched, so re-running after a partial or interrupted execute is safe.
 */
export function decideRowAction(probe: {
  decryptsWithNew: boolean;
  decryptsWithOld: boolean;
}): RowAction {
  if (probe.decryptsWithNew) return "skip_already_new";
  if (probe.decryptsWithOld) return "reencrypt";
  return "unreadable";
}

// ─── Rotation driver ───────────────────────────────────────────────────────────

export type PayloadRow = { id: string; payload: string };

export type FetchResult =
  | { kind: "rows"; rows: PayloadRow[] }
  | { kind: "missing_column" };

export type RotationStore = {
  /** Non-null payload rows with id > after, ordered by id, at most `limit`. */
  fetchBatch(after: string | null, limit: number): Promise<FetchResult>;
  /**
   * Compare-and-swap: write `next` only if the column still equals `expected`.
   * Returns false when the row changed underneath us (or vanished), in which
   * case the row is reported and picked up by the next run.
   */
  updatePayload(id: string, expected: string, next: string): Promise<boolean>;
};

export type RotationCrypto = {
  /** Rejects with a wrong-key error when `key` does not match. */
  decrypt(base64: string, key: string): Promise<string>;
  encrypt(plaintext: string, key: string): Promise<string>;
};

export type RowOutcome =
  | "already_new"
  | "would_reencrypt"
  | "reencrypted"
  | "unreadable"
  | "concurrent_change"
  | "verify_failed"
  | "error";

export type RotationSummary = {
  mode: "dry-run" | "execute";
  scanned: number;
  counts: Record<RowOutcome, number>;
  /** Last row id processed; feed it back via --after to resume. */
  lastId: string | null;
  /** True when the ciphertext column does not exist yet. */
  columnMissing: boolean;
  /** Row ids that need attention (unreadable, verify_failed, error). */
  problemIds: string[];
};

export type RotationOptions = RotationKeys & {
  execute: boolean;
  batchSize: number;
  after: string | null;
  maxRows: number | null;
  log: (line: string) => void;
  /** Called after each batch with the last id in it; the CLI persists it. */
  onBatchComplete?: (lastId: string) => void | Promise<void>;
};

function emptyCounts(): Record<RowOutcome, number> {
  return {
    already_new: 0,
    would_reencrypt: 0,
    reencrypted: 0,
    unreadable: 0,
    concurrent_change: 0,
    verify_failed: 0,
    error: 0,
  };
}

async function tryDecrypt(
  crypto: RotationCrypto,
  base64: string,
  key: string,
): Promise<{ ok: true; plaintext: string } | { ok: false }> {
  try {
    return { ok: true, plaintext: await crypto.decrypt(base64, key) };
  } catch (error) {
    if (isWrongKeyError(error)) return { ok: false };
    throw error;
  }
}

/**
 * Process one row. Exported for tests; the driver below calls it per row.
 * Returns the outcome; never the plaintext.
 */
export async function rotateRow(
  row: PayloadRow,
  store: RotationStore,
  crypto: RotationCrypto,
  options: Pick<RotationOptions, "oldKey" | "newKey" | "execute">,
): Promise<RowOutcome> {
  const encoding = detectPayloadEncoding(row.payload);
  const base64 = storedToRpcBase64(row.payload);

  const withNew = await tryDecrypt(crypto, base64, options.newKey);
  if (withNew.ok) return "already_new";

  const withOld = await tryDecrypt(crypto, base64, options.oldKey);
  const action = decideRowAction({ decryptsWithNew: false, decryptsWithOld: withOld.ok });
  if (action === "unreadable") return "unreadable";
  if (!options.execute) return "would_reencrypt";

  const plaintext = (withOld as { ok: true; plaintext: string }).plaintext;
  const next = await crypto.encrypt(plaintext, options.newKey);

  // Read back before writing: a ciphertext that does not round-trip under the
  // new key must never replace one that still reads under the old one.
  const verified = await tryDecrypt(crypto, next.replace(/\s+/g, ""), options.newKey);
  if (!verified.ok || verified.plaintext !== plaintext) return "verify_failed";

  const updated = await store.updatePayload(row.id, row.payload, rpcBase64ToStored(next, encoding));
  return updated ? "reencrypted" : "concurrent_change";
}

export async function rotate(
  store: RotationStore,
  crypto: RotationCrypto,
  options: RotationOptions,
): Promise<RotationSummary> {
  const summary: RotationSummary = {
    mode: options.execute ? "execute" : "dry-run",
    scanned: 0,
    counts: emptyCounts(),
    lastId: options.after,
    columnMissing: false,
    problemIds: [],
  };

  let cursor = options.after;
  for (;;) {
    const remaining = options.maxRows === null ? options.batchSize : options.maxRows - summary.scanned;
    if (remaining <= 0) break;
    const limit = Math.min(options.batchSize, remaining);

    const batch = await store.fetchBatch(cursor, limit);
    if (batch.kind === "missing_column") {
      summary.columnMissing = true;
      options.log("ciphertext column not present; 0 rows to rotate");
      break;
    }
    if (batch.rows.length === 0) break;

    for (const row of batch.rows) {
      let outcome: RowOutcome;
      try {
        outcome = await rotateRow(row, store, crypto, options);
      } catch (error) {
        outcome = "error";
        options.log(`row ${row.id}: error: ${describeError(error)}`);
      }
      summary.scanned++;
      summary.counts[outcome]++;
      summary.lastId = row.id;
      if (outcome === "unreadable" || outcome === "verify_failed" || outcome === "error") {
        summary.problemIds.push(row.id);
      }
      if (outcome !== "error") options.log(`row ${row.id}: ${outcome}`);
    }

    cursor = batch.rows[batch.rows.length - 1].id;
    if (options.onBatchComplete) await options.onBatchComplete(cursor);

    if (batch.rows.length < limit) break;
  }

  return summary;
}

/** Non-zero when any row needs a human: unreadable under both keys, or failed on write. */
export function exitCodeFor(summary: RotationSummary): number {
  return summary.problemIds.length > 0 ? 1 : 0;
}

export function formatSummary(summary: RotationSummary): string {
  const lines = [
    `mode: ${summary.mode}`,
    `rows scanned: ${summary.scanned}`,
  ];
  if (summary.columnMissing) {
    lines.push("ciphertext column missing: 0 rows to rotate");
  }
  for (const [outcome, count] of Object.entries(summary.counts)) {
    if (count > 0) lines.push(`  ${outcome}: ${count}`);
  }
  if (summary.scanned === 0) lines.push("0 rows: nothing to do");
  if (summary.lastId) lines.push(`last id: ${summary.lastId}`);
  if (summary.problemIds.length > 0) {
    lines.push(`rows needing attention: ${summary.problemIds.join(", ")}`);
  }
  return lines.join("\n");
}
