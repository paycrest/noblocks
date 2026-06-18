/**
 * Migrate minimal KYC fields from a CSV export to Supabase
 * - Reads CSV with headers: Job ID, User ID, Country, ID Type, Result
 * - Filters rows where Result === "Approved"
 * - Upserts into public.user_kyc_profiles:
 *   - wallet_address  ← User ID (lowercased)
 *   - id_country      ← Country
 *   - id_type         ← ID Type
 *   - verified=true, verified_at from CSV Timestamp/Date/Job Time when valid (else null)
 *   - tier=2 (full KYC / Smile-approved migration)
 *
 * Usage:
 *   npx ts-node scripts/migrate-kyc-data.ts --dry-run
 *   npx ts-node scripts/migrate-kyc-data.ts --csv ./kyc-export.csv
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';

dotenv.config();

// ESM-safe path resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Env
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error('Missing Supabase credentials in .env (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// CLI: allow overriding the CSV path via --csv
const csvArgIndex = process.argv.findIndex((a) => a === '--csv');
const CSV_FILE_PATH = csvArgIndex >= 0
  ? path.resolve(process.argv[csvArgIndex + 1])
  : path.join(__dirname, 'kyc-export.csv'); // default name next to script


interface CsvRowRaw {
  'Job ID'?: string;
  'User ID'?: string;
  'SDK'?: string;
  'Date'?: string;
  'Timestamp'?: string;
  'Job Time'?: string;
  'Product'?: string;
  'Job Type'?: string;
  'Country'?: string;
  'ID Type'?: string;
  'Result'?: string;
  'Message'?: string;
  'SmartCheck User'?: string;
}

type CsvRow = {
  job_id: string;
  user_id: string;
  country?: string | null;
  id_type?: string | null;
  result: string;
  /** Smile export `Date` column, expected DD-MM-YYYY (e.g. "14-06-2025"). */
  dateRaw: string | null;
  /** Smile export `Timestamp` column, expected HH:MM:SS (e.g. "15:22:46"). */
  timeRaw: string | null;
};

/** A single `type: 'id'` verification entry in the `platform` jsonb array. */
type IdPlatformEntry = {
  type: 'id';
  identifier: 'smile_id';
  reference?: string;
  verified: true;
};

/** Payload shape for upsert into public.user_kyc_profiles (partial row). */
type KycProfileUpsertRow = {
  wallet_address: string;
  id_country: string | null;
  id_type: string | null;
  /** Merged with any existing entries at upsert time (see mergeExistingPlatform). */
  platform: unknown[];
  verified: boolean;
  verified_at: string | null;
  /** Full document KYC (Smile-approved export) */
  tier: 2;
  updated_at: string;
};

/**
 * Build an ISO timestamp from the Smile export's separate `Date` (DD-MM-YYYY)
 * and `Timestamp` (HH:MM:SS) columns. The native `Date` parser cannot read
 * either format on its own, so we assemble an explicit `YYYY-MM-DDThh:mm:ssZ`
 * string (treated as UTC for determinism). Returns null if the date is missing
 * or unparseable.
 */
function parseSmileTimestampToIso(
  dateRaw: string | null | undefined,
  timeRaw: string | null | undefined,
): string | null {
  const date = (dateRaw ?? '').trim();
  if (!date) return null;

  const m = date.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) {
    // Unexpected format — fall back to native parsing as a last resort.
    const fallback = new Date(date);
    return Number.isNaN(fallback.getTime()) ? null : fallback.toISOString();
  }

  const [, dd, mm, yyyy] = m;
  const time = (timeRaw ?? '').trim();
  const hms = /^\d{2}:\d{2}:\d{2}$/.test(time) ? time : '00:00:00';

  const d = new Date(`${yyyy}-${mm}-${dd}T${hms}Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Read + normalize CSV
function readCsv(): CsvRow[] {
  if (!fs.existsSync(CSV_FILE_PATH)) {
    throw new Error(`CSV file not found at: ${CSV_FILE_PATH}`);
  }
  console.log(` Reading data from ${CSV_FILE_PATH}`);

  const content = fs.readFileSync(CSV_FILE_PATH);
  const raw = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as CsvRowRaw[];

  console.log(`Found ${raw.length} records in CSV file.`);

  const rows: CsvRow[] = raw.map((r) => {
    return {
      job_id: (r['Job ID'] || '').trim(),
      user_id: (r['User ID'] || '').trim(),
      country: r['Country'] ? r['Country'].trim() : null,
      id_type: r['ID Type'] ? r['ID Type'].trim() : null,
      result: (r['Result'] || '').trim(),
      dateRaw: r['Date'] ? r['Date'].trim() : null,
      timeRaw: r['Timestamp'] ? r['Timestamp'].trim() : null,
    };
  });

  const valid = rows.filter((r) => r.job_id && r.user_id && r.result);
  const skipped = rows.length - valid.length;
  if (skipped > 0) {
    console.warn(` Skipped ${skipped} rows missing Job ID, User ID, or Result`);
  }
  return valid;
}


function buildRow(r: CsvRow): KycProfileUpsertRow {
  const isApproved = r.result === 'Approved';
  const nowISO = new Date().toISOString();

  const smilePlatform: IdPlatformEntry = {
    type: 'id',
    identifier: 'smile_id',
    verified: true,
  };
  if (r.job_id) {
    smilePlatform.reference = r.job_id;
  }

  const verifiedAtIso =
    isApproved ? parseSmileTimestampToIso(r.dateRaw, r.timeRaw) : null;

  return {
    wallet_address: r.user_id.toLowerCase(),
    id_country: r.country || null,
    id_type: r.id_type || null,
    platform: [smilePlatform],
    verified: isApproved,
    verified_at: verifiedAtIso,
    tier: 2,
    updated_at: nowISO,
  };
}

/**
 * Merge this migration's `id` entry into the wallet's existing `platform`
 * array, preserving any non-`id` verifications (e.g. phone). Mirrors the live
 * Smile flow (app/api/kyc/smile-id/route.ts): existing `type: 'id'` entries are
 * replaced by the freshly-migrated one. A blind upsert would instead clobber
 * the whole array and drop a user's prior phone verification.
 */
async function mergeExistingPlatform(
  row: KycProfileUpsertRow,
): Promise<unknown[]> {
  const { data, error } = await supabase
    .from('user_kyc_profiles')
    .select('platform')
    .eq('wallet_address', row.wallet_address)
    .maybeSingle();

  if (error) {
    throw new Error(`fetch existing platform: ${error.message}`);
  }

  const existing = Array.isArray(data?.platform) ? data!.platform : [];
  const otherVerifications = existing.filter(
    (p: unknown) => (p as { type?: string })?.type !== 'id',
  );
  return [...otherVerifications, ...row.platform];
}

// Upsert — conflict target: wallet_address (PK)
async function upsertRows(rows: KycProfileUpsertRow[]) {
  console.log(`\nUpserting ${rows.length} records into public.user_kyc_profiles...`);
  let ok = 0, failed = 0;

  for (const row of rows) {
    try {
      row.platform = await mergeExistingPlatform(row);

      const { error } = await supabase
        .from('user_kyc_profiles')
        .upsert(row, { onConflict: 'wallet_address' });

      if (error) throw new Error(error.message);

      console.log(`✅ ${row.wallet_address}`);
      ok++;
    } catch (err: any) {
      console.error(`❌ ${row.wallet_address}: ${err.message || err}`);
      failed++;
    }
  }
  console.log(`\n Summary: OK=${ok}, Failed=${failed}`);
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  console.log(isDryRun ? 'Running in DRY RUN mode.' : 'Running in LIVE mode.');

  try {
    const all = readCsv();
    const approved = all.filter((r) => r.result === 'Approved');
    console.log(`✅ Approved rows: ${approved.length}`);

    const rows = approved.map(buildRow);

    if (isDryRun) {
      // Read-only: resolve the real merged platform for the previewed rows so
      // dry-run output reflects what would actually be written.
      const preview = rows.slice(0, 5);
      for (const row of preview) {
        row.platform = await mergeExistingPlatform(row);
      }
      console.log('--- Dry Run Output (first 5 rows) ---');
      console.log(JSON.stringify(preview, null, 2));
      console.log('-------------------------------------');
      console.log('No data will be written to the database in dry run mode.');
    } else {
      await upsertRows(rows);
    }

    console.log('🎉 Migration script finished.');
  } catch (err: any) {
    console.error(' An error occurred:', err.message || err);
    process.exit(1);
  }
}

main();