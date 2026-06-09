-- Private bucket for Tier 3 proof-of-address uploads (server uses signed URLs + Dojah).
-- Matches app/api/kyc/tier3-verify/route.ts default when KYC_DOCUMENTS_BUCKET is unset.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'kyc-documents',
  'kyc-documents',
  false,
  5242880,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf'
  ]::text[]
)
ON CONFLICT (id) DO NOTHING;
