import { FALLBACK_TOKENS } from "@/app/utils";

/**
 * Copy, network list, presets, and min-deposit values for Add funds.
 * Strings match Figma INDEX.md verbatim unless a listed designer-error override.
 */
export const DEPOSIT_DRAWER_COPY = {
  title: "Add funds",
  subtitle: "Deposit tokens into your wallet",
  tokenModalTitle: (token: string) => `Add ${token}`,
  tokenModalSubtitle: (token: string) =>
    `Deposit ${token} into your noblocks wallet`,
  amountLabel: "Amount",
  selectToken: "Select token",
  selectNetwork: "Select network",
  searchToken: "Search token",
  searchNetwork: "Search network",
  continue: "Continue",
  swapTime: "Swap usually completes in 15 sec",
  beforeYouContinue: "Before you continue",
  minDepositBullet: "Minimum deposit value $1",
  minDepositQrBullet: "Minimum deposit value $1 USD",
  onceOnlyBullet:
    "Use this address only once. Any later transfer to it may be lost. Don't save, whitelist, or share it.",
  acknowledgement:
    "I understand that I must put in a minimum deposit of at least $1, and I must use this address only once. Any later transfer to it may be lost.",
  qrTitle: (minUsd: string, token: string) =>
    `Send at least ${minUsd} of ${token}`,
  qrNetworkLine: (network: string) => `On the ${network} network`,
  qrScanCopyFunds: (networkLower: string) =>
    `Scan this code or copy your wallet address to receive funds on the ${networkLower} network.`,
  qrScanCopyToken: (token: string, networkLower: string) =>
    `Scan this code or copy your wallet address to receive ${token} on the ${networkLower} network.`,
  depositAddressLabel: "Deposit address",
  copy: "Copy",
  sendOnlyWarning: (token: string, networkLower: string) =>
    `Make sure to only send ${token} on the ${networkLower} network.`,
  toastTitle: (token: string, amountDisplay: string) =>
    `${token} ${amountDisplay} deposited`,
  toastBody: "Funds have been added to your account.",
  unsupportedReason: (token: string, network: string) =>
    `${token} is not supported on ${network}. Choose a different token or network.`,
  addressErrorTitle: "Couldn't load deposit address",
  addressErrorBody:
    "We couldn't load your wallet address for this network. Try again or sign out and back in.",
  tryAgain: "Try again",
  loadingAddress: "Loading deposit address…",
} as const;

export const DEPOSIT_MIN_USD = "$1";

export const DEPOSIT_RATE_CURRENCY = "NGN";
export const DEPOSIT_RATE_FALLBACK_TOKEN = "USDT";
export const DEPOSIT_RATE_FALLBACK_NETWORK = "Base";

/** Latest Home frames (92–93). Earlier $10/$100/$500/$1000 chips are superseded. */
export const DEPOSIT_AMOUNT_PRESETS: ReadonlyArray<{
  label: string;
  amount: string;
}> = [
  { label: "$5", amount: "5" },
  { label: "$10", amount: "10" },
  { label: "$100", amount: "100" },
  { label: "$500", amount: "500" },
];

/**
 * `chainName` matches viem / `networks` / FALLBACK_TOKENS.
 * `displayName` is Figma list-row copy (including "smart chain" / "one").
 */
export const DEPOSIT_NETWORKS: ReadonlyArray<{
  chainName: string;
  displayName: string;
}> = [
  { chainName: "Polygon", displayName: "Polygon" },
  {
    chainName: "BNB Smart Chain",
    displayName: "Binance smart chain",
  },
  { chainName: "Base", displayName: "Base" },
  {
    chainName: "Arbitrum One",
    displayName: "Arbitrum one",
  },
  { chainName: "Ethereum", displayName: "Ethereum" },
];

export type DepositTokenOption = {
  name: string;
  symbol: string;
  imageUrl?: string;
};

export function getDepositTokenOptions(): DepositTokenOption[] {
  const seen = new Map<string, DepositTokenOption>();
  for (const net of DEPOSIT_NETWORKS) {
    const tokens = FALLBACK_TOKENS[net.chainName] ?? [];
    for (const token of tokens) {
      const key = token.symbol.toUpperCase();
      if (!seen.has(key)) {
        seen.set(key, {
          name: token.name,
          symbol: token.symbol,
          imageUrl: token.imageUrl,
        });
      }
    }
  }
  return [...seen.values()];
}

export function isTokenSupportedOnNetwork(
  symbol: string,
  chainName: string,
): boolean {
  if (!symbol || !chainName) return false;
  const tokens = FALLBACK_TOKENS[chainName] ?? [];
  const wanted = symbol.toUpperCase();
  return tokens.some((token) => token.symbol.toUpperCase() === wanted);
}

export function getDepositNetworkByChainName(chainName: string) {
  return DEPOSIT_NETWORKS.find((network) => network.chainName === chainName);
}

export function networkCopyCase(displayName: string): string {
  return displayName.toLowerCase();
}

/**
 * Keep only decimal digits and a single `.`. Never parse as a JS number so
 * values like `0.1` and `1000000.123456` stay as typed.
 */
export function sanitizeDecimalAmountInput(raw: string): string {
  const stripped = raw.replace(/[^\d.]/g, "");
  const firstDot = stripped.indexOf(".");
  if (firstDot === -1) return stripped;
  return (
    stripped.slice(0, firstDot + 1) +
    stripped.slice(firstDot + 1).replace(/\./g, "")
  );
}

/** Group the integer digits of a decimal string. Does not use JS numbers. */
export function formatDecimalAmountDisplay(raw: string): string {
  if (!raw) return "";
  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  const dot = unsigned.indexOf(".");
  const intPart = dot === -1 ? unsigned : unsigned.slice(0, dot);
  const frac = dot === -1 ? null : unsigned.slice(dot + 1);
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = frac === null ? grouped : `${grouped}.${frac}`;
  return negative ? `-${body}` : body;
}

export function formatDepositRateLabel(
  token: string,
  formattedRate: string,
  currency: string = DEPOSIT_RATE_CURRENCY,
): string {
  return `1 ${token} ~ ${formattedRate} ${currency}`;
}
