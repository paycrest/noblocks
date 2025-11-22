
-- Create user_kyc_profiles table for managing user KYC and verification
CREATE TABLE user_kyc_profiles (
  wallet_address TEXT PRIMARY KEY,
  wallet_signature TEXT,
  phone_number TEXT NOT NULL,
  name TEXT,
  otp_code TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMP WITH TIME ZONE,
  smile_job_id TEXT,
  id_info JSONB,
  image_links JSONB,
  tier INTEGER DEFAULT 0 CHECK (tier IN (0, 1, 2)),
  provider TEXT CHECK (provider IN ('termii', 'twilio')),
  attempts INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX idx_user_kyc_profiles_phone ON user_kyc_profiles(phone_number);
CREATE INDEX idx_user_kyc_profiles_verified ON user_kyc_profiles(verified);
CREATE INDEX idx_user_kyc_profiles_tier ON user_kyc_profiles(tier);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_kyc_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_user_kyc_profiles_updated_at
  BEFORE UPDATE ON user_kyc_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_user_kyc_profiles_updated_at();

-- Add RLS (Row Level Security) policies
ALTER TABLE user_kyc_profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own KYC profile (based on wallet address)
-- Note: This assumes wallet_address is available in the JWT token or session
CREATE POLICY "Users can manage their own KYC profile" ON user_kyc_profiles
  FOR ALL USING (wallet_address = current_setting('app.wallet_address', true));

-- Policy: Service role can access all records (for API operations)
CREATE POLICY "Service role can access all user KYC profiles" ON user_kyc_profiles
  FOR ALL TO service_role USING (true);
