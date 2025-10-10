# Environment Variables

This document lists all environment variables required for the Noblocks application.

## Required Environment Variables

### Core Application

```bash
# URL of an aggregator service
NEXT_PUBLIC_AGGREGATOR_URL=https://api.paycrest.io/v1

# Auth services
NEXT_PUBLIC_PRIVY_APP_ID=
NEXT_PUBLIC_THIRDWEB_CLIENT_ID=
```

### Analytics

```bash
# Client-side analytics
# Client-side Mixpanel token
NEXT_PUBLIC_MIXPANEL_TOKEN=
NEXT_PUBLIC_HOTJAR_SITE_ID=

# Server-side analytics (NEW)
# Server-side Mixpanel token
MIXPANEL_TOKEN=
# Privacy mode: "strict" or "normal"
MIXPANEL_PRIVACY_MODE=strict
# Include IP addresses in server analytics
MIXPANEL_INCLUDE_IP=false
# Include error stacks in analytics
MIXPANEL_INCLUDE_ERROR_STACKS=false
# Include emails in client analytics
NEXT_PUBLIC_ENABLE_EMAIL_IN_ANALYTICS=false
```

### Security

```bash
# Internal API Security (NEW)
# Secret for internal API endpoints
INTERNAL_API_KEY=
```

### Feature Flags

```bash
# Feature toggles (NEW)
# Enable wallet context sync in middleware
ENABLE_WALLET_CONTEXT_SYNC=false
```

### Database & Authentication

```bash
# Supabase Database
# Get these from: Supabase Dashboard → Project Settings → API
SUPABASE_URL=https://your-project.supabase.co

# ⚠️ IMPORTANT: Use the SERVICE ROLE key, NOT the anon/public key
# The service role key bypasses Row-Level Security (RLS) policies
# Location: Supabase Dashboard → Project Settings → API → "service_role" secret
# Format: Starts with "eyJ..." and contains "role":"service_role" when decoded
# DO NOT use the "anon public" key here - it will cause RLS policy violations
SUPABASE_SERVICE_ROLE_KEY=

# Privy Authentication
PRIVY_APP_SECRET=
PRIVY_JWKS_URL=
PRIVY_ISSUER=privy.io
```

### External Services

```bash

# SEO
NEXT_PUBLIC_GOOGLE_VERIFICATION_CODE=

# Notice banner
# See docs/notice-banner.md
NEXT_PUBLIC_NOTICE_BANNER_TEXT=

# Brevo Email Marketing
BREVO_API_KEY=
BREVO_LIST_ID=
```

### Campaign Management

```bash
# BlockFest Campaign
# End date for BlockFest cashback offer (ISO 8601 format with timezone)
# Format: YYYY-MM-DDTHH:mm:ss±HH:mm
# Example: 2025-10-11T23:59:00+01:00 (October 11th, 2025 at 11:59 PM UTC+1)
NEXT_PUBLIC_BLOCKFEST_END_DATE=2025-10-11T23:59:00+01:00

# BlockFest Cashback Wallet
# WARNING: These credentials control funds and must be kept secure:
# - Never commit these values to version control
# - Use secure secret management in production (e.g., AWS Secrets Manager, HashiCorp Vault)
# - Rotate keys regularly
# - Restrict access to authorized personnel only
CASHBACK_WALLET_ADDRESS=
CASHBACK_WALLET_PRIVATE_KEY=
```

### Content Management (Sanity)

```bash
# Sanity Studio (server-side)
SANITY_STUDIO_DATASET=production
SANITY_STUDIO_PROJECT_ID=your_project_id_here

# Next.js App (client-side)
NEXT_PUBLIC_SANITY_DATASET=production
NEXT_PUBLIC_SANITY_PROJECT_ID=your_project_id_here
```

## Production Configuration

For production deployment, set these values:

```bash
# Server-side Analytics
MIXPANEL_TOKEN=your_server_mixpanel_token_here
MIXPANEL_PRIVACY_MODE=strict
MIXPANEL_INCLUDE_IP=true
MIXPANEL_INCLUDE_ERROR_STACKS=true

# Internal API Security
INTERNAL_API_KEY=your_strong_random_secret_key_here

# Feature Flags
ENABLE_WALLET_CONTEXT_SYNC=true
NEXT_PUBLIC_ENABLE_EMAIL_IN_ANALYTICS=true
```

## Security Notes

### Supabase Keys
- **`SUPABASE_SERVICE_ROLE_KEY`**: 
  - **CRITICAL**: Must be the service role key, not the anon key
  - The service role key bypasses RLS and should never be exposed to clients
  - Verify by decoding the JWT - it should contain `"role":"service_role"`
  - Using the anon key will cause "row violates row-level security policy" errors
  - Get it from: Supabase Dashboard → Project Settings → API → "service_role" secret

### Other Security
- **`INTERNAL_API_KEY`**: Generate a strong random string (e.g., `openssl rand -hex 32`)
- **`MIXPANEL_TOKEN`**: This is separate from `NEXT_PUBLIC_MIXPANEL_TOKEN` and used for server-side tracking only
- **Privacy Mode**: Keep `MIXPANEL_PRIVACY_MODE=strict` to ensure sensitive data is hashed
- Never commit actual environment values to the repository
