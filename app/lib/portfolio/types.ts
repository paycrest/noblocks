/** GET /api/v1/portfolio response shapes (amounts are decimal strings). */

export type PortfolioBucketName = "tokens" | "earn" | "stocks";

export interface PortfolioHolding {
  id: string;
  chain: string;
  symbol: string;
  /** Token amount as a decimal string (never a JS float). */
  amount: string;
  /** USD value for this row; omitted from bucket USD when null. */
  usd: string | null;
  priceUnavailable?: boolean;
  /** When true, UI feature for this bucket is off but balance is still counted. */
  readOnly?: boolean;
  /** Row-level staleness when the underlying read failed and a snapshot was reused. */
  stale?: boolean;
  /** ISO timestamp of the balance read backing this row. */
  asOf: string;
  /**
   * Position identifier for earn overlap / de-dupe.
   * Wallet rows use `wallet`; Vesu uses pool address; EVM-sourced earn uses `evm-earn-source`.
   */
  positionId?: string;
}

export interface PortfolioBucket {
  totalUsd: string;
  stale: boolean;
  asOf: string;
  holdings: PortfolioHolding[];
}

export interface PortfolioSummary {
  success: true;
  totalUsd: string;
  stale: boolean;
  asOf: string;
  buckets: Record<PortfolioBucketName, PortfolioBucket>;
}

export interface PortfolioBuildInputHolding {
  chain: string;
  symbol: string;
  tokenAddress: string;
  amount: string;
  decimals: number;
  bucket: PortfolioBucketName;
  positionId: string;
  readOnly?: boolean;
  stale?: boolean;
  asOf: string;
}

export interface PortfolioPriceQuote {
  usdPerUnit: string | null;
  priceUnavailable: boolean;
  stale: boolean;
  asOf: string | null;
}

export type PortfolioPriceLookup = (
  symbol: string,
) => Promise<PortfolioPriceQuote>;
