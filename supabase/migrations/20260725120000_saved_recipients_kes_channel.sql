-- Add KES M-Pesa channel + Paybill business number to saved recipients.
-- Unique key includes channel so Send Money / Till / Paybill can share SAFAKEPC + same identifier.

alter table public.saved_recipients
  add column if not exists channel text not null default '',
  add column if not exists business_number text;

alter table public.saved_recipients
  drop constraint if exists unique_wallet_recipient;

drop index if exists unique_wallet_recipient_with_channel;

alter table public.saved_recipients
  add constraint unique_wallet_recipient
  unique (normalized_wallet_address, institution_code, account_identifier, channel);
