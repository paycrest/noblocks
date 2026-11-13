# ENCRYPTION_KEY rotation runbook

How to replace the passphrase behind `encrypt_recipient_data` /
`decrypt_recipient_data` without losing any stored recipient data.

Ticket: [KAN-876](https://paycrest-io.atlassian.net/browse/KAN-876).

## What exists today

| Piece | Where | State |
|-------|-------|-------|
| RPC definitions | `supabase/migrations/20261015130000_recipient_encryption_rpcs.sql` | pgcrypto `pgp_sym_encrypt` / `pgp_sym_decrypt`, base64 text, service role only |
| App module | `app/lib/encryption.ts` | Encrypts with `ENCRYPTION_KEY`; decrypts with `ENCRYPTION_KEY`, then `ENCRYPTION_KEY_FALLBACK` |
| Rotation script | `scripts/reencrypt-encryption-key.ts` | Dry run by default, `--execute` to write, batch + resume, idempotent |
| Ciphertext column | none | `saved_recipients` stores `name`, `institution`, `account_identifier` in plaintext |

Because no table in this repository has a ciphertext column yet, the script
currently reports `0 rows` and exits 0. That is the expected result today. The
procedure below is what to run once the app starts writing ciphertext (default
target `saved_recipients.encrypted_payload`; override with `--table` and
`--column`).

Before this ticket the two RPCs existed only on the live database, created by
hand. The migration uses `create or replace`, so applying it to such a
database replaces the hand-made definitions with the committed ones. Diff the
live definitions first (step 0) so nothing is silently changed.

## Rules

- Never print, paste, or commit a key. Read keys from a secret manager into
  the shell environment of the machine running the script and nowhere else.
- Never run `--execute` against production without a verified backup from the
  same day.
- The script never logs plaintext or keys. Its output is row ids and outcome
  names only; it is safe to attach to the ticket.
- Every step is reversible until step 7. Keep the old key available until
  then.

## Procedure

### 0. Inspect the live RPCs (one-off, first rotation only)

```sql
select pg_get_functiondef('public.encrypt_recipient_data(text, text)'::regprocedure);
select pg_get_functiondef('public.decrypt_recipient_data(text, text)'::regprocedure);
```

If the live bodies differ from the migration (different cipher, no base64,
different argument names), stop and reconcile before applying the migration.
If the functions do not exist, the migration simply creates them.

### 1. Back up

Take a Supabase backup (Dashboard, Database, Backups) or `pg_dump` the table
that holds the ciphertext. Record the backup id on the ticket.

### 2. Apply the migration

```bash
supabase db push
```

Confirm with the step 0 queries that the committed bodies are now live.

### 3. Generate the new key

```bash
openssl rand -base64 48
```

Store it in the secret manager as the new `ENCRYPTION_KEY`. Do not echo it.

### 4. Deploy the fallback

Set, on every app environment that reads recipient ciphertext:

```
ENCRYPTION_KEY=<new key>
ENCRYPTION_KEY_FALLBACK=<old key>
```

Deploy. From this point new writes use the new key and reads succeed under
either key. Rows encrypted under the old key are still readable, so the app
keeps working while the script runs, however long that takes.

### 5. Dry run

From the repository root, on Node 22 or later (the `@supabase/supabase-js`
pinned in `scripts/pnpm-lock.yaml` needs the native WebSocket that Node 22
ships; Node 20 fails at client construction), with the script dependencies
installed (`pnpm --dir scripts install` if `tsx` is not already available):

```bash
OLD_ENCRYPTION_KEY=<old key> \
NEW_ENCRYPTION_KEY=<new key> \
SUPABASE_URL=<project url> \
SUPABASE_SECRET_KEY=<secret key> \
pnpm rotate:encryption-key
```

The script first proves both RPCs exist and that the two keys are distinct by
sealing and opening a synthetic probe. It then classifies every non-null row:

| Outcome | Meaning |
|---------|---------|
| `already_new` | Decrypts under the new key; untouched |
| `would_reencrypt` | Decrypts under the old key; will be rewritten by `--execute` |
| `unreadable` | Decrypts under neither key; investigate before continuing |
| `error` | RPC or transport failure on that row |

Expected output today: `0 rows: nothing to do`, exit 0. Stop here until a
ciphertext column exists.

Any `unreadable` row makes the exit code 1. Those rows were encrypted under
some third key (or are corrupt) and need a decision before `--execute`; the
script will not touch them either way.

### 6. Execute

```bash
... pnpm rotate:encryption-key --execute --batch-size 100
```

Per row the script decrypts under the old key, encrypts under the new one,
decrypts the result again and compares it to the original before writing. The
write is a compare-and-swap on the previous ciphertext: a row the app rewrote
in the meantime is reported as `concurrent_change` and left for the next run.

Progress (`lastId`) is saved to `scripts/output/reencrypt-encryption-key.state.json`
after every batch. If the run is interrupted:

```bash
... pnpm rotate:encryption-key --execute --resume
```

or, equivalently, run again without `--resume`. Rows already under the new key
are skipped, so re-running from the start is safe, just slower.

Useful flags: `--max-rows 50` to trial a small slice first; `--after <id>` to
start from a known id; `--table` / `--column` if the ciphertext lives
elsewhere.

### 7. Verify

Run the dry run again. Expect every scanned row as `already_new` and exit 0:

```bash
... pnpm rotate:encryption-key
```

Then exercise the app path that reads recipient ciphertext on staging with the
fallback removed locally (`ENCRYPTION_KEY_FALLBACK` unset) to confirm nothing
depends on the old key.

### 8. Remove the fallback

Unset `ENCRYPTION_KEY_FALLBACK` on every environment and deploy. Retire the old
key from the secret manager after the retention period your backup policy
requires (a backup taken before step 6 can only be read with the old key).

## Rollback

- Before step 6: unset the new values, restore the old `ENCRYPTION_KEY`,
  deploy. Nothing stored has changed.
- During or after step 6: keep both keys deployed (step 4 state). Every row is
  readable under one of them, so there is no need to undo the rewrite. Rows
  can be rotated back by swapping `OLD_ENCRYPTION_KEY` and
  `NEW_ENCRYPTION_KEY` and running `--execute` again.
- Data loss is only possible if the old key is discarded before step 7
  confirms every row reads under the new one.

## Open questions

1. **Live-only RPCs.** The RPCs were called by `app/lib/encryption.ts` but
   never defined in git. Whether a hand-made version exists on the hosted
   project, and what it does, must be checked (step 0) before the migration is
   pushed. If the live version used a different encoding or cipher, existing
   ciphertext (if any) would need a one-off conversion rather than this
   rotation.
2. **No ciphertext column.** `saved_recipients` is plaintext. This PR
   deliberately adds no column; the script discovers `encrypted_payload` at
   run time and reports `0 rows` until it exists. When the app starts
   encrypting, add the column (nullable `text` holding the RPC's base64, or
   `bytea`; the script handles both), point the script at it, and this runbook
   applies unchanged.
3. **Orphaned callers.** Nothing in `app/` calls `encryptRecipientData` or
   `decryptRecipientData` yet. The fallback logic is therefore exercised only
   by `__tests__/encryptionKeyRotation.test.ts` until a caller appears.
