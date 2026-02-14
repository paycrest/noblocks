/**
 * Migrate minimal KYC fields from a CSV export to Supabase
 * - Reads CSV with headers: Job ID, User ID, Country, ID Type, Result
 * - Filters rows where Result === "Approved"
 * - Upserts into public.user_kyc_profiles:
 *   - wallet_address  ← User ID (lowercased)
 *   - id_country      ← Country
 *   - id_type         ← ID Type
 *   - verified=true, verified_at=now (optional; remove if not desired)
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
};

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

  const rows: CsvRow[] = raw.map((r) => ({
    job_id: (r['Job ID'] || '').trim(),
    user_id: (r['User ID'] || '').trim(),
    country: r['Country'] ? r['Country'].trim() : null,
    id_type: r['ID Type'] ? r['ID Type'].trim() : null,
    result: (r['Result'] || '').trim(),
  }));

  const valid = rows.filter((r) => r.job_id && r.user_id && r.result);
  const skipped = rows.length - valid.length;
  if (skipped > 0) {
    console.warn(` Skipped ${skipped} rows missing Job ID, User ID, or Result`);
  }
  return valid;
}


function buildRow(r: CsvRow) {
  const isApproved = r.result === 'Approved';
  const nowISO = new Date().toISOString();

  return {
    wallet_address: r.user_id.toLowerCase(),
    id_country: r.country || null,
    id_type: r.id_type || null,
    platform: [
      {
        type: 'id',
        identifier: 'smile_id',
        reference: '',
      }
    ],
    verified: isApproved,
    verified_at: isApproved ? nowISO : null,
    updated_at: nowISO,
  };
}

// Upsert — conflict target: wallet_address (PK)
async function upsertRows(rows: any[]) {
  console.log(`\nUpserting ${rows.length} records into public.user_kyc_profiles...`);
  let ok = 0, failed = 0;

  for (const row of rows) {
    const { error } = await supabase
      .from('user_kyc_profiles')
      .upsert(row, { onConflict: 'wallet_address' });

    if (error) {
      console.error(`❌ ${row.wallet_address}: ${error.message}`);
      failed++;
    } else {
      console.log(`✅ ${row.wallet_address}`);
      ok++;
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
      console.log('--- Dry Run Output (first 5 rows) ---');
      console.log(JSON.stringify(rows.slice(0, 5), null, 2));
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