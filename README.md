# ![image](/public/logos/noblocks-logo.svg)

![image](/public/images/noblocks-bg-image.png)

[![Next.js](https://img.shields.io/badge/-Next.js-222?logo=Next.js&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?logo=TypeScript&logoColor=white)](https://typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/-Tailwind%20CSS-06B6D4?logo=Tailwind%20CSS&logoColor=white)](https://tailwindcss.com/)
[![PNPM](https://img.shields.io/badge/-pnpm-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)

> **Additional documentation is available in the [`docs/`](docs/) directory.**

Noblocks simplifies cryptocurrency-to-local currency conversion using a decentralized liquidity protocol. Send crypto once, receive local currency instantly via bank transfer or mobile money—all powered by [Paycrest Protocol](https://paycrest.io/).

Visit the live site at [noblocks.xyz](https://noblocks.xyz).

## Running Locally

### Prerequisites

- Node.js 20+ installed (use `nvm` or version manager)
- pnpm installed globally: `npm install -g pnpm`
- Git

### Setup Steps

1. Clone the repository:

   ```bash
   git clone https://github.com/paycrest/noblocks.git
   cd noblocks
   ```

2. Configure environment variables:

   - Copy the [`.env.example`](.env.example) file to `.env.local`:
     
     ```bash
     cp .env.example .env.local
     ```

   - Required variables to set:
     - `NEXT_PUBLIC_PRIVY_APP_ID` – Your Privy app ID ([sign up here](https://www.privy.io/))
     - `SUPABASE_URL` and `SUPABASE_SECRET_KEY` – From Supabase Dashboard → Project Settings → API
     - `NEXT_PUBLIC_AGGREGATOR_SENDER_API_KEY_ID` – From aggregator dashboard
     - `INTERNAL_API_KEY` – Generate with `openssl rand -hex 32`

   See [`.env.example`](.env.example) or [docs/environment-variables.md](docs/environment-variables.md) for all options.

3. Install dependencies and start the development server:

   ```bash
   pnpm install
   pnpm dev
   ```

4. Visit [localhost:3000](http://localhost:3000) to view the app locally.

## Features

### Core Functionality

- **Crypto-to-Fiat Onramp**: Accept crypto deposits (USDC, ETH, etc.) and disburse local currency via bank transfer or mobile money
- **KYC Verification**: Built-in identity verification powered by SmileID and Dojah for Tier 3 KYC
- **Transaction History**: Full audit trail stored in Supabase with client-side retrieval

### New Features

| Feature | Description | Docs |
|---------|-------------|------|
| **Cross-Chain Bridge** | Convert and bridge assets across chains via NEAR Intents + LI.FI | [bridging.md](docs/bridging.md) |
| **Tron Support** | Deposit and manage TRX/TRC20 tokens | [tron-support.md](docs/tron-support.md) |
| **Chained Forwarding** | Auto-forward crypto settlements from user wallet to custom destination address | [chained-forwarding.md](docs/chained-forwarding.md) |
| **Referral Program** | Earn USDC rewards by referring new users | See [`.env.example`](.env.example) flags |
| **Earn Integration** | Deposit/withdraw support via Vesu/Starkzap | Feature flag: `NEXT_PUBLIC_EARN_ENABLED` |

## 📚 How It Works

The core onramp flow:

1. **Create Order**: User initiates an order on the [Gateway Smart Contract](https://github.com/paycrest/contracts) through the Noblocks interface
2. **Aggregate**: Paycrest Protocol Aggregator indexes the order and assigns it to Provision Nodes run by liquidity providers
3. **Fulfill**: The provisioning node disburses funds to the recipient's local bank account or mobile money wallet via Payment Service Providers (PSPs)

For more details, visit [paycrest.io](https://paycrest.io).

## 🛠️ Technology Stack

### Frontend

- **Framework**: Next.js 15 (App Router, Turbopack)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**: React Query (@tanstack/react-query)
- **Bundle/ABI Handling**: Viem, Ethers.js

### Authentication & Wallets

- **Privy**: Smart wallet authentication (default) + injected wallet support
- **EIP-7702**: Gasless transactions via Noblocks sponsor wallet
- **Thirdweb**: Multi-chain wallet interactions
- **TronWeb**: Tron network integration

### Backend & Data

- **Supabase**: PostgreSQL database, real-time subscriptions, storage
- **Paycrest Aggregator API**: Order routing and liquidity aggregation
- **Sentry**: Error tracking and performance monitoring

### External Services

| Service | Purpose |
|---------|---------|
| [SmileID](https://smile.id/) | Identity verification (KYC) |
| [Dojah](https://dojah.io/) | Address verification and proof-of-address |
| [KudiSMS](https://kudisms.com/) | African phone number verification |
| [Twilio Verify](https://twilio.com/verify) | International SMS verification |
| [Mixpanel](https://mixpanel.com/) | Product analytics |
| [Brevo](https://brevo.com/) | Email marketing and conversations chat |
| [Sanity](https://sanity.io/) | CMS for content management |

## Contributing

We welcome contributions to Noblocks! Before contributing:

1. Read the [Contribution Guide](https://paycrest.notion.site/Contribution-Guide-1602482d45a2809a8930e6ad565c906a)
2. Review the [Code of Conduct](https://paycrest.notion.site/Contributor-Code-of-Conduct-1602482d45a2806bab75fd314b381f4c)

**Getting Started:**

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature-name`
3. Make your changes and commit with descriptive messages
4. Push to your fork and open a Pull Request

Your PR will be reviewed by the team. Feel free to reach out in the [developer Telegram](https://t.me/+Stx-wLOdj49iNDM0) if you have questions.

## 📄 License

This project is licensed under the [AGPL-3.0 License](LICENSE).

## 📄 License

This project is licensed under the [Affero General Public License v3.0](LICENSE).
