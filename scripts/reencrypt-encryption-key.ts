/**
 * ENCRYPTION_KEY rotation: re-encrypt stored recipient ciphertext from
 * OLD_ENCRYPTION_KEY to NEW_ENCRYPTION_KEY through the encrypt_recipient_data /
 * decrypt_recipient_data RPCs. Runbook: scripts/reencrypt-encryption-key.md.
 *
 * Usage (from noblocks/):
 *   OLD_ENCRYPTION_KEY=… NEW_ENCRYPTION_KEY=… SUPABASE_URL=… SUPABASE_SECRET_KEY=… \
 *     pnpm rotate:encryption-key            # dry run (default)
 *   … pnpm rotate:encryption-key --execute  # write re-encrypted payloads
 *
 * Safety properties:
 *   - Dry run by default; --execute is the only way to write.
 *   - Idempotent: a row that already decrypts with NEW is left alone, so an
 *     interrupted run can simply be re-run.
 *   - Compare-and-swap updates: a row the app rewrote mid-run is reported as
 *     concurrent_change rather than overwritten.
 *   - Every new ciphertext is decrypted and compared before it is written.
 *   - Resume: the last processed id is saved to the state file after each
 *     batch in execute mode; --resume continues from it.
 *   - Nothing to do (no ciphertext column yet, or no non-null rows) exits 0
 *     with "0 rows".
 *   - Keys and plaintext are never logged. Log lines carry row ids and
 *     outcomes only.
 *
 * Deliberately does not import app/lib/supabase or app/lib/encryption: both
 * pull in "server-only", which throws outside the Next.js runtime.
 */

import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import {
  describeError,
  exitCodeFor,
  formatSummary,
  isMissingColumnError,
  isMissingTableError,
  isWrongKeyError,
  parseArgs,
  rotate,
  USAGE,
  validateKeys,
  type RotationCrypto,
  type RotationStore,
} from "./lib/reencrypt-encryption-key";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing required env ${name}`);
    process.exit(1);
  }
  return value;
}

type StateFile = { table: string; column: string; lastId: string; updatedAt: string };

function readState(path: string): StateFile | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as StateFile;
}

function writeState(path: string, state: StateFile): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2) + "\n");
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(describeError(error));
    console.error(USAGE);
    process.exit(1);
  }
  if (args.help) {
    console.log(USAGE);
    return;
  }

  let keys;
  try {
    keys = validateKeys({
      OLD_ENCRYPTION_KEY: process.env.OLD_ENCRYPTION_KEY,
      NEW_ENCRYPTION_KEY: process.env.NEW_ENCRYPTION_KEY,
    });
  } catch (error) {
    console.error(describeError(error));
    process.exit(1);
  }

  const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SECRET_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const crypto: RotationCrypto = {
    async decrypt(base64, key) {
      const { data, error } = await supabase.rpc("decrypt_recipient_data", {
        encrypted_data: base64,
        encryption_key: key,
      });
      if (error) throw error;
      if (typeof data !== "string") throw new Error("decrypt_recipient_data returned no data");
      return data;
    },
    async encrypt(plaintext, key) {
      const { data, error } = await supabase.rpc("encrypt_recipient_data", {
        recipient_json: plaintext,
        encryption_key: key,
      });
      if (error) throw error;
      if (typeof data !== "string" || !data) throw new Error("encrypt_recipient_data returned no data");
      return data;
    },
  };

  // Preflight: prove both RPCs exist and that the keys behave as expected
  // before touching a single row. The probe string is synthetic.
  const probe = JSON.stringify({ probe: "reencrypt-encryption-key", at: new Date().toISOString() });
  try {
    const sealed = await crypto.encrypt(probe, keys.newKey);
    const opened = await crypto.decrypt(sealed.replace(/\s+/g, ""), keys.newKey);
    if (opened !== probe) throw new Error("probe did not round-trip under NEW_ENCRYPTION_KEY");
    try {
      await crypto.decrypt(sealed.replace(/\s+/g, ""), keys.oldKey);
      throw new Error("OLD_ENCRYPTION_KEY decrypted ciphertext sealed with NEW_ENCRYPTION_KEY");
    } catch (error) {
      if (!isWrongKeyError(error)) throw error;
    }
  } catch (error) {
    console.error(`Preflight failed: ${describeError(error)}`);
    console.error(
      "Apply supabase/migrations/20261015130000_recipient_encryption_rpcs.sql and check the keys.",
    );
    process.exit(1);
  }

  const { table, column } = args;
  const store: RotationStore = {
    async fetchBatch(after, limit) {
      let query = supabase
        .from(table)
        .select(`id, ${column}`)
        .not(column, "is", null)
        .order("id", { ascending: true })
        .limit(limit);
      if (after) query = query.gt("id", after);
      const { data, error } = await query;
      if (error) {
        if (isMissingColumnError(error)) return { kind: "missing_column" };
        if (isMissingTableError(error)) {
          throw new Error(`table ${table} does not exist; check --table`);
        }
        throw error;
      }
      const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
      return {
        kind: "rows",
        rows: rows.map((row) => ({ id: String(row.id), payload: String(row[column]) })),
      };
    },
    async updatePayload(id, expected, next) {
      const { data, error } = await supabase
        .from(table)
        .update({ [column]: next })
        .eq("id", id)
        .eq(column, expected)
        .select("id");
      if (error) throw error;
      return (data?.length ?? 0) === 1;
    },
  };

  const stateFile = resolve(process.cwd(), args.stateFile);
  let after = args.after;
  if (args.resume) {
    const state = readState(stateFile);
    if (!state) {
      console.error(`--resume given but no state file at ${stateFile}`);
      process.exit(1);
    }
    if (state.table !== table || state.column !== column) {
      console.error(`state file is for ${state.table}.${state.column}, not ${table}.${column}`);
      process.exit(1);
    }
    after = state.lastId;
    console.log(`resuming after ${after}`);
  }

  console.log(
    `${args.execute ? "EXECUTE" : "DRY RUN"}: ${table}.${column}, batch ${args.batchSize}` +
      (after ? `, after ${after}` : "") +
      (args.maxRows ? `, max ${args.maxRows} rows` : ""),
  );

  const summary = await rotate(store, crypto, {
    ...keys,
    execute: args.execute,
    batchSize: args.batchSize,
    after,
    maxRows: args.maxRows,
    log: (line) => console.log(line),
    onBatchComplete: args.execute
      ? (lastId) =>
          writeState(stateFile, { table, column, lastId, updatedAt: new Date().toISOString() })
      : undefined,
  });

  console.log("");
  console.log(formatSummary(summary));
  if (args.execute && summary.lastId) {
    console.log(`progress saved to ${stateFile}`);
  }
  process.exit(exitCodeFor(summary));
}

main().catch((error) => {
  console.error(describeError(error));
  process.exit(1);
});
