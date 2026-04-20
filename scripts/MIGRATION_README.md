# KYC Data Migration from CSV

This script migrates user KYC data from a local CSV file into the Supabase `user_kyc_profiles` table.

## Prerequisites

### 1. Install Dependencies

If you haven't already, install the required packages:
```bash
npm install @supabase/supabase-js dotenv ts-node typescript @types/node csv-parse
```

### 2. Environment Variables

Ensure your `.env` file contains the following Supabase credentials:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 3. CSV Data File

Place a CSV file named **`kyc-export.csv`** inside the `scripts/` directory (or pass a custom path with `--csv`). The default filename matches `migrate-kyc-data.ts`.

The export should use **Smile-style column headers** that match what `migrate-kyc-data.ts` reads (see `CsvRowRaw` in the script). Headers the script **uses** for the migration:

- **Required for row validity:** `Job ID`, `User ID`, `Result` (rows missing any of these are skipped).
- **Mapped when present:** `Country`, `ID Type`
- **Time (optional):** first non-empty among `Timestamp`, `Date`, `Job Time` → `verified_at` when `Result` is Approved.

Other Smile export columns (`SDK`, `Product`, `Job Type`, `Message`, `SmartCheck User`) are ignored by this script. **There is no `phone_number` column** — phone is not read from the CSV; add or fix phone in Supabase separately if needed.

## Usage

### Dry Run (Recommended First)

To preview the data that will be inserted without writing anything to the database, run:

```bash
npx ts-node scripts/migrate-kyc-data.ts --dry-run
```

This command will:

- Read and parse **`kyc-export.csv`** (unless `--csv` points elsewhere).
- Transform the first 5 records into the database format (preview only).
- Print the transformed data to the console.
- **It will NOT write any data to Supabase.**

### Full Migration

Once you have verified that the dry run output is correct, you can perform the full migration:

```bash
npx ts-node scripts/migrate-kyc-data.ts
```

Or with an explicit file:

```bash
npx ts-node scripts/migrate-kyc-data.ts --csv ./path/to/your-export.csv
```

This command will:

1. Read all records from **`kyc-export.csv`** (or the `--csv` path).
2. Keep only rows where **`Result`** is **`Approved`**.
3. Transform each record to match the `user_kyc_profiles` schema (including **`tier: 2`** for full KYC).
4. Upsert each record into the Supabase table, using `wallet_address` to handle conflicts.

## How It Works

### 1. Extraction

- The script reads the CSV from the path above (default: `scripts/kyc-export.csv`).
- It uses the `csv-parse` library to parse the file into an array of JavaScript objects.

### 2. Transformation

For each **Approved** row:

- It maps CSV columns into `user_kyc_profiles` fields.
- **`User ID`** → **`wallet_address`** (lowercased).
- **`Job ID`** → stored under **`platform[0].reference`** (Smile job id) when present.
- **`tier`** is set to **`2`** for every migrated row (document-verified / full KYC tier in the app).
- **`verified_at`** comes from **`Timestamp`**, **`Date`**, or **`Job Time`** when parseable; otherwise `null`.

### 3. Loading

- The script connects to your Supabase instance using the service role key.
- It iterates through the transformed records and uses `supabase.from('user_kyc_profiles').upsert(...)` to insert or update each one.
- The `onConflict: 'wallet_address'` option ensures that existing records are updated, preventing duplicates.

## Data Mapping

| CSV column(s) | Schema field | Notes |
|---------------|--------------|--------|
| `User ID` | `wallet_address` | Primary key, lowercased |
| `Country` | `id_country` | |
| `ID Type` | `id_type` | |
| `Job ID` | `platform[].reference` | Smile job reference (`type: id`, `identifier: smile_id`) |
| `Timestamp` / `Date` / `Job Time` | `verified_at` | First non-empty, parsed to ISO; null if missing/invalid |
| `Result` | `verified` | Only **`Approved`** rows are migrated |
| — | `tier` | Always **`2`** for migrated rows |
| — | `updated_at` | Set at migration run time |

## Troubleshooting

### `CSV file not found`

**Issue**: The script throws an error `CSV file not found at: <path>`.

**Solution**: Ensure the file exists at the path shown in the error. By default, place **`kyc-export.csv`** in the **`scripts/`** directory at the project root (next to `migrate-kyc-data.ts`), or pass **`--csv /absolute/or/relative/path/to/file.csv`**.

### `Missing Supabase credentials`

**Issue**: The script throws an error about missing credentials.

**Solution**: Ensure your `.env` file is in the root of the `noblocks` project and contains the correct `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

### Data not appearing as expected

**Issue**: The data in Supabase doesn't look right.

**Solution**:

1. Run the script with `--dry-run` and inspect the JSON output in your console.
2. Check that the CSV headers match the script (at minimum **`Job ID`**, **`User ID`**, **`Result`**; plus **`Country`**, **`ID Type`**, and time columns as above). Do not expect **`phone_number`** in the CSV for this migration.
3. Verify date/time values in the CSV parse correctly for `verified_at`.

## Rollback

If you need to undo the migration, you can run a SQL query in the Supabase SQL Editor. Be careful with this operation.

```sql
-- Example: delete rows touched at or after a known migration time (adjust timestamp).
DELETE FROM public.user_kyc_profiles WHERE updated_at >= '2025-12-02 00:00:00+00';
```

It is safer to identify the migrated records by a set of `wallet_address` values if possible.
