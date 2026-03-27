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

Place a CSV file named `kyc-data.csv` inside the `scripts/` directory. The script expects the file to have a header row with column names that match the `CsvRow` interface in the script.

**Expected CSV Columns:**
- `user_id` (maps to `wallet_address`)
- `id_type`
- `country`

## Usage

### Dry Run (Recommended First)

To preview the data that will be inserted without writing anything to the database, run:

```bash
npx ts-node scripts/migrate-kyc-data.ts --dry-run
```

This command will:
- Read and parse `kyc-data.csv`.
- Transform the first 5 records into the database format.
- Print the transformed data to the console.
- **It will NOT write any data to Supabase.**

### Full Migration

Once you have verified that the dry run output is correct, you can perform the full migration:

```bash
npx ts-node scripts/migrate-kyc-data.ts
```

This command will:
1. Read all records from `kyc-data.csv`.
2. Transform each record to match the `user_kyc_profiles` schema.
3. Upsert each record into the Supabase table, using `wallet_address` to handle conflicts.

## How It Works

### 1. Extraction
- The script reads the `kyc-data.csv` file from the `scripts/` directory.
- It uses the `csv-parse` library to parse the file into an array of JavaScript objects.

### 2. Transformation
For each row in the CSV:
- It maps the CSV columns to the fields in the `user_kyc_profiles` table.
- `user_id` from the CSV is used as the `wallet_address`.
- It defaults to `tier: 2` for all migrated users.

### 3. Loading
- The script connects to your Supabase instance using the service role key.
- It iterates through the transformed records and uses `supabase.from('user_kyc_profiles').upsert(...)` to insert or update each one.
- The `onConflict: 'wallet_address'` option ensures that existing records are updated, preventing duplicates.

## Data Mapping

| CSV Column     | New Schema Field   | Notes                                      |
|----------------|--------------------|--------------------------------------------|
| `user_id`      | `wallet_address`   | Primary key, lowercased for consistency.   |
| `id_type`      | `id_type`          |                                            |
| `country`    | `id_country`         |                                            |
| `smile_job_id` | `smile_job_id`     |                                            |
| `verified_at`  | `verified_at`      | Also sets `verified` to `true`.            |
| -              | `tier`             | Hardcoded to `2` for all records.          |

## Troubleshooting

### `CSV file not found`
**Issue**: The script throws an error `CSV file not found at: <path>`.
**Solution**: Make sure your CSV file is named exactly `kyc-data.csv` and is located in the `/Users/prof/Documents/paycrest/noblocks/scripts/` directory.

### `Missing Supabase credentials`
**Issue**: The script throws an error about missing credentials.
**Solution**: Ensure your `.env` file is in the root of the `noblocks` project and contains the correct `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

### Data not appearing as expected
**Issue**: The data in Supabase doesn't look right.
**Solution**:
1. Run the script with `--dry-run` and inspect the JSON output in your console.
2. Check that the column headers in your `kyc-data.csv` file exactly match the expected names (e.g., `user_id`, `phone_number`).
3. Verify the data formats in the CSV (e.g., dates in `verified_at` are valid).

## Rollback

If you need to undo the migration, you can run a SQL query in the Supabase SQL Editor. Be very careful with this operation.

```sql
-- Example: Delete records that were created or updated by the script.
-- You might need to adjust the timestamp to match your migration time.
DELETE FROM public.user_kyc_profiles WHERE updated_at >= '2025-12-02 00:00:00+00';
```

It is safer to identify the migrated records by a set of `wallet_address` values if possible.
