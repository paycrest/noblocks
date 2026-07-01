# ![image](/public/logos/noblocks-logo.svg)

![image](/public/images/noblocks-bg-image.png)

[![Next.js](https://img.shields.io/badge/-Next.js-222?logo=Next.js&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?logo=TypeScript&logoColor=white)](https://typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/-Tailwind%20CSS-06B6D4?logo=Tailwind%20CSS&logoColor=white)](https://tailwindcss.com/)
[![PNPM](https://img.shields.io/badge/-pnpm-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)

> **Additional documentation is available in the [`docs/`](docs/) directory.**

Noblocks simplifies cryptocurrency-to-local currency conversion using a decentralized liquidity protocol. Send crypto once, receive local currency via bank transfer or mobile money—all powered by [Paycrest Protocol](https://paycrest.io/).

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
     - `INTERNAL_API_KEY` – Generate with `openssl rand -hex 32`

   See [`.env.example`](.env.example) or [docs/environment-variables.md](docs/environment-variables.md) for all options, including optional variables such as `NEXT_PUBLIC_AGGREGATOR_SENDER_API_KEY_ID` for live order creation.

3. Install dependencies and start the development server:

   ```bash
   pnpm install
   pnpm dev
   ```

4. Visit [localhost:3000](http://localhost:3000) to view the app locally.

## How It Works

1. **Create Order**: User initiates an order through the Noblocks interface.
2. **Pass to Paycrest**: Noblocks submits the order to [Paycrest Protocol](https://paycrest.io/) for fulfillment.

To learn how Paycrest routes and settles orders, see the [Paycrest documentation](https://paycrest.io/).

## Contributing

We welcome contributions to Noblocks! Before contributing:

1. Read the [Contribution Guide](https://paycrest.notion.site/Contribution-Guide-1602482d45a2809a8930e6ad565c906a)
2. Review the [Code of Conduct](https://paycrest.notion.site/Contributor-Code-of-Conduct-1602482d45a2806bab75fd314b381f4c)

**Getting Started:**

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature-name`
3. Make your changes and follow the commit message conventions in the Contribution Guide
4. Push to your fork and open a Pull Request using the [PR template](.github/pull_request_template.md)

Our team will review your pull request and work with you to get it merged. If you have questions, open an issue or reach out in the [developer Telegram](https://t.me/+Stx-wLOdj49iNDM0).

## License

This project is licensed under the [Affero General Public License v3.0](LICENSE).
