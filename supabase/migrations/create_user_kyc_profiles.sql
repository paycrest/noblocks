-- Create user_kyc_profiles table for managing user KYC and verification

create table public.user_kyc_profiles (
    wallet_address text not null,
    user_id text null,
    phone_number text null,
    email_address text null,
    full_name text null,
    date_of_birth date null,
    id_type text null,
    id_number text null,
    id_country text null,
    address_street text null,
    address_city text null,
    address_state text null,
    address_country text null,
    address_postal_code text null,
    business_name text null,
    platform jsonb null default '[]'::jsonb,
    otp_code text null,
    expires_at timestamp with time zone null,
    provider text null,
    attempts integer null default 0,
    tier integer null default 0,
    verified boolean null default false,
    verified_at timestamp with time zone null,
    created_at timestamp with time zone null default now(),
    updated_at timestamp with time zone null default now(),
    constraint user_kyc_profiles_pkey primary key (wallet_address),
    constraint user_kyc_profiles_provider_check check (
        (
            provider = any (
                array[
                    'kudisms'::text,
                    'twilio'::text
                ]
            )
        )
    ),
    constraint user_kyc_profiles_tier_check check (
        (
            tier = any (array[0, 1, 2, 3, 4])
        )
    )
) TABLESPACE pg_default;

-- Create indexes for faster lookups
create index IF not exists idx_user_kyc_profiles_tier on public.user_kyc_profiles using btree (tier) TABLESPACE pg_default;

create index IF not exists idx_user_kyc_profiles_id_number on public.user_kyc_profiles using btree (id_number) TABLESPACE pg_default;

create index IF not exists idx_user_kyc_profiles_platform on public.user_kyc_profiles using gin (platform) TABLESPACE pg_default;

create index IF not exists idx_user_kyc_profiles_user_id on public.user_kyc_profiles using btree (user_id) TABLESPACE pg_default;

create index IF not exists idx_user_kyc_profiles_phone on public.user_kyc_profiles using btree (phone_number) TABLESPACE pg_default;

create index IF not exists idx_user_kyc_profiles_email on public.user_kyc_profiles using btree (email_address) TABLESPACE pg_default;

create index IF not exists idx_user_kyc_profiles_verified on public.user_kyc_profiles using btree (verified) TABLESPACE pg_default;

create trigger update_user_kyc_profiles_updated_at BEFORE
update on user_kyc_profiles for EACH row
execute FUNCTION update_user_kyc_profiles_updated_at ();