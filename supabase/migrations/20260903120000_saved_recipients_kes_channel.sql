-- Add KES M-Pesa channel + Paybill business number to saved recipients.
-- The unique key includes both, so Send Money / Till / Paybill can share SAFAKEPC with
-- the same identifier, and two Paybills can share a reference under different businesses
-- (e.g. "INV-001" billed by 400200 and by 888880) without collapsing into one recipient.

alter table public.saved_recipients
  add column if not exists channel text not null default '',
  add column if not exists business_number text not null default '';

-- business_number must never be NULL: Postgres treats NULLs as distinct in a unique
-- constraint, so nullable values here would stop every non-Paybill recipient from
-- deduping. Normalize in case an earlier revision of this migration added it nullable.
update public.saved_recipients
  set business_number = ''
  where business_number is null;

alter table public.saved_recipients
  alter column business_number set default '',
  alter column business_number set not null;

alter table public.saved_recipients
  drop constraint if exists unique_wallet_recipient;

drop index if exists unique_wallet_recipient_with_channel;

alter table public.saved_recipients
  add constraint unique_wallet_recipient
  unique (normalized_wallet_address, institution_code, account_identifier, channel, business_number);
