create or replace function public.increment_kyc_attempts(
  p_wallet_address text,
  p_max_attempts integer default 3
)
returns integer
language plpgsql
as $$
declare
  v_attempts integer;
begin
  update public.user_kyc_profiles
  set attempts = attempts + 1
  where wallet_address = p_wallet_address
    and attempts < p_max_attempts
  returning attempts into v_attempts;

  return v_attempts;
end;
$$;
