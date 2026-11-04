# DR-001: Market-data vendor for Noblocks v2: Chainlink (prices, charts) + CoinMarketCap Basic (stats)

**Date:** 2026-11-04  
**Status:** Accepted  
**Decider(s):** Isaac Onyemaechi (2026-11-04)  
**Ticket:** KAN-955 (epic KAN-952)

## Context

- **Who needs it:** Token detail (KAN-970), the token marketplace (KAN-978), swap "≈ $" estimates (KAN-964) and Stocks (KAN-968). They need USD price, 24h change, 24h volume, market cap and circulating supply, plus charts for 1D, 1W, 1M, 1Y and All time (Figma 2686:51065).
- **What exists today:** Noblocks has no market-data source on `feat/noblocks-v2`. Prices are display-only; settlement uses aggregator quotes.
- **Assets:** Five unique symbols (USDC, USDT, ETH, cUSD, cNGN) from `FALLBACK_TOKENS` in `app/utils.ts`.
- **cNGN:** No onchain cNGN/USD feed; headline price uses Chainlink NGN/USD as a reference rate.
- **Constraints:** Server-only secrets, SSRF-safe allowlist, stale fallback, per-replica in-memory cache, batched upstream calls.

## Decision

**Prices, 24h change and charts: Chainlink Data Feeds**, read server-side with `viem` through a server-only RPC key. Base feeds for ETH/USD, USDC/USD, USDT/USD and NGN/USD; Celo feed for CUSD/USD. Fallbacks on Arbitrum (ETH, USDC, USDT) and Celo (NGN/USD). Charts from historical feed reads with spike filtering.

**24h volume, market cap and supply: CoinMarketCap Basic (free).** One batched `quotes/latest` for CMC ids 3408, 825, 1027, 7236, 29207 every 10 minutes. cNGN market cap = CMC `total_supply` × CMC cNGN price; circulating supply = CMC `total_supply`.

**cNGN headline:** Chainlink NGN/USD reference rate (`derived=true`). A depeg badge when CMC market price differs from the reference by more than 2% (configurable).

## Alternatives considered

- **Chainlink only** — no global volume/market cap for majors.
- **Pyth** — paid Hermes; stale onchain reads; no cNGN/cUSD coverage. Rejected.
- **CoinGecko Basic ($35/mo)** — rejected in favour of free CMC Basic for stats.
- **DefiLlama** — free tier non-commercial; no token volume. Rejected.
- **Crypto APIs** — trial-only free tier; no 1Y/All charts. Rejected.

## Consequences

- **Easier:** $0 data cost; oracle-grade prices; stats behind a swappable adapter.
- **Harder / owed:** CMC attribution in the UI (Ella); one product / ≤100k users licence; separate CMC accounts for prod vs dev; two freshness clocks (60 s price vs 10 min stats); confirm feed addresses when Chainlink migrates proxies.
- **Revisit when:** ~100k users, credit budget pressure, Chainlink ships cNGN/USD, or anything starts to settle on display prices (stop — money-safety).
