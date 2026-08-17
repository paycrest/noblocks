-- Canonical ID-document key on user_kyc_profiles.
--
-- `resolveIdentityScope` finds the wallets sharing a verified identity by
-- matching the ID triple with exact equality:
--
--   .eq("id_country", …).eq("id_type", …).eq("id_number", …)
--
-- but those columns store raw input (app/api/kyc/smile-id/route.ts falls back to
-- the client-supplied id_number when the provider does not return one). Two
-- profiles backed by the *same document* can therefore differ by case or
-- whitespace — "NG:passport:A 123 456" vs "ng:PASSPORT:a123456" — and fail to
-- match. Every consumer of the scope inherits that:
--
--   * the monthly spend pool (20260726120000) — siblings get separate allowances
--   * the BlockFest cashback pool (20260804120000) — same
--   * the advisory lock keys, which are built from the same raw values, so two
--     siblings serialize on *different* locks and the check-then-insert race the
--     quota function exists to close reopens
--   * the identity-level self-referral guard in app/api/referral/claim/route.ts,
--     which is why this surfaced: the guard can miss a referrer that is really
--     the referee's own sibling wallet
--
-- Phone is unaffected — app/api/phone/verify-otp/route.ts writes E.164, so that
-- dimension is already canonical.
--
-- NOT changed here: the per-document uniqueness checks on the KYC write path
-- (app/api/kyc/smile-id/route.ts and .../callback/route.ts) still compare the raw
-- triple. Pointing those at this column would tighten enrollment — profiles that
-- verify today could start colliding — which is a KYC-behaviour change that does
-- not belong in a referral fix. Tracked separately; the pooling above is what
-- bounds the abuse in the meantime, since a wider pool only ever shares one
-- allowance.
--
-- A GENERATED column rather than a written one: it cannot drift from the raw
-- columns, needs no backfill (Postgres computes it for existing rows), and
-- cannot be set incorrectly by a future writer. The expression is built only
-- from IMMUTABLE functions (upper/btrim/regexp_replace), as generated columns
-- require. It must stay in sync with `buildIdentityIdKey` in
-- app/lib/kyc-identity.ts and with the referral fingerprint backfill in
-- 20260730120000.
--
-- NOTE: adding a STORED generated column rewrites the table under ACCESS
-- EXCLUSIVE. user_kyc_profiles is small (one row per KYC'd wallet), so this is
-- brief, but it is not a zero-lock migration.
--
-- ORDERING: this migration is additive, but unlike the rest of the PR the new
-- application code does NOT work against the pre-migration schema —
-- `resolveIdentityScope` filters on `identity_id_key`, so a deploy that ships the
-- code before this runs would 400 on every sibling lookup, and every caller
-- fails closed. Apply this migration BEFORE deploying. Old code keeps working
-- against the post-migration schema (it just ignores the new column), so the
-- reverse order is the safe one.
--
-- DEPLOY WINDOW: this changes the advisory-lock key format from the raw triple
-- to the canonical one. While old and new application versions run side by side,
-- two siblings could take different lock keys and briefly lose serialization
-- against each other. The window is one deploy, and it only restores the
-- pre-existing behaviour rather than making anything worse.

ALTER TABLE public.user_kyc_profiles
  ADD COLUMN IF NOT EXISTS identity_id_key TEXT
  GENERATED ALWAYS AS (
    CASE
      WHEN id_country IS NOT NULL
       AND id_type    IS NOT NULL
       AND id_number  IS NOT NULL
      -- [[:space:]] is space, tab, newline, vertical tab, form feed, carriage
      -- return — and nothing else. Deliberately NOT btrim(), which strips only
      -- spaces unless given a second argument, and deliberately applied to the
      -- whole string rather than the ends so internal spacing collapses too.
      -- `normalizeIdPart` in app/lib/kyc-identity.ts strips exactly this set;
      -- JS `\s`/`trim()` would additionally match NBSP and the Unicode space
      -- separators, which Postgres would leave in place, so one identity would
      -- canonicalize to two different keys.
      THEN regexp_replace(upper(id_country), '[[:space:]]', '', 'g') || ':'
           || regexp_replace(upper(id_type),   '[[:space:]]', '', 'g') || ':'
           || regexp_replace(upper(id_number), '[[:space:]]', '', 'g')
    END
  ) STORED;

COMMENT ON COLUMN public.user_kyc_profiles.identity_id_key IS
  'Canonical form of the (id_country, id_type, id_number) triple: uppercased, '
  'trimmed, whitespace stripped from the number. Generated, never written '
  'directly. Sibling matching and advisory locks key on this so two spellings of '
  'one document resolve to one identity.';

-- Sibling lookups filter on this column; partial because a profile without a
-- full ID triple generates NULL and is never matched on.
CREATE INDEX IF NOT EXISTS user_kyc_profiles_identity_id_key_idx
  ON public.user_kyc_profiles (identity_id_key)
  WHERE identity_id_key IS NOT NULL;
