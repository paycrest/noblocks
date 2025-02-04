# ![image](/public/logos/noblocks-logo.svg)
![image](/public/images/noblocks-bg-image.png)

[![Next.js](https://img.shields.io/badge/-Next.js-61DAFB?logo=Next.js&logoColor=white&color=11172a)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/-TypeScript-FFA500?logo=TypeScript&logoColor=blue&color=11172a)](https://typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/-Tailwind%20CSS-06B6D4?logo=Tailwind%20CSS&logoColor=blue&color=11172a)](https://tailwindcss.com/)
[![Prettier](https://img.shields.io/badge/-Prettier-1d2b34?logo=Prettier&logoColor=efbc3a&color=11172a)](https://prettier.io/)

This branch contains the codebase for Noblocks. Noblocks simplifies cryptocurrency-to-local currency conversion using a decentralized liquidity protocol, providing a seamless user experience powered by [Paycrest Protocol](https://paycrest.io/).

Visit the live site at [noblocks.xyz](https://noblocks.xyz).

## Running Locally

To run the project locally, follow these steps:

1. Clone the repository and switch to the waitlist branch:

   ```bash
   git clone https://github.com/paycrest/noblocks.git
   cd noblocks
   ```

2. Configure environment variables:

   - Copy the [`env.example`](.env.example) file to `.env.local`

     ```bash
     cp .env.example .env.local
     ```

   - Add the required environment variables.

3. Install dependencies and start the development server:

   ```bash
   pnpm install
   pnpm dev
   ```

4. Visit [localhost:3000](http://localhost:3000) to view the waitlist page locally.

## 📚 How It Works

Noblocks streamlines the conversion process through a simple flow:

1. **Create Order:** User creates an order on the [Gateway Smart Contract](https://github.com/paycrest/contracts) (escrow) through the Noblocks interface.
2. **Aggregate:** Paycrest Protocol Aggregator indexes the order and assigns it to one or more [Provision Nodes](https://github.com/paycrest/provider) run by liquidity providers.
3. **Fulfill:** The provisioning node automatically disburses funds to the recipient's local bank account or mobile money wallet via connections to payment service providers (PSP).

For more details, visit [paycrest.io](https://paycrest.io).

### Noblocks is built on Paycrest Protocol

| Before      | Now |
| ----------- | ----------- |
| ![image](https://github.com/paycrest/zap/assets/87664239/73548ada-bde5-41f5-8af6-0f9f943c763f) | ![image](https://github.com/paycrest/zap/assets/87664239/495e166f-54cf-4951-9cdd-92b9357e8608) |

## 🛠️ Technologies Used

- [Shield3](https://shield3.com/) for OFAC compliance
- [Biconomy](https://biconomy.io/) for gasless transactions

## Contributing

We welcome contributions to the Paycrest noblocks app! To get started, follow these steps:

**Important:** Before you begin contributing, please ensure you've read and understood these important documents:

- [Contribution Guide](https://paycrest.notion.site/Contribution-Guide-1602482d45a2809a8930e6ad565c906a) - Critical information about development process, standards, and guidelines.

- [Code of Conduct](https://paycrest.notion.site/Contributor-Code-of-Conduct-1602482d45a2806bab75fd314b381f4c) - Our community standards and expectations.

Our team will review your pull request and work with you to get it merged into the main branch of the repository.

If you encounter any issues or have questions, feel free to open an issue on the repository or leave a message in our [developer community on Telegram](https://t.me/+Stx-wLOdj49iNDM0)

## 📄 License

This project is licensed under the [Affero General Public License v3.0](LICENSE).
