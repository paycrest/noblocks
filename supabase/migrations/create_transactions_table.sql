create table transactions (
  id uuid default gen_random_uuid() primary key,
  wallet_address text not null,
  transaction_type text not null,
  from_currency text not null,
  to_currency text not null,
  amount_sent numeric not null,
  amount_received numeric not null,
  fee numeric not null,
  recipient jsonb not null,
  status text not null,
  memo text,
  tx_hash text,
  time_spent text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create index on wallet_address for faster queries
create index idx_transactions_wallet_address on transactions(wallet_address);

-- Create index on created_at for sorting
create index idx_transactions_created_at on transactions(created_at desc);

-- Enable Row Level Security
alter table transactions enable row level security;

-- Create policy to allow users to read their own transactions
create policy "Users can read own transactions"
  on transactions for select
  using (wallet_address = current_user);

-- Create policy to allow users to insert their own transactions
create policy "Users can insert own transactions"
  on transactions for insert
  with check (wallet_address = current_user);

-- Create policy to allow users to update their own transactions
create policy "Users can update own transactions"
  on transactions for update
  using (wallet_address = current_user);