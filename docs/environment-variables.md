# Environment Variables

This document explains the environment variables used by the Noblocks application. Most variables are optional; required ones depend on which features you want to enable locally.

[`.env.example`](../.env.example) is the canonical list — `__tests__/envDocumentation.test.ts` fails CI when it drifts from the variables the code reads. This document is the prose companion and is not machine-checked, so treat `.env.example` as the authority if the two ever disagree.

## Quick Start

1. Copy `.env.example` to `.env.local`:

   ```bash
   cp .env.example .env.local
   ```

2. At minimum, set these variables to run the app:

   - `NEXT_PUBLIC_PRIVY_APP_ID` – Your Privy app ID
   - `SUPABASE_URL` and `SUPABASE_SECRET_KEY` – From Supabase Dashboard
   - `INTERNAL_API_KEY` – Generate with `openssl rand -hex 32`
   - `NEXT_PUBLIC_STARKNET_RPC_URL` – A Starknet JSON-RPC endpoint. `app/lib/starknet.ts` throws when it is missing, so any page that touches Starknet fails without it.

   `AGGREGATOR_SENDER_API_KEY_ID` (server-only — never `NEXT_PUBLIC_`) is optional for local UI exploration; set it when you need live order creation against the aggregator.

## Variable Reference

### Core Application

```bash
# Aggregator API base URL
NEXT_PUBLIC_AGGREGATOR_URL=https://api.paycrest.io/v1

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

# RPC URL provider key (Dwellir) — see "Keys that ship to the browser" below
NEXT_PUBLIC_RPC_URL_KEY=

# Starknet JSON-RPC endpoint. Required — app/lib/starknet.ts throws when unset
NEXT_PUBLIC_STARKNET_RPC_URL=

# Privy server-side secrets
PRIVY_APP_SECRET=
PRIVY_JWKS_URL=https://auth.privy.io/api/v1/apps/<your-privy-app-id>/jwks.json
PRIVY_ISSUER=privy.io
# Optional: Privy wallet API base (defaults to https://api.privy.io)
PRIVY_WALLET_API_URL=
# Optional: authorization key for Privy wallet API calls (Starknet key export).
# When unset, only the user signature is sent.
PRIVY_WALLET_AUTH_PRIVATE_KEY=
```

### Database (Supabase)

```bash
# Get from: Supabase Dashboard → Project Settings → API

# Server URL (required)
SUPABASE_URL=https://your-project.supabase.co

# Server admin secret key (sb_secret_...) — bypasses RLS, keep private!
SUPABASE_SECRET_KEY=

# Passphrase for the encrypt_recipient_data / decrypt_recipient_data Postgres
# functions protecting saved recipient details. Rotating it makes existing
# encrypted rows unreadable.
ENCRYPTION_KEY=
```

There is no `NEXT_PUBLIC_SUPABASE_URL`: `app/lib/supabase.ts` reads `SUPABASE_URL` only, and the client never talks to Supabase directly.

### Client Analytics

```bash
NEXT_PUBLIC_MIXPANEL_TOKEN=
NEXT_PUBLIC_HOTJAR_SITE_ID=
NEXT_PUBLIC_ENABLE_EMAIL_IN_ANALYTICS=false
```

### Datadog RUM (Real User Monitoring)

Browser-only session monitoring on the EU site (`datadoghq.eu`). Initialized only after the user accepts analytics cookies (same gate as Mixpanel/Hotjar). Disabled on `/widget` embeds.

Create a RUM application in [Datadog EU](https://app.datadoghq.eu/rum/list) and copy the application ID and client token.

```bash
NEXT_PUBLIC_DD_APPLICATION_ID=
NEXT_PUBLIC_DD_CLIENT_TOKEN=
NEXT_PUBLIC_DD_SITE=datadoghq.eu
NEXT_PUBLIC_DD_SERVICE=noblocks
NEXT_PUBLIC_DD_ENV=production
NEXT_PUBLIC_DD_VERSION=                     # Optional (e.g. git SHA from CI)
NEXT_PUBLIC_DD_RUM_SAMPLE_RATE=100          # 0–100
NEXT_PUBLIC_DD_SESSION_REPLAY_SAMPLE_RATE=100 # 0–100; % of RUM sessions that record Session Replay
NEXT_PUBLIC_DD_ENABLE_IN_DEV=false          # Send RUM from local dev when true
```

### Datadog Server-Side APM and Logs

Server-side tracing (`instrumentation.ts`) and structured JSON logging (`app/lib/logger.ts`). Neither talks to Datadog directly — see [OBSERVABILITY.md](../OBSERVABILITY.md) for the deployment.

The two take different routes, which matters when debugging one of them:

| Signal | How it leaves the app | Behaviour with no agent running |
| --- | --- | --- |
| Traces | Sent to the agent over `DD_AGENT_HOST:8126` | Dropped |
| Logs | Written as JSON to **stdout**; the agent collects the container's output | Still printed — visible in `docker logs` |

**The app does not need `DD_API_KEY`.** Only the agent holds the key, in `.env.datadog` (template: `.env.datadog.example`). Adding an API key to the app's environment is unnecessary and widens its blast radius.

```bash
DD_SERVICE=noblocks
DD_ENV=production
DD_VERSION=                                 # Set from the git SHA in CI
DD_AGENT_HOST=datadog-agent                 # Agent container name on the Docker network
DD_TRACE_AGENT_PORT=8126
DD_TRACE_ENABLED=true                       # "false" disables APM; read once at startup, so it needs a restart
LOG_LEVEL=info                              # pino level: trace|debug|info|warn|error|fatal
```

Locally the tracer defaults to `localhost:8126` and is harmless with no agent running — traces are dropped, and logs still print as JSON.

> **Note on `console`:** `next.config.mjs` strips `console.log` from production builds (`warn`/`error`/`info` are preserved). Anything that must be queryable in Datadog should go through `app/lib/logger.ts`, which emits JSON with `dd.trace_id` for trace correlation.

### Server-Side Analytics

Powers `app/lib/server-analytics.ts`, which instruments every API route. With no token set, those events are dropped silently.

Mixpanel's server token **is** the project token, so this is usually the same value as `NEXT_PUBLIC_MIXPANEL_TOKEN` — which is accepted as a fallback. Set `MIXPANEL_SERVER_TOKEN` explicitly if you want server events in a separate project.

```bash
MIXPANEL_SERVER_TOKEN=              # Falls back to NEXT_PUBLIC_MIXPANEL_TOKEN
MIXPANEL_PRIVACY_MODE=strict        # "strict" or "normal"
MIXPANEL_INCLUDE_IP=false
MIXPANEL_INCLUDE_ERROR_STACKS=false
```

Defaults are privacy-safe when unset: wallet addresses and transaction IDs are always hashed, and IPs are hashed and error stacks dropped unless you opt in above.

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

# Server-only: Sender API key UUID (aggregator dashboard). Used by the
# /api/v1/payment-orders* routes (API-Key header + encrypted offramp messageHash).
# Never NEXT_PUBLIC_ — it must not reach the browser. Rotate it in the aggregator
# dashboard if it was ever exposed in a client bundle.
AGGREGATOR_SENDER_API_KEY_ID=
```

### Injected-Wallet Session Auth (SIWE)

Required whenever injected wallets are used (`/widget?injected=true|bridge`,
or an extension wallet on the main app). Without it, wallet sign-in fails with
a `500` and every injected API action — phone verification, KYC, order
creation — is blocked.

```bash
# HMAC secret for injected-wallet session JWTs minted by
# /api/auth/injected/verify and verified by the middleware (x-injected-token).
# Generate with: openssl rand -hex 32
INJECTED_SESSION_SECRET=

# Canonical public origin of this deployment (e.g. https://noblocks.xyz).
# SIWE messages must name this host (or an allowed embed origin) — configured,
# never derived from the request Host header, so a signature phished on another
# domain can't mint a session here.
#
# Read on the server only (app/lib/server-config.ts → getAppUrl). The legacy
# NEXT_PUBLIC_APP_URL still works as a fallback; prefer APP_URL.
APP_URL=http://localhost:3000
```

- **Minimum 32 characters.** The check runs lazily — when a token is actually
  signed or verified, never at boot — so a missing or too-short value does not
  fail the deploy. It surfaces later as a failed sign-in (`500`) and rejected
  tokens. `openssl rand -hex 32` gives 64 hex chars.
- **Must be identical across every instance** of a deployment. The API route
  (Node) mints the JWT and the middleware (Edge) verifies it, so both runtimes
  need the same value; mismatched replicas reject each other's tokens.
- **Set it per environment** (production, staging, preview). Distinct values
  per environment are good practice — a staging token must not work in prod.
- **Never commit it.** Set it in your hosting platform's environment/secret
  settings, not in a tracked file.
- **Rotating it invalidates all live sessions.** Cost is low: users re-sign
  once, and tokens only last an hour anyway.
- `APP_URL` must match the deployment's real public origin. If it
  still says `localhost:3000` in a deployed environment, sign-in fails with
  `401 Sign-in domain is not allowed` (embedded widgets additionally need the
  partner origin in `EMBED_ALLOWED_ORIGINS` or the `embed_allowed_origins`
  table).

### Feature Flags

```bash
# Enable wallet context sync in middleware
ENABLE_WALLET_CONTEXT_SYNC=false

# Starknet Earn (Vesu / Starkzap): wallet Earn CTA, deposit/withdraw, activity tab
NEXT_PUBLIC_EARN_ENABLED=false
# AVNU paymaster key — required whenever Starknet Earn is on, since the
# paymaster runs in "sponsored" mode and throws without it
STARKNET_PAYMASTER_API_KEY=
# Gas token address; only used in non-sponsored mode (defaults to the first
# token the paymaster reports as supported)
STARKNET_GAS_TOKEN_ADDRESS=

# EVM → Starknet Earn via LayerSwap. Needs NEXT_PUBLIC_EARN_ENABLED=true as
# well — isEvmEarnEnabled() requires both flags.
NEXT_PUBLIC_EVM_EARN_ENABLED=false
LAYERSWAP_API_KEY=
LAYERSWAP_API_BASE_URL=https://api.layerswap.io   # Optional; HTTPS only

# Tron network + Privy Tron wallet
NEXT_PUBLIC_TRON_ENABLED=false
NEXT_PUBLIC_TRON_RPC_URL=                         # Optional; defaults to https://api.trongrid.io
NEXT_PUBLIC_TRONGRID_API_KEY=                     # Optional; see the browser-exposed keys note below

# HyperFX (Hyperbridge IntentGateway) USDC/USDT↔cNGN. Requires bridge enabled.
NEXT_PUBLIC_HYPERFX_ENABLED=false
ALCHEMY_API_KEY=                                  # Server-only ERC-4337 bundler
# Hyperbridge Nexus endpoints; both optional, each falling back to the public
# Polytope endpoint. The NEXT_PUBLIC_ pair is read by the browser swap client,
# the unprefixed pair by the server quote route.
NEXT_PUBLIC_HYPERBRIDGE_WS_URL=
NEXT_PUBLIC_HYPERBRIDGE_INDEXER_URL=
HYPERBRIDGE_WS_URL=
HYPERBRIDGE_INDEXER_URL=

# Textile FX v2 RFQ: USDT↔cNGN on BSC + Celo
NEXT_PUBLIC_TEXTILE_ENABLED=false
TEXTILE_API_KEY=

# Noblocks Play (fantasy league)
NEXT_PUBLIC_FANTASY_ENABLED=true
# When true, public /play shows the campaign-ended announcement; /play/admin stays live
NEXT_PUBLIC_FANTASY_CAMPAIGN_ENDED=true
NEXT_PUBLIC_WORLDCUP_FOOTER_END_DATE=2026-07-19T23:59:59+01:00
# Admin key for /api/play/admin/* (x-admin-key header). Unset = admin tooling OFF, never open
FANTASY_ADMIN_KEY=
# Shared secret for the Cloudflare worker POSTing /api/play/worker
# (x-internal-auth header); falls back to INTERNAL_API_KEY
FANTASY_WORKER_SECRET=
# Dev-only: "true" compresses gameweek timing for local testing. Ignored in production
FANTASY_LOCAL_TIMELAPSE=
# API-Football key for fixtures, players and live scores
API_FOOTBALL_KEY=

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

# KES fiat→crypto on-ramp (NGN on-ramp always on). Omit or any value except "false" = enabled.
NEXT_PUBLIC_KES_ONRAMP_ENABLED=false

# Embeddable widget (/widget, iframed by whitelisted partners) — see docs/embed-widget.md
NEXT_PUBLIC_EMBED_ENABLED=false
# Comma-separated origins allowed to iframe /widget (https only; http allowed
# only for localhost in dev; wildcard subdomains ok); merged with the
# embed_allowed_origins Supabase table
EMBED_ALLOWED_ORIGINS=
# Trusted absolute base URL for the middleware→internal-API fetch of the
# DB-backed allowlist (e.g. https://noblocks.xyz). If unset, only
# EMBED_ALLOWED_ORIGINS is consulted. Never request-derived (SSRF-safe).
INTERNAL_API_BASE_URL=
```

#### Keys that ship to the browser

`NEXT_PUBLIC_RPC_URL_KEY` (Dwellir) and `NEXT_PUBLIC_TRONGRID_API_KEY` are real provider credentials that are inlined into the client bundle by design — balance reads and RPC calls happen directly from the browser, so a server proxy would add a round trip to every one. Anyone can extract them from a deployed page.

Treat them as public: restrict each key by origin in the provider's dashboard, and expect to rotate them like any published identifier. They protect quota, not access. `ALCHEMY_API_KEY` shows the alternative pattern — it stays server-side because `resolveHyperfxBundlerUrl` in `app/utils.ts` proxies through `/api/bridge/hyperfx/bundler` when called from the browser.

### External Services

```bash
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
```

### Bundler / EIP-7702 Sponsor

Sponsored batch calls are served by the in-process `/api/bundler` route; there is no external bundler URL to configure.

```bash
# Sponsor wallet that pays gas for batched EIP-7702 calls.
# PRIVATE_KEY is a legacy alias, still accepted as a fallback.
SPONSOR_EVM_WALLET_PRIVATE_KEY=0x...
PRIVATE_KEY=
```

### Email & Communications

```bash
# Brevo Email Marketing
# Get from: Brevo Dashboard → Settings → API Keys
BREVO_API_KEY=
# List ID from: Brevo Dashboard → Contacts → Lists (numeric)
BREVO_LIST_ID=
# From address on transactional email (defaults to no-reply@noblocks.xyz)
BREVO_SENDER_EMAIL=
# Brevo Conversations (chat widget)
NEXT_PUBLIC_BREVO_CONVERSATIONS_ID=
NEXT_PUBLIC_BREVO_CONVERSATIONS_GROUP_ID=

# Activepieces webhooks. Each is optional — an unset URL skips that forward.
ACTIVEPIECES_WEBHOOK_URL=                  # Deposit forwarding, from the Moralis stream webhook
ACTIVEPIECES_SIGNUP_VERIFY_WEBHOOK_URL=    # Tier 1 "verify your phone" email
ACTIVEPIECES_KYC_RESULT_WEBHOOK_URL=       # SmileID identity result emails
```

### Moralis EVM Streams (Deposit Watching)

Server-only. Stream and key from the Moralis Dashboard → Streams.

```bash
MORALIS_STREAM_ID=
MORALIS_API_KEY=
MORALIS_BASE_URL=https://api.moralis-streams.com
# Verifies the x-signature header on incoming stream webhooks
MORALIS_WEBHOOK_SECRET=
```

### Phone Verification

```bash
# KudiSMS (African phone numbers)
# Get from: KudiSMS Dashboard → Settings → API Keys
KUDISMS_API_KEY=your_kudisms_api_key
KUDISMS_APP_NAME_CODE=your_app_name_code
KUDISMS_TEMPLATE_CODE=your_template_code
KUDISMS_SENDER_ID=Noblocks
KUDISMS_TIMEOUT_MS=                   # Optional; default 10000

# Twilio (international via Verify API)
# Get from: Twilio Console → Account Dashboard
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_VERIFY_SERVICE_SID=VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_VERIFY_TIMEOUT_MS=             # Optional; default 5000
```

### KYC Verification Services

#### SmileID (Identity Verification)

```bash
SMILE_IDENTITY_API_KEY="your_api_key_here"
SMILE_IDENTITY_PARTNER_ID="your_partner_id_here"
SMILE_ID_CALLBACK_URL=""              # Callback URL for async results
SMILE_IDENTITY_SERVER="0"             # "0" = sandbox, "1" = production, or a legacy full API URL
SMILE_IDENTITY_SERVER_MODE=           # Optional override, checked first. "0" or "1" only
```

`resolveSmileIdServerConfig` in `app/lib/smileID.ts` checks `SMILE_IDENTITY_SERVER_MODE` before `SMILE_IDENTITY_SERVER`. A legacy full URL in `SMILE_IDENTITY_SERVER` is accepted and its mode inferred from whether the host looks like sandbox. Anything unrecognized logs a warning and fails closed, so KYC requests error rather than hitting the wrong environment.

#### Dojah (Tier 3 Address / Proof-of-Address)

```bash
DOJAH_APP_ID=<YOUR_APP_ID>
DOJAH_SECRET_KEY=<YOUR_SECRET_KEY>
DOJAH_BASE_URL=https://api.dojah.io
DOJAH_TIMEOUT_MS=                     # Optional; default 25000

# Supabase Storage bucket for KYC documents (create in Supabase Dashboard → Storage)
KYC_DOCUMENTS_BUCKET=kyc-documents
```

Utility-bill submission has no toggles: `app/lib/dojah.ts` always sends the address fields alongside `input_type: "url"`, and submits the document URL with no base64 retry.

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
7. **Aggregator Sender API Key**: `AGGREGATOR_SENDER_API_KEY_ID` is server-only — never prefix it `NEXT_PUBLIC_`. It is both the aggregator `API-Key` credential and the value that attributes on-chain orders to our sender profile; if it was ever exposed in a client bundle, rotate it in the aggregator dashboard

## Related Documentation

- [Authentication](authentication.md) – Privy and Supabase auth flow details
- [Notice Banner](notice-banner.md) – Configuring in-app notices
- [Wallet Integration](wallet-integration.md) – Supported wallets and detection logic
