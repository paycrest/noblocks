# Environment Variables

This document lists all environment variables used by the Noblocks application. Most variables are optional; required ones depend on which features you want to enable locally.

## Quick Start

1. Copy `.env.example` to `.env.local`:

   ```bash
   cp .env.example .env.local
   ```

2. At minimum, set these variables to run the app:

   - `NEXT_PUBLIC_PRIVY_APP_ID` – Your Privy app ID
   - `SUPABASE_URL` and `SUPABASE_SECRET_KEY` – From Supabase Dashboard
   - `INTERNAL_API_KEY` – Generate with `openssl rand -hex 32`

   `NEXT_PUBLIC_AGGREGATOR_SENDER_API_KEY_ID` is optional for local UI exploration; set it when you need live order creation against the aggregator.

## Variable Reference

### Core Application

```bash
# Aggregator API base URL
NEXT_PUBLIC_AGGREGATOR_URL=https://api.paycrest.io/v1

# Optional: Sender API key UUID (aggregator dashboard). Required for live order creation;
# used by the payment-orders proxy and client for encrypted gateway.createOrder messageHash.
NEXT_PUBLIC_AGGREGATOR_SENDER_API_KEY_ID=

# Local transfer fee configuration (for cNGN -> NGN, etc.)
NEXT_PUBLIC_LOCAL_TRANSFER_FEE_PERCENT=0.1
NEXT_PUBLIC_LOCAL_TRANSFER_FEE_CAP=10000

# KYC tier monthly swap limits (USD). Omitted or empty = use defaults below.
# Tier 3 also accepts "unlimited" (case-insensitive) to remove cap.
# Do not use 0 for unlimited — tier 0 uses 0 to mean "no swaps until phone".
NEXT_PUBLIC_KYC_TIER_0_MONTHLY=0
NEXT_PUBLIC_KYC_TIER_1_MONTHLY=0.5
NEXT_PUBLIC_KYC_TIER_2_MONTHLY=1
NEXT_PUBLIC_KYC_TIER_3_MONTHLY=2
```

### Authentication Services

```bash
# Privy authentication app ID
NEXT_PUBLIC_PRIVY_APP_ID=

# RPC URL provider key
NEXT_PUBLIC_RPC_URL_KEY=

# Privy server-side secrets
PRIVY_APP_SECRET=
PRIVY_JWKS_URL=https://auth.privy.io/api/v1/apps/<your-privy-app-id>/jwks.json
PRIVY_ISSUER=privy.io
```

### Database (Supabase)

```bash
# Get from: Supabase Dashboard → Project Settings → API

# Server URL (required)
SUPABASE_URL=https://your-project.supabase.co

# Server admin secret key (sb_secret_...) — bypasses RLS, keep private!
SUPABASE_SECRET_KEY=

# Optional: Client-only publishable key if adding browser Supabase client later
# NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

### Client Analytics

```bash
NEXT_PUBLIC_MIXPANEL_TOKEN=
NEXT_PUBLIC_HOTJAR_SITE_ID=
NEXT_PUBLIC_ENABLE_EMAIL_IN_ANALYTICS=false
```

### Server-Side Analytics

```bash
MIXPANEL_TOKEN=
MIXPANEL_PRIVACY_MODE=strict        # "strict" or "normal"
MIXPANEL_INCLUDE_IP=false
MIXPANEL_INCLUDE_ERROR_STACKS=false
```

### Client Error Reporting (Optional)

Sentry-compatible ingest (e.g., GlitchTip). Browser-only; no `@sentry/nextjs` plugin required.

```bash
NEXT_PUBLIC_SENTRY_DSN=
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production       # Optional
NEXT_PUBLIC_SENTRY_RELEASE=                     # Optional (default: next build info)
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0         # 0–1; default 0
NEXT_PUBLIC_SENTRY_ENABLE_IN_DEV=false          # Send events from local dev when true
```

### Security

```bash
# Secret for internal API endpoints
# Generate with: openssl rand -hex 32
INTERNAL_API_KEY=
```

### Feature Flags

```bash
# Enable wallet context sync in middleware
ENABLE_WALLET_CONTEXT_SYNC=false

# Starknet Earn (Vesu / Starkzap): wallet Earn CTA, deposit/withdraw, activity tab
NEXT_PUBLIC_EARN_ENABLED=false

# Referral program: show/hide UI and API routes
NEXT_PUBLIC_REFERRAL_ENABLED=true
# Minimum qualifying volume for referral rewards (USD in USDC)
NEXT_PUBLIC_REFERRAL_MIN_QUALIFYING_VOLUME_USD=20
# Reward amount per qualified referral (USD in USDC)
NEXT_PUBLIC_REFERRAL_REWARD_AMOUNT_USD=1

# Bridge/Swap (Convert): cross-chain convert via NEAR Intents + LI.FI
NEXT_PUBLIC_BRIDGE_ENABLED=false
NEAR Intents 1Click API JWT (server-side)
ONE_CLICK_JWT=
LI.FI API key (server-side, optional)
LIFI_API_KEY=
Default slippage tolerance for bridge quotes (basis points; e.g., 50 = 0.5%)
NEXT_PUBLIC_BRIDGE_DEFAULT_SLIPPAGE_BPS=50

# Onramp chained forwarding: crypto settles to user wallet then auto-forward to destination
NEXT_PUBLIC_ONRAMP_CHAINED_FORWARDING_ENABLED=false
```

### External Services

```bash
# SEO verification
NEXT_PUBLIC_GOOGLE_VERIFICATION_CODE=

# Notice banner text (see docs/notice-banner.md)
NEXT_PUBLIC_NOTICE_BANNER_TEXT=

# Maintenance notice modal
# Set to truthy (e.g., "1") to show maintenance overlay; SCHEDULE shows as bold date/time
NEXT_PUBLIC_MAINTENANCE_NOTICE_ENABLED=true
NEXT_PUBLIC_MAINTENANCE_SCHEDULE=Friday, February 13th, from 7:00 PM to 11:00 PM WAT
```

### Content Management (Sanity)

```bash
# Sanity Studio (server-side)
SANITY_STUDIO_DATASET=production
SANITY_STUDIO_PROJECT_ID=your_project_id_here

# Next.js App (client-side)
NEXT_PUBLIC_SANITY_DATASET=production
NEXT_PUBLIC_SANITY_PROJECT_ID=your_project_id_here

# Bundler / EIP-7702 sponsor
NEXT_PUBLIC_BUNDLER_SERVER_URL=
SPONSOR_EVM_WALLET_PRIVATE_KEY=0x...
```

### Email & Communications

```bash
# Brevo Email Marketing
# Get from: Brevo Dashboard → Settings → API Keys
BREVO_API_KEY=
# List ID from: Brevo Dashboard → Contacts → Lists (numeric)
BREVO_LIST_ID=
# Brevo Conversations (chat widget)
NEXT_PUBLIC_BREVO_CONVERSATIONS_ID=
NEXT_PUBLIC_BREVO_CONVERSATIONS_GROUP_ID=
```

### Phone Verification

```bash
# KudiSMS (African phone numbers)
# Get from: KudiSMS Dashboard → Settings → API Keys
KUDISMS_API_KEY=your_kudisms_api_key
KUDISMS_APP_NAME_CODE=your_app_name_code
KUDISMS_TEMPLATE_CODE=your_template_code
KUDISMS_SENDER_ID=Noblocks

# Twilio (international via Verify API)
# Get from: Twilio Console → Account Dashboard
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_VERIFY_SERVICE_SID=VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### KYC Verification Services

#### SmileID (Identity Verification)

```bash
# API base URL — sandbox ("0"), production ("1"), or full URL
SMILE_IDENTITY_BASE_URL="XXXXXX"
SMILE_IDENTITY_API_KEY="your_api_key_here"
SMILE_IDENTITY_PARTNER_ID="your_partner_id_here"
SMILE_ID_CALLBACK_URL=""              # Callback URL for async results
SMILE_IDENTITY_SERVER="0"             # "0" = sandbox, "1" = production
```

#### Dojah (Tier 3 Address / Proof-of-Address)

```bash
DOJAH_APP_ID=<YOUR_APP_ID>
DOJAH_SECRET_KEY=<YOUR_SECRET_KEY>
DOJAH_BASE_URL=https://api.dojah.io

# Optional: Default false — send only input_type + input_value per Dojah docs
# DOJAH_UTILITY_BILL_SEND_ADDRESS_FIELDS=true
# Optional: Default true — retry base64 if URL submission fails (Dojah often can't fetch URLs)
# DOJAH_UTILITY_BILL_BASE64_FALLBACK=false

# Supabase Storage bucket for KYC documents (create in Supabase Dashboard → Storage)
KYC_DOCUMENTS_BUCKET=kyc-documents
```

### Campaign Management

```bash
# BlockFest Campaign End Date
# Format: ISO 8601 with timezone (YYYY-MM-DDTHH:mm:ss±HH:mm)
# Example: 2025-10-11T23:59:00+01:00
NEXT_PUBLIC_BLOCKFEST_END_DATE=2025-10-11T23:59:00+01:00

# BlockFest Cashback Wallet credentials
# ⚠️ WARNING: These control funds — never commit to VCS
# - Use secure secret management (AWS Secrets Manager, Vault, etc.)
# - Rotate keys regularly; restrict access
# - Private key must be 0x + 64 hex chars (66 total)
CASHBACK_WALLET_ADDRESS=
CASHBACK_WALLET_PRIVATE_KEY=
```

## Minimal Setup for Contributors

For a basic local setup without external service credentials:

```bash
cp .env.example .env.local

# Generate internal API key
echo INTERNAL_API_KEY=$(openssl rand -hex 32) >> .env.local

# Add your Privy app ID (get at https://www.privy.io/)
echo NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id >> .env.local

# Add Supabase credentials (from Supabase Dashboard → API Settings)
echo SUPABASE_URL=https://your-project.supabase.co >> .env.local
echo SUPABASE_SECRET_KEY=your_sb_secret_key >> .env.local
```

Then run `pnpm install && pnpm dev`. The app will start with limited functionality (no real transactions or verification), but you can explore the UI.

## Production Configuration Notes

For production deployment, ensure these values are set:

```bash
# Privacy settings
MIXPANEL_PRIVACY_MODE=strict
MIXPANEL_INCLUDE_IP=true           # Optional: track IPs for analytics
MIXPANEL_INCLUDE_ERROR_STACKS=true # Optional: include error details

# Feature toggles
ENABLE_WALLET_CONTEXT_SYNC=true
NEXT_PUBLIC_EARN_ENABLED=false     # Or true if enabled
NEXT_PUBLIC_BRIDGE_ENABLED=false   # Or true if enabled
NEXT_PUBLIC_REFERRAL_ENABLED=true

# Sensing performance traces in prod (optional)
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.1
```

## Security Best Practices

1. **Secret Keys**: Never commit `.env.local` or actual secret values to version control
2. **Privy Secrets**: `PRIVY_APP_SECRET` controls wallet operations — protect it
3. **Supabase Secret Key**: `SUPABASE_SECRET_KEY` bypasses RLS — only expose server-side
4. **Wallet Private Keys**: `CASHBACK_WALLET_PRIVATE_KEY`, `SPONSOR_EVM_WALLET_PRIVATE_KEY` control funds — use vaulted secrets in CI/CD
5. **Internal API Key**: All internal endpoints require this — generate randomly and rotate periodically
6. **SmileID/Dojah**: Treat as any third-party API credential — never commit raw values

## Related Documentation

- [Authentication](authentication.md) – Privy and Supabase auth flow details
- [Notice Banner](notice-banner.md) – Configuring in-app notices
- [Wallet Integration](wallet-integration.md) – Supported wallets and detection logic
