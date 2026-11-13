# Tron Support

Noblocks supports USDT on Tron for selling (off-ramp), buying (on-ramp) and withdrawals, from the user's Privy embedded Tron wallet. Tron is opt-in with `NEXT_PUBLIC_TRON_ENABLED`.

## How it works

The Paycrest aggregator reaches Tron only as a **bridged network**: a sell is a sender-API order whose deposit is a plain USDT transfer to the address the order returns, and a buy delivers to the user's Tron address through the bridge. Noblocks never calls a Tron Gateway contract.

### Wallet

- `TronContext` (`app/context/TronContext.tsx`) reads the user's Privy Tron wallet (`chainType: "tron"`) and creates one through `/api/tron/create-wallet` when the user switches to Tron.
- Balances come from TronGrid (`fetchTronBalance` in `app/utils.ts`).
- Wallet export goes through Privy (`useHandleExportEmbeddedWallet`).

### Sending (sells and withdrawals)

All Tron transactions are built, signed and broadcast on the server (`app/lib/tron.ts`), over TronGrid's HTTP API. There is no TronWeb dependency.

1. **Plan:** estimate the energy of the USDT `transfer` and compare it with the wallet's free energy, bandwidth and TRX balance.
2. **Top-up:** embedded wallets hold USDT but no TRX. The Noblocks sponsor wallet sends exactly the TRX shortfall first and waits for it to confirm. Measured cost: ~6.4 TRX to an address that already holds USDT, ~13 TRX to a fresh one.
3. **Sign:** the server signs the transfer's txID with Privy `raw_sign`, as the user (user signer from the session JWT). It then appends the recovery byte (`1b`/`1c`) that recovers the wallet's own address.
4. **Broadcast:** `/wallet/broadcasttransaction`. A broadcast with no definite answer is an *unknown outcome*. The UI moves to the status page and never offers a retry that could pay twice.

`/api/tron/transfer` exposes this for two cases, and the sponsor pays for nothing else:

- **`deposit`:** pays a live sell order of the caller (initiated, nothing paid, inside its deposit window). It sends exactly the order's `amountToTransfer`, from its refund wallet to its deposit address.
- **`withdrawal`:**
  - It is sponsored at or above `TRON_WITHDRAW_MIN`, for up to `TRON_WITHDRAW_DAILY_SPONSORED` withdrawals per 24 hours. Past that, the wallet must hold its own TRX.
  - The server records the transfer row itself, so the daily count cannot be dodged.

### Sell fee

Every sell deposit goes to a fresh address, so the sponsor burns the most TRX there. A Tron sell therefore carries a fixed `senderFee` paid by the customer in the same deposit (`transactionFeePayer: "customer"`):

- **Quote:** worst-case energy at the live energy price, plus bandwidth, at the live TRX price (CoinGecko), plus `TRON_SELL_FEE_MARGIN`.
- **Bounds:** clamped to `TRON_SELL_FEE_MIN_USD`–`TRON_SELL_FEE_MAX_USD`. `TRON_SELL_FEE_FALLBACK_USD` applies when a price is unavailable.
- **Display:** shown in the preview's network-fee review before anything is sent.
- **Payout:** paid out to Noblocks' fee address on the settlement network. The aggregator needs a SenderOrderToken with an EVM fee address for the settlement token; without it, orders are refused for a missing fee address.
- **Turning it off:** `TRON_SELL_NETWORK_FEE=false` absorbs the cost instead.

### Buying

Buying uses the shared on-ramp route with the aggregator's network id `tron`. The aggregator refuses buys whose delivery cost (about 1.73 USDT per transfer into Tron) exceeds 10% of the amount, and its message is shown as returned.

## Configuration

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_TRON_ENABLED` | Show Tron in the network list |
| `NEXT_PUBLIC_TRON_RPC_URL` | TronGrid endpoint (default `https://api.trongrid.io`) |
| `NEXT_PUBLIC_TRONGRID_API_KEY` | Browser balance lookups (public; restrict by origin) |
| `TRONGRID_API_KEY` | Server-side TronGrid key for sends |
| `SPONSOR_TRON_WALLET_PRIVATE_KEY` | Sponsor wallet (hex private key), funded with TRX |
| `TRON_SPONSOR_MAX_TOPUP_TRX` | Most TRX sent for one transfer (default 30) |
| `TRON_SELL_NETWORK_FEE`, `TRON_SELL_FEE_*` | Sell fee on/off, bounds, fallback, margin |
| `TRON_WITHDRAW_MIN`, `TRON_WITHDRAW_DAILY_SPONSORED` | Sponsored withdrawal limits |

Keep the sponsor wallet funded, and alert on its TRX balance.
