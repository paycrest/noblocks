-- Define the encrypt_recipient_data / decrypt_recipient_data RPCs that
-- app/lib/encryption.ts has called since the module was added, but which no
-- migration in this repository ever created. Without them the module only works
-- against a database where someone defined the functions by hand, and nothing
-- in git says what they do, so an ENCRYPTION_KEY rotation has no contract to
-- rotate against.
--
-- Contract (argument names are what PostgREST matches on, so the TS callers in
-- app/lib/encryption.ts and scripts/reencrypt-encryption-key.ts depend on them):
--
--   encrypt_recipient_data(recipient_json text, encryption_key text) -> text
--     pgp_sym_encrypt of the JSON string under the passphrase, base64 encoded.
--     Each call picks a fresh random session key and salt, so encrypting the
--     same input twice gives different ciphertext. Compare by decrypting, never
--     by comparing ciphertext.
--
--   decrypt_recipient_data(encrypted_data text, encryption_key text) -> text
--     Inverse. Raises "Wrong key or corrupt data" when the passphrase does not
--     match; the TS side treats that message as the signal to try the
--     fallback key. Any other error is surfaced unchanged.
--
-- Both are STRICT (null in -> null out) and run with a pinned search_path so a
-- caller cannot shadow pgp_sym_* through their own search_path. pgcrypto lives
-- in `extensions` on hosted Supabase and in `public` on a plain local Postgres;
-- both are on the pinned path.
--
-- Only the service role may execute them: the app talks to Postgres with the
-- secret key, and exposing a function that returns plaintext for any passphrase
-- to anon/authenticated would be an oracle for guessing the key.
--
-- Storage: no table in this repository has a ciphertext column yet
-- (saved_recipients stores name/institution/account_identifier in plaintext).
-- This migration deliberately adds none. See scripts/reencrypt-encryption-key.md
-- for how the rotation script behaves until one exists.

create extension if not exists pgcrypto;

create or replace function public.encrypt_recipient_data(
  recipient_json text,
  encryption_key text
)
returns text
language sql
strict
volatile
security invoker
set search_path = public, extensions
as $$
  select encode(pgp_sym_encrypt(recipient_json, encryption_key), 'base64');
$$;

create or replace function public.decrypt_recipient_data(
  encrypted_data text,
  encryption_key text
)
returns text
language sql
strict
stable
security invoker
set search_path = public, extensions
as $$
  select pgp_sym_decrypt(decode(encrypted_data, 'base64'), encryption_key);
$$;

revoke all on function public.encrypt_recipient_data(text, text) from public;
revoke all on function public.decrypt_recipient_data(text, text) from public;
revoke all on function public.encrypt_recipient_data(text, text) from anon, authenticated;
revoke all on function public.decrypt_recipient_data(text, text) from anon, authenticated;
grant execute on function public.encrypt_recipient_data(text, text) to service_role;
grant execute on function public.decrypt_recipient_data(text, text) to service_role;

comment on function public.encrypt_recipient_data(text, text) is
  'pgp_sym_encrypt(recipient_json, encryption_key) as base64. Called by app/lib/encryption.ts. Service role only.';
comment on function public.decrypt_recipient_data(text, text) is
  'pgp_sym_decrypt(decode(encrypted_data, base64), encryption_key). Raises "Wrong key or corrupt data" on key mismatch. Service role only.';
