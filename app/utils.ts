import { createElement, type ReactElement } from "react";
import JSEncrypt from "jsencrypt";
import type {
  InstitutionProps,
  Network,
  Token,
  Currency,
  APIToken,
  RecipientDetails,
  V2FiatProviderAccountDTO,
  OnrampPaymentInstructions,
  TransactionHistory,
  TransactionHistoryType,
} from "./types";
import type { SanityPost, SanityCategory } from "./blog/types";
import { erc20Abi, createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { getEnsName } from "viem/actions";
import { isValidEvmAddressCaseInsensitive } from "./lib/validation";
import { colors } from "./mocks";
import { fetchTokens } from "./api/aggregator";
import { toast } from "sonner";
import config from "./lib/config";
import {
  feeRecipientAddress,
  localTransferFeePercent,
  localTransferFeeCap,
} from "./lib/config";

/**
 * Type predicate to narrow RecipientDetails to bank/mobile_money types.
 * Used for type-safe filtering and property access.
 *
 * @param recipient - The recipient to check.
 * @returns True if recipient is bank or mobile_money type.
 */
export function isBankOrMobileMoneyRecipient(
  recipient: RecipientDetails,
): recipient is Extract<RecipientDetails, { type: "bank" | "mobile_money" }> {
  return recipient.type !== "wallet";
}

/**
 * Type predicate to narrow RecipientDetails to wallet type.
 * Used for type-safe filtering and property access.
 *
 * @param recipient - The recipient to check.
 * @returns True if recipient is wallet type.
 */
export function isWalletRecipient(
  recipient: RecipientDetails,
): recipient is Extract<RecipientDetails, { type: "wallet" }> {
  return recipient.type === "wallet";
}

/**
 * Concatenates and returns a string of class names.
 *
 * @param classes - The class names to concatenate.
 * @returns A string of concatenated class names.
 */
export function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

/**
 * Gets the logo identifier for a token symbol (for transaction history display)
 * @param tokenSymbol - The token symbol (e.g., "USDC", "USDT")
 * @returns The logo identifier (e.g., "usdc", "usdt")
 */
export function getTokenLogoIdentifier(tokenSymbol: string): string {
  return tokenSymbol.toLowerCase();
}

/**
 * Retrieves the institution name based on the provided institution code.
 *
 * @param code - The institution code.
 * @returns The institution name associated with the provided code, or undefined if not found.
 */
export function getInstitutionNameByCode(
  code: string,
  supportedInstitutions: InstitutionProps[],
): string | undefined {
  const institution = supportedInstitutions.find((inst) => inst.code === code);
  return institution ? institution.name : undefined;
}

/**
 * Formats a number with commas before the decimal point.
 *
 * @param num - The number to format.
 * @returns The formatted number as a string.
 */
export function formatNumberWithCommas(num: string | number): string {
  const parts = num.toString().split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return parts.join(".");
}

/**
 * Formats a number as a currency string.
 *
 * @param value - The number to format.
 * @param currency - The currency code to use.
 * @param locale - The locale to use.
 * @returns The formatted currency string.
 */
export const formatCurrency = (
  value: number,
  currency = "NGN",
  locale = "en-NG",
) => {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(value);
  } catch {
    return `${formatNumberWithCommas(value)} ${currency.toUpperCase()}`;
  }
};

/**
 * Gets the currency symbol for a given currency code.
 * @param currency - The currency code (e.g., "NGN", "KES", "USD")
 * @returns The currency symbol (e.g., "₦", "KSh", "$")
 */
export const getCurrencySymbol = (currency: string): string => {
  const currencySymbols: Record<string, string> = {
    NGN: "₦",
    KES: "KSh",
    UGX: "USh",
    TZS: "TSh",
    GHS: "₵",
    BRL: "R$",
    ARS: "$",
    USD: "$",
    GBP: "£",
    EUR: "€",
    MWK: "MK",
    XOF: "CFA",
    XAF: "FCFA",
  };

  return currencySymbols[currency.toUpperCase()] || currency;
};

/** Fiat codes supported in Noblocks swap (matches `mocks.acceptedCurrencies` names). */
const NOBLOCKS_FIAT_CURRENCY_CODES = new Set([
  "NGN",
  "KES",
  "UGX",
  "TZS",
  "MWK",
  "GHS",
  "BRL",
  "ARS",
]);

export function isNoblocksFiatCurrencyCode(code: string): boolean {
  return NOBLOCKS_FIAT_CURRENCY_CODES.has(code.toUpperCase());
}

/**
 * List / details: fiat uses symbol prefix (e.g. ₦1,000.5); crypto uses "1.23 USDC".
 */
export function formatTransactionAmountDisplay(
  amount: number,
  currencyCode: string,
): string {
  if (isNoblocksFiatCurrencyCode(currencyCode)) {
    return `${getCurrencySymbol(currencyCode)}${formatNumberWithCommas(amount)}`;
  }
  return `${formatNumberWithCommas(amount)} ${currencyCode}`;
}

/** User-facing label for transaction history rows (API still uses `onramp`). */
export function getTransactionHistoryTypeLabel(
  type: TransactionHistoryType,
): string {
  switch (type) {
    case "transfer":
      return "Transferred";
    case "swap":
      return "Swapped";
    case "onramp":
      return "Swapped";
    default:
      return type;
  }
}

/**
 * Encrypts data using the provided public key.
 * @param data - The data to be encrypted.
 * @param publicKeyPEM - The public key in PEM format.
 * @returns The encrypted data as a base64-encoded string.
 */
export function publicKeyEncrypt(data: unknown, publicKeyPEM: string): string {
  const encrypt = new JSEncrypt();
  encrypt.setPublicKey(publicKeyPEM);

  const encrypted = encrypt.encrypt(JSON.stringify(data));
  if (encrypted === false) {
    throw new Error("Failed to encrypt data");
  }

  return encrypted;
}

/**
 * Calculates the duration between two dates and returns a human-readable string.
 * @param createdAt - Start date in ISO string format
 * @param completedAt - End date in ISO string format
 * @returns A string representing the duration in seconds
 */
export const calculateDuration = (
  createdAt: string,
  completedAt: string,
): string => {
  const start = new Date(createdAt);
  const end = new Date(completedAt);

  // Check if the dates are valid
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Invalid Date";
  }

  const durationMs = end.getTime() - start.getTime();
  const durationSec = Math.floor(durationMs / 1000);
  return `${durationSec} second${durationSec !== 1 ? "s" : ""}`;
};

/**
 * Returns the explorer link for a given transaction hash based on the network and status.
 * @param network - The network name.
 * @param txHash - The transaction hash.
 * @param status - The status of the transaction.
 * @returns The explorer link for the transaction.
 */
export const getExplorerLink = (network: string, txHash: string) => {
  switch (network) {
    case "Polygon":
      return `https://polygonscan.com/tx/${txHash}`;
    case "BNB Smart Chain":
      return `https://bscscan.com/tx/${txHash}`;
    case "Base":
      return `https://basescan.org/tx/${txHash}`;
    case "Arbitrum One":
      return `https://arbiscan.io/tx/${txHash}`;
    case "Optimism":
      return `https://optimistic.etherscan.io/tx/${txHash}`;
    case "Scroll":
      return `https://scrollscan.com/tx/${txHash}`;
    case "Celo":
      return `https://celoscan.io/tx/${txHash}`;
    case "Lisk":
      return `https://blockscout.lisk.com/tx/${txHash}`;
    case "Ethereum":
      return `https://etherscan.io/tx/${txHash}`;
    case "Starknet":
      return `https://voyager.online/tx/${txHash}`;
    default:
      return "";
  }
};

// write function to get rpc url for a given network
export function getRpcUrl(network: string) {
  const rpcUrlKey = process.env.NEXT_PUBLIC_RPC_URL_KEY;
  switch (network) {
    case "Polygon":
      return `https://api-polygon-mainnet-full.n.dwellir.com/${rpcUrlKey ?? ""}`;
    case "BNB Smart Chain":
      return `https://api-bsc-mainnet-full.n.dwellir.com/${rpcUrlKey ?? ""}`;
    case "Base":
      return `https://api-base-mainnet-archive.n.dwellir.com/${rpcUrlKey ?? ""}`;
    case "Arbitrum One":
      return `https://api-arbitrum-mainnet-archive.n.dwellir.com/${rpcUrlKey ?? ""}`;
    case "Celo":
      return `https://api-celo-mainnet-archive.n.dwellir.com/${rpcUrlKey ?? ""}`;
    case "Scroll":
      return `https://api-scroll-mainnet.n.dwellir.com/${rpcUrlKey ?? ""}`;
    case "Lisk":
      return `https://api-lisk-mainnet.n.dwellir.com/${rpcUrlKey ?? ""}`;
    case "Ethereum":
      return `https://api-ethereum-mainnet.n.dwellir.com/${rpcUrlKey ?? ""}`;
    case "Starknet":
      return process.env.NEXT_PUBLIC_STARKNET_RPC_URL;
    default:
      return undefined;
  }
}

// Token caching
let tokensCache: { [network: string]: Token[] } = {};
let lastTokenFetch = 0;
const TOKEN_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Converts API network identifiers to display names
 * @param networkId - Network identifier from API (e.g., "arbitrum-one")
 * @returns Display name (e.g., "Arbitrum One")
 */
/**
 * Converts API network identifiers to display names dynamically
 * @param networkId - Network identifier from API (e.g., "arbitrum-one", "bnb-smart-chain")
 * @returns Display name (e.g., "Arbitrum One", "BNB Smart Chain")
 */
export function normalizeNetworkName(networkId: string): string {
  // Handle empty or invalid input
  if (!networkId || typeof networkId !== "string") {
    return networkId;
  }

  // Known acronyms that should remain uppercase
  const acronyms = new Set(["BNB", "USD", "API", "RPC", "NFT", "DeFi"]);

  return networkId
    .split("-")
    .map((word) => {
      // Convert to uppercase if it's a known acronym
      const upperWord = word.toUpperCase();
      if (acronyms.has(upperWord)) {
        return upperWord;
      }

      // Otherwise, capitalize first letter and lowercase the rest
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

/**
 * Transforms API token data to application token format
 * @param apiToken - Raw token data from API
 * @returns Formatted token for application use
 */
export function transformToken(apiToken: APIToken): Token {
  return {
    name: apiToken.symbol,
    symbol: apiToken.symbol,
    decimals: apiToken.decimals,
    address: apiToken.contractAddress,
    imageUrl: `/logos/${apiToken.symbol.toLowerCase()}-logo.svg`,
  };
}

// Fallback token data when API is unavailable
export const FALLBACK_TOKENS: { [key: string]: Token[] } = {
  Base: [
    {
      name: "USD Coin",
      symbol: "USDC",
      decimals: 6,
      address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      imageUrl: "/logos/usdc-logo.svg",
    },
    {
      name: "Tether USD",
      symbol: "USDT",
      decimals: 6,
      address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
      imageUrl: "/logos/usdt-logo.svg",
    },
    {
      name: "Compliant Naira",
      symbol: "cNGN",
      decimals: 6,
      address: "0x46c85152bfe9f96829aa94755d9f915f9b10ef5f",
      imageUrl: "/logos/cngn-logo.svg",
    },
    {
      name: "Ethereum",
      symbol: "ETH",
      decimals: 18,
      address: "", // Native token has no contract address
      imageUrl: "/logos/eth-logo.svg",
      isNative: true,
    },
  ],
  "Arbitrum One": [
    {
      name: "USD Coin",
      symbol: "USDC",
      decimals: 6,
      address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
      imageUrl: "/logos/usdc-logo.svg",
    },
    {
      name: "Tether USD",
      symbol: "USDT",
      decimals: 6,
      address: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
      imageUrl: "/logos/usdt-logo.svg",
    },
  ],
  Polygon: [
    {
      name: "USD Coin",
      symbol: "USDC",
      decimals: 6,
      address: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
      imageUrl: "/logos/usdc-logo.svg",
    },
    {
      name: "Tether USD",
      symbol: "USDT",
      decimals: 6,
      address: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
      imageUrl: "/logos/usdt-logo.svg",
    },
    {
      name: "Compliant Naira",
      symbol: "cNGN",
      decimals: 6,
      address: "0x52828daa48c1a9a06f37500882b42daf0be04c3b",
      imageUrl: "/logos/cngn-logo.svg",
    },
  ],
  "BNB Smart Chain": [
    {
      name: "Tether USD",
      symbol: "USDT",
      decimals: 18,
      address: "0x55d398326f99059ff775485246999027b3197955",
      imageUrl: "/logos/usdt-logo.svg",
    },
    {
      name: "USD Coin",
      symbol: "USDC",
      decimals: 18,
      address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
      imageUrl: "/logos/usdc-logo.svg",
    },
    {
      name: "Compliant Naira",
      symbol: "cNGN",
      decimals: 6,
      address: "0xa8aea66b361a8d53e8865c62d142167af28af058",
      imageUrl: "/logos/cngn-logo.svg",
    },
  ],
  Celo: [
    {
      name: "USD Coin",
      symbol: "USDC",
      decimals: 6,
      address: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
      imageUrl: "/logos/usdc-logo.svg",
    },
    {
      name: "Tether USD",
      symbol: "USDT",
      decimals: 6,
      address: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
      imageUrl: "/logos/usdt-logo.svg",
    },
    {
      name: "Celo Dollar",
      symbol: "cUSD",
      decimals: 18,
      address: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
      imageUrl: "/logos/cusd-logo.svg",
    },
  ],
  Scroll: [
    {
      name: "USD Coin",
      symbol: "USDC",
      decimals: 6,
      address: "0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4",
      imageUrl: "/logos/usdc-logo.svg",
    },
    {
      name: "Tether USD",
      symbol: "USDT",
      decimals: 6,
      address: "0xf55BEC9cafDbE8730f096Aa55dad6D22d44099Df",
      imageUrl: "/logos/usdt-logo.svg",
    },
  ],
  Lisk: [
    {
      name: "Tether USD",
      symbol: "USDT",
      decimals: 6,
      address: "0x05D032ac25d322df992303dCa074EE7392C117b9",
      imageUrl: "/logos/usdt-logo.svg",
    },
    {
      name: "Compliant Naira",
      symbol: "cNGN",
      decimals: 6,
      address: "0xC7aB2C35Ea37236e644C24A4E4a1911c082887c0",
      imageUrl: "/logos/cngn-logo.svg",
    },
  ],
  Ethereum: [
    {
      name: "USD Coin",
      symbol: "USDC",
      decimals: 6,
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      imageUrl: "/logos/usdc-logo.svg",
    },
    {
      name: "Tether USD",
      symbol: "USDT",
      decimals: 6,
      address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      imageUrl: "/logos/usdt-logo.svg",
    },
    {
      name: "Compliant Naira",
      symbol: "cNGN",
      decimals: 6,
      address: "0x17CDB2a01e7a34CbB3DD4b83260B05d0274C8dab",
      imageUrl: "/logos/cngn-logo.svg",
    },
  ],
  Starknet: [
    {
      name: "USD Coin",
      symbol: "USDC",
      decimals: 6,
      address:
        "0x033068F6539f8e6e6b131e6B2B814e6c34A5224bC66947c47DaB9dFeE93b35fb",
      imageUrl: "/logos/usdc-logo.svg",
    },
    {
      name: "Tether USD",
      symbol: "USDT",
      decimals: 6,
      address:
        "0x068F5c6a61780768455de69077E07e89787839bf8166dEcfBf92B645209c0fB8",
      imageUrl: "/logos/usdt-logo.svg",
    },
  ],
};

/**
 * Retrieves supported tokens for a specific network with caching
 * Uses API data with fallback to emergency tokens if unavailable
 * Note: This function is primarily used for individual network queries.
 * The TokensContext handles bulk fetching for all networks.
 *
 * @param network - The network name (e.g., "Base", "Arbitrum One")
 * @returns Array of supported tokens for the specified network
 */

// Track ongoing fetch to prevent race conditions
let ongoingFetch: Promise<void> | null = null;

export async function getNetworkTokens(network = ""): Promise<Token[]> {
  const now = Date.now();
  // Return cached data if still valid
  if (tokensCache[network] && now - lastTokenFetch < TOKEN_CACHE_DURATION) {
    return tokensCache[network] || [];
  }
  try {
    // Only fetch if cache is completely empty or expired
    if (
      Object.keys(tokensCache).length === 0 ||
      now - lastTokenFetch >= TOKEN_CACHE_DURATION
    ) {
      // If there's an ongoing fetch, wait for it
      if (ongoingFetch) {
        await ongoingFetch;
        return tokensCache[network] || [];
      }
      // Start new fetch
      ongoingFetch = (async () => {
        const apiTokens = await fetchTokens();
        // Group tokens by network and map to our format
        const tokens: { [network: string]: Token[] } = {};
        apiTokens.forEach((apiToken: APIToken) => {
          const networkName = normalizeNetworkName(apiToken.network);
          if (!tokens[networkName]) {
            tokens[networkName] = [];
          }
          tokens[networkName].push(transformToken(apiToken));
        });

        // Merge fallback tokens for any networks missing from API response
        Object.keys(FALLBACK_TOKENS).forEach((networkName) => {
          if (!tokens[networkName] || tokens[networkName].length === 0) {
            tokens[networkName] = FALLBACK_TOKENS[networkName];
          }
        });
        tokensCache = tokens;
        lastTokenFetch = now;
      })();
      await ongoingFetch;
      ongoingFetch = null;
    }
    return tokensCache[network] || [];
  } catch (error) {
    console.error("Failed to fetch tokens from API, using fallback:", error);
    ongoingFetch = null;
    // Return fallback tokens if API fails
    return FALLBACK_TOKENS[network];
  }
}

/** One balance row per token on a single chain ({@link UnifiedWalletBalances}). */
export type ChainBalanceEntry = {
  chainName: string;
  chainId?: number;
  symbol: string;
  address: string;
  decimals: number;
  /** Human-readable units (same convention as legacy `balances[symbol]`). */
  balance: number;
  balanceWei?: bigint;
};

/**
 * Canonical balance snapshot for either EVM (viem client) or Starknet (RPC provider).
 */
export type UnifiedWalletBalances = {
  chainName: string;
  chainId?: number;
  entries: ChainBalanceEntry[];
  total: number;
  balances: Record<string, number>;
  balancesInWei?: Record<string, bigint>;
  /** Starknet parity: mirrors `balances` (display units), not an external oracle. */
  balancesUsd?: Record<string, number>;
};

export type FetchBalancesForChainArgs =
  | {
      kind: "evm";
      client: any;
      walletAddress: string;
    }
  | {
      kind: "starknet";
      walletAddress: string;
      tokens?: Token[];
    };

async function fetchEvmBalancesUnified(
  client: any,
  address: string,
): Promise<UnifiedWalletBalances> {
  const supportedTokens = await getNetworkTokens(client.chain?.name);
  const chainName = client.chain?.name ?? "Unknown";
  const chainId =
    typeof client.chain?.id === "number" ? client.chain.id : undefined;

  const empty = (): UnifiedWalletBalances => ({
    chainName,
    chainId,
    entries: [],
    total: 0,
    balances: {},
    balancesInWei: {},
  });

  if (!supportedTokens) return empty();

  let totalBalance = 0;
  const balances: Record<string, number> = {};
  const balancesInWei: Record<string, bigint> = {};

  try {
    const balancePromises = supportedTokens.map(async (token: Token) => {
      try {
        if (token.isNative && token.address === "") {
          const balanceInWei = await client.getBalance({ address });
          balancesInWei[token.symbol] = balanceInWei;
          const balance = Number(balanceInWei) / Math.pow(10, token.decimals);
          balances[token.symbol] = isNaN(balance) ? 0 : balance;
          return balances[token.symbol];
        }
        const balanceInWei = await client.readContract({
          address: token.address as `0x${string}`,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address as `0x${string}`],
        });
        balancesInWei[token.symbol] = balanceInWei as bigint;
        const balance = Number(balanceInWei) / Math.pow(10, token.decimals);
        balances[token.symbol] = isNaN(balance) ? 0 : balance;
        return balances[token.symbol];
      } catch (error) {
        console.error(`Error fetching balance for ${token.symbol}:`, error);
        balances[token.symbol] = 0;
        balancesInWei[token.symbol] = BigInt(0);
        return 0;
      }
    });

    const tokenBalances = await Promise.all(balancePromises);
    totalBalance = tokenBalances.reduce(
      (acc: number, curr: number) => (acc || 0) + (curr || 0),
      0,
    );

    const entries: ChainBalanceEntry[] = supportedTokens.map((token) => ({
      chainName,
      chainId,
      symbol: token.symbol,
      address: token.address ?? "",
      decimals: token.decimals,
      balance: balances[token.symbol] ?? 0,
      balanceWei: balancesInWei[token.symbol],
    }));

    return {
      chainName,
      chainId,
      entries,
      total: isNaN(totalBalance) ? 0 : totalBalance,
      balances,
      balancesInWei,
    };
  } catch {
    return empty();
  }
}

async function fetchStarknetBalancesUnified(
  address: string,
  tokens: Token[],
): Promise<UnifiedWalletBalances> {
  const chainName = "Starknet";

  const emptyUsd = (): UnifiedWalletBalances => ({
    chainName,
    entries: [],
    total: 0,
    balances: {},
    balancesUsd: {},
  });

  if (!address || !tokens || tokens.length === 0) {
    return emptyUsd();
  }

  try {
    const { createStarknetRpcProvider } = await import("./lib/starknetRpc");
    const rpcUrl = process.env.NEXT_PUBLIC_STARKNET_RPC_URL;
    const provider = createStarknetRpcProvider(rpcUrl);

    const balances: Record<string, number> = {};
    const balancesUsd: Record<string, number> = {};

    const balancePromises = tokens.map(async (token: Token) => {
      try {
        const result = await provider.callContract({
          contractAddress: token.address,
          entrypoint: "balanceOf",
          calldata: [address],
        });

        let balanceInWei: bigint;
        if (Array.isArray(result) && result.length >= 2) {
          const low = BigInt(result[0]);
          const high = BigInt(result[1]);
          balanceInWei = low + (high << BigInt(128));
        } else if (Array.isArray(result) && result.length === 1) {
          balanceInWei = BigInt(result[0]);
        } else {
          balanceInWei = BigInt(0);
        }

        const balance = Number(balanceInWei) / Math.pow(10, token.decimals);
        balances[token.symbol] = isNaN(balance) ? 0 : balance;
        balancesUsd[token.symbol] = balances[token.symbol];
        return balances[token.symbol];
      } catch {
        balances[token.symbol] = 0;
        balancesUsd[token.symbol] = 0;
        return 0;
      }
    });

    const perTokenAmounts = await Promise.all(balancePromises);
    const totalBalance = perTokenAmounts.reduce(
      (acc: number, curr: number) => (acc || 0) + (curr || 0),
      0,
    );

    const entries: ChainBalanceEntry[] = tokens.map((token) => ({
      chainName,
      symbol: token.symbol,
      address: token.address,
      decimals: token.decimals,
      balance: balances[token.symbol] ?? 0,
    }));

    return {
      chainName,
      entries,
      total: isNaN(totalBalance) ? 0 : totalBalance,
      balances,
      balancesUsd,
    };
  } catch {
    return emptyUsd();
  }
}

/**
 * Single entry point: load supported-token balances for an EVM client or a Starknet address.
 * Returns one {@link ChainBalanceEntry} per token plus legacy `balances` / `total` maps.
 */
export async function fetchBalancesForChain(
  args: FetchBalancesForChainArgs,
): Promise<UnifiedWalletBalances> {
  if (args.kind === "starknet") {
    const tokens = args.tokens ?? (await getNetworkTokens("Starknet"));
    return fetchStarknetBalancesUnified(args.walletAddress, tokens);
  }
  return fetchEvmBalancesUnified(args.client, args.walletAddress);
}

/**
 * Starknet balances for supported tokens (same human units as EVM).
 * For `entries` / unified shape see {@link fetchBalancesForChain}.
 */
export async function fetchStarknetBalance(
  address: string,
  tokens: Token[],
): Promise<{
  total: number;
  balances: Record<string, number>;
  balancesUsd: Record<string, number>;
}> {
  const u = await fetchStarknetBalancesUnified(address, tokens);
  return {
    total: u.total,
    balances: u.balances,
    balancesUsd: u.balancesUsd ?? {},
  };
}

/**
 * EVM balances via viem public client. For `entries` / unified shape see {@link fetchBalancesForChain}.
 */
export async function fetchWalletBalance(
  client: any,
  address: string,
): Promise<{ total: number; balances: Record<string, number>; balancesInWei: Record<string, bigint> }> {
  const u = await fetchEvmBalancesUnified(client, address);
  return {
    total: u.total,
    balances: u.balances,
    balancesInWei: u.balancesInWei ?? {},
  };
}

/**
 * Calculates the correct total balance by converting cNGN to USD equivalent
 * This should be used at the context level where rates are available
 * @param rawBalance - The raw balance object from fetchWalletBalance
 * @param cngnRate - The current CNGN to USD rate
 * @returns Corrected total balance with cNGN converted to USD
 */
export function calculateCorrectedTotalBalance(
  rawBalance: { total: number; balances: Record<string, number> },
  cngnRate: number | null,
): number {
  let correctedTotal = rawBalance.total;

  // Handle both "cNGN" and "CNGN" keys consistently.
  const cngnBalance = ["cNGN", "CNGN"].reduce((sum, symbol) => {
    const value = rawBalance.balances[symbol];
    if (typeof value === "number" && !isNaN(value) && value > 0) {
      return sum + value;
    }
    return sum;
  }, 0);

  // Remove the raw cNGN value (which was counted as 1:1 USD).
  if (cngnBalance > 0) {
    correctedTotal -= cngnBalance;

    // Add back USD equivalent only when a valid positive rate is available.
    if (cngnRate && cngnRate > 0) {
      correctedTotal += cngnBalance / cngnRate;
    }
  }

  return isNaN(correctedTotal) ? 0 : correctedTotal;
}

/**
 * Fetches wallet balance for a specific EVM network (builds a viem public client).
 *
 * @param network - The Network object containing chain info
 * @param walletAddress - The wallet address to fetch balance for
 * @returns Unified shape (includes `entries`); legacy fields `total`, `balances`, `balancesInWei` preserved
 */
export async function fetchBalanceForNetwork(
  network: { chain: any },
  walletAddress: string,
): Promise<UnifiedWalletBalances> {
  const { createPublicClient, http } = await import("viem");

  const rpcUrl = getRpcUrl(network.chain.name);

  const publicClient = createPublicClient({
    chain: network.chain,
    transport: http(rpcUrl),
  });

  return fetchEvmBalancesUnified(publicClient, walletAddress);
}

/**
 * Shortens the given address by replacing the middle characters with ellipsis.
 * @param address - The address to be shortened.
 * @param startChars - The number of characters to keep at the beginning of the address. Default is 4.
 * @param endChars - The number of characters to keep at the end of the address. Default is the same as startChars.
 * @returns The shortened address.
 */
export function shortenAddress(
  address: string,
  startChars = 4,
  endChars = startChars,
): string {
  if (address.length <= startChars + endChars) {
    return address;
  }
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

/**
 * Resolves ENS name from wallet address for supported networks
 * Falls back to first 5 chars if no ENS name found
 * @param address - The wallet address to resolve
 * @param networkName - Optional network name (Lisk doesn't support ENS)
 * @returns Promise<string> - ENS name or shortened address (first 5 chars after 0x)
 */
export async function resolveEnsNameOrShorten(
  address: string,
  networkName?: string,
): Promise<string> {
  if (!address) {
    return "";
  }

  if (!isValidEvmAddressCaseInsensitive(address)) {
    return address.slice(0, 5);
  }

  // Lisk doesn't support ENS, return shortened address immediately
  if (networkName === "Lisk") {
    return address.slice(2, 7); // First 5 chars (skip 0x)
  }

  try {

    // ENS reverse resolution works on Ethereum mainnet
    // But names can resolve to addresses on L2 networks (Base, Arbitrum, Polygon)
    const publicClient = createPublicClient({
      chain: mainnet,
      transport: http("https://eth.llamarpc.com"), // Public Ethereum RPC
    });

    const ensName = await getEnsName(publicClient, {
      address: address.toLowerCase() as `0x${string}`,
    });

    if (ensName) {
      return ensName;
    }

    // Fallback to first 5 chars (skip 0x)
    return address.slice(2, 7);
  } catch (error) {
    console.error("Error resolving ENS name:", error);
    // Fallback to first 5 chars (skip 0x)
    return address.slice(2, 7);
  }
}

/**
 * Normalizes a Starknet address to ensure it's properly formatted.
 * Ensures the address is exactly 66 characters long (0x + 64 hex chars).
 * Pads with zeros after the 0x prefix if necessary.
 *
 * @param address - The Starknet address to normalize (can be shorter than 66 chars)
 * @returns The normalized address with proper padding (0x0...address)
 * @throws Error if the address is invalid
 *
 * @example
 * normalizeStarknetAddress("0x1234") => "0x0000000000000000000000000000000000000000000000000000000000001234"
 * normalizeStarknetAddress("0x04718f5a...") => "0x04718f5a..." (already normalized)
 */
export function normalizeStarknetAddress(address: string): string {
  // Remove any whitespace
  const trimmedAddress = address?.trim();

  // Validate that address starts with 0x
  if (!trimmedAddress?.startsWith("0x")) {
    throw new Error("Starknet address must start with 0x");
  }

  // Extract hex part (without 0x prefix)
  const hexPart = trimmedAddress?.slice(2);

  // Validate hex characters
  if (!/^[a-fA-F0-9]*$/.test(hexPart)) {
    throw new Error("Invalid hex characters in Starknet address");
  }

  if (hexPart.length === 0) {
    throw new Error("Starknet address has no hex digits after 0x");
  }

  if (/^0+$/.test(hexPart)) {
    throw new Error("Starknet address cannot be the zero address");
  }

  // Validate length (must not exceed 64 hex chars)
  if (hexPart.length > 64) {
    throw new Error(
      "Starknet address too long (max 64 hex characters after 0x)",
    );
  }

  // Pad with zeros after 0x to make it 66 chars total
  const paddedHex = hexPart.padStart(64, "0");

  return `0x${paddedHex}`;
}

/**
 * Normalizes network name for rate fetching API.
 * @param network - The network name to normalize.
 * @returns The normalized network name for rate fetching.
 */
export function normalizeNetworkForRateFetch(network: string): string {
  return network.toLowerCase().replace(/\s+/g, "-");
}

/**
 * Retrieves the contract address for the specified network.
 * @param network - The network for which to retrieve the contract address.
 * @returns The contract address for the specified network, or undefined if the network is not found.
 */
export function getGatewayContractAddress(network = ""): string | undefined {
  return {
    Base: "0x30f6a8457f8e42371e204a9c103f2bd42341dd0f",
    "Arbitrum One": "0xe8bc3b607cfe68f47000e3d200310d49041148fc",
    "BNB Smart Chain": "0x1fa0ee7f9410f6fa49b7ad5da72cf01647090028",
    Polygon: "0xfb411cc6385af50a562afcb441864e9d541cda67",
    Scroll: "0x663c5bfe7d44ba946c2dd4b2d1cf9580319f9338",
    Optimism: "0xd293fcd3dbc025603911853d893a4724cf9f70a0",
    Celo: "0xf418217e3f81092ef44b81c5c8336e6a6fdb0e4b",
    Lisk: "0xff0E00E0110C1FBb5315D276243497b66D3a4d8a",
    Ethereum: "0x8d2c0d398832b814e3814802ff2dc8b8ef4381e5",
    Starknet: "0x06ff3a3b1532da65594fc98f9ca7200af6c3dbaf37e7339b0ebd3b3f2390c583",
  }[network];
}

/**
 * Generates a time-based nonce string.
 *
 * The nonce is composed of a time component based on the current timestamp
 * and a random component. The length of the random component can be specified.
 *
 * @param {Object} [options] - Options for generating the nonce.
 * @param {number} [options.length=16] - The length of the random component of the nonce.
 * @returns {string} A nonce string composed of a time component and a random component.
 */
export function generateTimeBasedNonce({
  length = 16,
}: {
  length?: number;
}): string {
  const timeComponent = Date.now().toString(36);
  const randomComponent = Math.random()
    .toString(36)
    .substring(2, 2 + length);
  return timeComponent + randomComponent;
}

/**
 * Parses a chain ID from the CAIP-2 format and returns it as a number.
 *
 * @param chainId - The chain ID in CAIP-2 format (e.g., 'eip155:1').
 * @returns The numeric chain ID.
 */
export function parsePrivyChainId(chainId: string): number {
  // Privy returns chain IDs in CAIP-2 format: 'eip155:1'
  return Number(chainId.split(":")[1]);
}

/**
 * Utility function to get saved recipients from localStorage.
 *
 * @param key - The localStorage key to retrieve the saved recipients.
 * @returns An array of saved recipients.
 */
export const getSavedRecipients = (key: string) => {
  const savedRecipients = localStorage.getItem(key);
  return savedRecipients ? JSON.parse(savedRecipients) : [];
};

/**
 * Clears all form states.
 * @param formMethods - The form methods from react-hook-form.
 */
export function clearFormState(formMethods: any) {
  formMethods.reset();
}

/**
 * Determines if the app should use an injected wallet.
 *
 * @param searchParams - The URL search parameters to check for the 'injected' flag
 * @returns boolean indicating whether to use injected wallet
 */
export function shouldUseInjectedWallet(
  searchParams: URLSearchParams,
): boolean {
  const injectedParam = searchParams.get("injected");
  return Boolean(injectedParam === "true" && window.ethereum);
}

/**
 * Generates a random color based on the provided name.
 *
 * @param name - The name of the recipient to generate a color for.
 * @returns A color string from the `colors` array.
 */
export const getRandomColor = (name: string) => {
  const index = name
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[index % colors.length];
};

/**
 * Checks if the current domain is exactly the main production domain (noblocks.xyz).
 * This excludes subdomains and paths, only matching the exact domain.
 *
 * @returns {boolean} True if on the main production domain, false otherwise
 */
export const IS_MAIN_PRODUCTION_DOMAIN =
  typeof window !== "undefined" &&
  /^(?:www\.)?noblocks\.xyz$/.test(window.location.hostname);

/**
 * Detects the current injected wallet provider.
 * @returns The name of the detected wallet provider or "Injected Wallet" if unknown
 */
export function detectWalletProvider(): string {
  if (typeof window === "undefined" || !window.ethereum) {
    return "Injected Wallet";
  }

  const ethereum = window.ethereum;

  switch (true) {
    case ethereum.isMetaMask:
      return "MetaMask";
    case ethereum.isCoinbaseWallet:
      return "Coinbase Wallet";
    case ethereum.isTrust:
      return "Trust Wallet";
    case ethereum.isBraveWallet:
      return "Brave Wallet";
    case ethereum.isBitKeep:
      return "BitKeep Wallet";
    case ethereum.isTokenPocket:
      return "TokenPocket";
    case ethereum.isOneInchIOSWallet || ethereum.isOneInchAndroidWallet:
      return "1inch Wallet";
    case ethereum.isMiniPay:
      return "MiniPay";
    default:
      return "Injected Wallet";
  }
}

/**
 * Converts a number to a "0x" prefixed hex string.
 * @param num - The number to convert
 * @returns A "0x" prefixed hex string
 * @throws Error if num is undefined or not a number
 */
function toHex(num: number | undefined): string {
  if (typeof num !== "number") {
    throw new Error(`Invalid chain ID: ${num}`);
  }
  return `0x${num.toString(16)}`;
}

/**
 * Gets the network parameters for adding a new chain
 */
function getAddChainParameters(network: Network) {
  const { chain } = network;
  return {
    chainId: toHex(chain.id),
    chainName: chain.name,
    nativeCurrency: chain.nativeCurrency,
    rpcUrls: [chain.rpcUrls.default.http[0]],
    blockExplorerUrls: [chain.blockExplorers?.default.url],
  };
}

/**
 * Handles network switching logic for both injected and non-injected wallets.
 *
 * @param network - The network object to switch to.
 * @param useInjectedWallet - Boolean indicating if an injected wallet is being used.
 * @param setSelectedNetwork - Function to update the selected network state.
 * @param onSuccess - Callback function to execute on successful network switch.
 * @param onError - Callback function to execute on network switch failure.
 * @param ensureWalletExists - Optional function to ensure Starknet wallet exists (for Starknet).
 */
export const handleNetworkSwitch = async (
  network: Network,
  useInjectedWallet: boolean,
  setSelectedNetwork: (network: Network) => void,
  onSuccess: () => void,
  onError: (error: Error) => void,
  ensureWalletExists?: () => Promise<void>,
) => {
  // If switching to Starknet, ensure wallet exists first (do not change network on failure)
  if (network.chain.name === "Starknet" && ensureWalletExists) {
    try {
      await ensureWalletExists();
    } catch (error) {
      console.error("Failed to ensure Starknet wallet exists:", error);
      onError(error instanceof Error ? error : new Error(String(error)));
      return;
    }
  }

  if (useInjectedWallet && window.ethereum) {
    if (!network.chain?.id) {
      throw new Error(`Missing chainId for network: ${network.chain?.name}`);
    }

    const chainId = toHex(network.chain.id);

    try {
      toast.promise(
        (async () => {
          try {
            // First try to switch to the network
            await (window.ethereum as any).request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId }],
            });
          } catch (switchError: any) {
            // This error code indicates that the chain has not been added to MetaMask.
            if (switchError.code === 4902) {
              await (window.ethereum as any).request({
                method: "wallet_addEthereumChain",
                params: [getAddChainParameters(network)],
              });
            } else {
              throw switchError;
            }
          }
        })(),
        {
          loading: `Switching to ${network.chain.name}...`,
          success: `Successfully switched to ${network.chain.name}`,
          error: (err) => err.message,
        },
      );

      setSelectedNetwork(network);
      onSuccess();
    } catch (error) {
      console.error("Network switch error:", error);
      onError(error as Error);
    }
  } else {
    setSelectedNetwork(network);
    onSuccess();
  }
};

/**
 * Gets the appropriate network logo URL based on the current theme
 * @param network - The network object containing imageUrl
 * @param isDark - Boolean indicating if dark theme is active
 * @returns The URL string for the network logo
 */
export function getNetworkImageUrl(network: Network, isDark: boolean): string {
  if (typeof network.imageUrl === "string") {
    return network.imageUrl;
  }
  return isDark ? network.imageUrl.dark : network.imageUrl.light;
}

/**
 * Converts a currency code to its corresponding country code.
 * For most currencies, returns the first two letters of the currency code in lowercase.
 * For special cases like XAF, XOF etc, returns specific country codes from the overrides.
 *
 * @param currency - The currency code (e.g. "USD", "XAF", "NGN")
 * @returns The two-letter country code in lowercase
 */
export const currencyToCountryCode = (currency: string) => {
  const currencyOverrides: Record<string, string> = {
    XAF: "cm", // Central African CFA Franc (Cameroon)
    XOF: "sn", // West African CFA Franc (Senegal)
    XCD: "ag", // East Caribbean Dollar (Antigua & Barbuda)
    XPF: "nc", // CFP Franc (New Caledonia)
    XDR: "", // No country (IMF Special Drawing Rights)
  };

  return currencyOverrides[currency] || currency.slice(0, 2).toLowerCase();
};

export const generatePaginationItems = (
  currentPage: number,
  totalPages: number,
) => {
  const items = [];
  const maxVisiblePages = 5;

  if (totalPages <= maxVisiblePages) {
    // If total pages is less than max visible, show all pages
    for (let i = 1; i <= totalPages; i++) {
      items.push(i);
    }
  } else {
    // Always show first page
    items.push(1);

    // Calculate start and end of visible pages
    let start = Math.max(2, currentPage - 1);
    let end = Math.min(totalPages - 1, currentPage + 1);

    // Adjust if at the start
    if (currentPage <= 2) {
      end = 4;
    }
    // Adjust if at the end
    if (currentPage >= totalPages - 1) {
      start = totalPages - 3;
    }

    // Add ellipsis after first page if needed
    if (start > 2) {
      items.push("...");
    }

    // Add middle pages
    for (let i = start; i <= end; i++) {
      items.push(i);
    }

    // Add ellipsis before last page if needed
    if (end < totalPages - 1) {
      items.push("...");
    }

    // Always show last page
    items.push(totalPages);
  }

  return items;
};

/**
 * Formats a date into a relative time string (e.g., "Today", "Yesterday", "2 days ago")
 * @param date - The date to format
 * @returns A string representing the relative time
 */
export const getRelativeDate = (date: Date): string => {
  const now = new Date();
  const diffTime = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return "Today";
  } else if (diffDays === 1) {
    return "Yesterday";
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} ${weeks === 1 ? "week" : "weeks"} ago`;
  } else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months} ${months === 1 ? "month" : "months"} ago`;
  } else {
    const years = Math.floor(diffDays / 365);
    return `${years} ${years === 1 ? "year" : "years"} ago`;
  }
};

/**
 * Fetches the user's country code based on their IP address using the GeoJS API.
 *
 * @returns A promise that resolves to the user's country code as a string (e.g., "US"),
 * or `null` if the country code could not be determined or an error occurs.
 *
 */
export async function fetchUserCountryCode(): Promise<string | null> {
  try {
    const response = await fetch("https://get.geojs.io/v1/ip/country.json");
    if (!response.ok) return null;
    const data = await response.json();
    return data.country || null;
  } catch {
    return null;
  }
}

/**
 * Maps a given ISO 3166-1 alpha-2 country code to its corresponding currency code.
 *
 * @param countryCode - The two-letter country code (e.g., 'NG' for Nigeria, 'US' for United States).
 * @returns The ISO 4217 currency code as a string if the country code is recognized; otherwise, returns null.
 *
 */
export function mapCountryToCurrency(countryCode: string): string | null {
  const mapping: Record<string, string> = {
    NG: "NGN",
    KE: "KES",
    UG: "UGX",
    TZ: "TZS",
    GH: "GHS",
    BR: "BRL",
    AR: "ARS",
    US: "USD",
    GB: "GBP",
    MW: "MWK",
    // add more as needed
  };
  return mapping[countryCode] || null;
}

/**
 * Reorders a list of currency codes so that the preferred currency appears first.
 *
 * If the preferred currency is found in the list (and is not already first), it is moved to the front.
 * If the preferred currency is not specified or is already first, the original list is returned unchanged.
 *
 * @param currencies - An array of currency codes (e.g., ['USD', 'EUR', 'JPY']).
 * @param preferredCurrency - The currency code to prioritize, or null if no preference.
 * @returns A new array of currency codes with the preferred currency first, if applicable.
 */
export function reorderCurrencies(
  currencies: string[],
  preferredCurrency: string | null,
): string[] {
  if (!preferredCurrency) return currencies;
  const idx = currencies.indexOf(preferredCurrency);
  if (idx > 0) {
    const reordered = [...currencies];
    reordered.splice(idx, 1);
    reordered.unshift(preferredCurrency);
    return reordered;
  }
  return currencies;
}

/**
 * Reorders currencies based on user's location and returns the ordered currencies
 *
 * @param currencies - Array of currency objects to reorder
 * @param formMethods - React Hook Form methods to check current currency value
 * @returns Promise that resolves to the reordered currencies array
 */
export async function reorderCurrenciesByLocation(
  currencies: Currency[],
  formMethods: any,
): Promise<Currency[]> {
  try {
    const countryCode = await fetchUserCountryCode();
    const preferredCurrency = countryCode
      ? mapCountryToCurrency(countryCode)
      : null;

    if (formMethods.getValues("currency")) {
      return currencies;
    }

    const currencyNames = currencies.map((c) => c.name);
    const reorderedNames = reorderCurrencies(currencyNames, preferredCurrency);

    // Map back to full currency objects while preserving all properties
    return reorderedNames
      .map((name) => currencies.find((c) => c.name === name))
      .filter((c): c is Currency => c !== undefined);
  } catch {
    return currencies;
  }
}

// Blog utilities
export function filterBlogsAndCategories({
  blogs,
  selectedCategory,
  searchValue,
  categoriesInPosts,
}: {
  blogs: SanityPost[];
  selectedCategory: string;
  searchValue: string;
  categoriesInPosts: SanityCategory[];
}): {
  filteredBlogs: SanityPost[];
  filteredCategoriesInPosts: SanityCategory[];
  filterCategories: SanityCategory[];
} {
  // Filter blogs by category and search
  const filteredBlogs = blogs.filter((blog: SanityPost) => {
    const matchesCategory =
      selectedCategory === "all" || blog.category?._id === selectedCategory;
    const matchesSearch =
      !searchValue ||
      blog.title.toLowerCase().includes(searchValue.toLowerCase()) ||
      blog.excerpt?.toLowerCase().includes(searchValue.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Update categories based on filtered blogs
  const filteredCategoriesInPosts: SanityCategory[] = Array.from(
    new Set(
      filteredBlogs
        .filter(
          (post): post is SanityPost & { category: SanityCategory } =>
            post.category !== undefined && post.category !== null,
        )
        .map((post) => post.category._id),
    ),
  )
    .map(
      (id) => filteredBlogs.find((post) => post.category?._id === id)?.category,
    )
    .filter((category): category is SanityCategory => category !== undefined);

  // Update filter categories
  const newFilterCategories: SanityCategory[] = [
    { _id: "all", title: "All" },
    ...(searchValue ? filteredCategoriesInPosts : categoriesInPosts),
  ];

  return {
    filteredBlogs,
    filteredCategoriesInPosts,
    filterCategories: newFilterCategories,
  };
}

/**
 * Get banner padding classes based on banner visibility
 * @returns string - CSS classes for banner padding
 */
export function getBannerPadding(): string {
  const hasBanner = !!config.noticeBannerText;
  return hasBanner ? "pt-52" : "pt-36";
}

/**
 * Gets the preferred token for rate fetching on a specific network
 * Prioritizes USDC, then USDT, then the first available token
 * @param network - The network name (e.g., "Base", "Arbitrum One")
 * @returns Promise<string> - The token symbol to use for rate fetching
 */
export async function getPreferredRateToken(network: string): Promise<string> {
  try {
    const supportedTokens = await getNetworkTokens(network);
    if (!supportedTokens || supportedTokens.length === 0) {
      // Fallback to USDC if no tokens available
      return "USDC";
    }

    const tokenSymbols = supportedTokens.map((token) => token.symbol);

    // Prioritize USDC first (most widely supported)
    if (tokenSymbols.includes("USDC")) {
      return "USDC";
    }

    // Then USDT as fallback
    if (tokenSymbols.includes("USDT")) {
      return "USDT";
    }

    // Use the first available token as last resort
    return tokenSymbols[0];
  } catch (error) {
    console.error("Error getting preferred rate token:", error);
    // Default fallback
    return "USDC";
  }
}

/**
 * Formats a number with proper decimal precision to avoid floating-point arithmetic issues.
 * This is particularly useful for setting max values in forms.
 * Always truncates to ensure the result never exceeds the original value.
 * @param num - The number to format
 * @param maxDecimals - Maximum number of decimal places (default: 4)
 * @returns The formatted number as a number
 */
export function formatDecimalPrecision(
  num: number,
  maxDecimals: number = 4,
): number {
  if (typeof num !== "number" || isNaN(num)) {
    return 0;
  }

  // Use Math.floor to truncate instead of rounding to ensure we never exceed the original value
  const multiplier = Math.pow(10, maxDecimals);
  const truncated = Math.floor(num * multiplier) / multiplier;
  return truncated;
}

// BlockFest utilities
export const BLOCKFEST_END_DATE = new Date(config.blockfestEndDate);

/**
 * Check if BlockFest campaign is currently active
 * @returns true if campaign is active, false if expired
 */
export const isBlockFestActive = (): boolean => {
  return Date.now() <= BLOCKFEST_END_DATE.getTime();
};

/**
 * Check if BlockFest campaign has expired
 * @returns true if campaign has expired, false if still active
 */
export const isBlockFestExpired = (): boolean => {
  return Date.now() > BLOCKFEST_END_DATE.getTime();
};

/**
 * Get time remaining until BlockFest campaign ends
 * @returns milliseconds remaining (0 if expired)
 */
export const getBlockFestTimeRemaining = (): number => {
  return Math.max(0, BLOCKFEST_END_DATE.getTime() - Date.now());
};

/**
 * Calculates the sender fee and returns the fee amount and recipient address
 * @param amount - The transaction amount in human-readable token units
 * @param rate - The exchange rate (e.g., 1.0 for local transfers, other values for FX)
 * @param tokenDecimals - The number of decimals for the token (default: 18)
 * @returns An object containing:
 *   - feeAmount: The fee amount in human-readable format (for display)
 *   - feeAmountInBaseUnits: The fee amount in token base units (for contract calls)
 *   - feeRecipient: The fee recipient address
 */
export function calculateSenderFee(
  amount: number,
  rate: number,
  tokenDecimals: number = 18,
): { feeAmount: number; feeAmountInBaseUnits: bigint; feeRecipient: string } {
  const calculatedRate = Math.round(rate * 100);
  const isLocalTransfer = calculatedRate === 100;
  const decimalsMultiplier = BigInt(10 ** tokenDecimals);
  const maxFeeCapInBaseUnits =
    BigInt(Math.floor(localTransferFeeCap)) * decimalsMultiplier;

  // Calculate fee in human-readable format
  const calculatedFee = isLocalTransfer
    ? (amount * localTransferFeePercent) / 100
    : 0;

  // Convert to base units
  const calculatedFeeInBaseUnits = BigInt(
    Math.floor(calculatedFee * Number(decimalsMultiplier)),
  );

  // Apply cap in base units
  const feeAmountInBaseUnits = isLocalTransfer
    ? calculatedFeeInBaseUnits > maxFeeCapInBaseUnits
      ? maxFeeCapInBaseUnits
      : calculatedFeeInBaseUnits
    : BigInt(0);

  // Convert back to human-readable format for display
  const feeAmount = Number(feeAmountInBaseUnits) / Number(decimalsMultiplier);

  const feeRecipient = isLocalTransfer
    ? feeRecipientAddress
    : "0x0000000000000000000000000000000000000000";

  return { feeAmount, feeAmountInBaseUnits, feeRecipient };
}

/**
 * Get avatar image path based on wallet address
 * Loops through 8 avatars (Avatar.png, Avatar1.png through Avatar7.png)
 * @param address - Wallet address string
 * @returns Path to the avatar image
 */
export const getAvatarImage = (address: string): string => {
  const avatarCount = 8;
  const index = parseInt(address.slice(2, 4), 16) % avatarCount;

  if (index === 0) {
    return "/images/avatar/Avatar.png";
  }
  return `/images/avatar/Avatar${index}.png`;
};

/**
 * Copy referral code to clipboard
 * @param referralCode - The referral code to copy
 * @param onCopied - Callback function to handle copied state (optional)
 */
export const handleCopyCode = (
  referralCode: string | undefined,
  onCopied?: (value: boolean) => void
): void => {
  if (referralCode) {
    try {
      navigator.clipboard.writeText(referralCode);
      if (onCopied) {
        onCopied(true);
        setTimeout(() => onCopied(false), 2000);
      }
    } catch (error) {
      console.error("Failed to copy referral code:", error);
    }
  }
};

/**
 * Copy referral invite link to clipboard
 * @param referralCode - The referral code to use in the link
 */
export const handleCopyLink = (referralCode: string | undefined): void => {
  if (referralCode) {
    const link = `${window.location.origin}?ref=${referralCode}`;
    try {
      navigator.clipboard.writeText(link);
      toast.success("Referral link copied!");
    } catch (error) {
      console.error("Failed to copy referral link:", error);
      toast.error("Failed to copy link");
    }
  }
};

/**
 * Generate a unique 6-character referral code (NB + 4 alphanumeric)
 * Format: NB[A-Z0-9]{4}
 */
export function generateReferralCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "NB";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
 * Gets the avatar image path based on index, cycling through 1-4
 */
export const getAvatarImage = (index: number): string => {
  const avatarNumber = (index % 4) + 1;
  return `/images/onramp-avatar/avatar${avatarNumber}.png`;
};

/**
 * Copies text to clipboard and shows a toast notification.
 * Uses `navigator.clipboard` when available; falls back to `execCommand` when the API is
 * unavailable, non-secure context, or when `writeText` rejects.
 * @param label - Optional label for the toast (e.g. "Address", "Link") → "{label} copied to clipboard"
 * @returns Whether the copy succeeded
 */
export async function copyToClipboard(
  text: string,
  label?: string,
): Promise<boolean> {
  const fallbackCopy = () => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);

    try {
      textarea.focus();
      textarea.select();
      const ok = document.execCommand("copy");
      if (!ok) {
        throw new Error("execCommand copy failed");
      }
    } finally {
      textarea.remove();
    }
  };

  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        fallbackCopy();
      }
    } else {
      fallbackCopy();
    }
    toast.success(
      label ? `${label} copied to clipboard` : "Copied to clipboard",
    );
    return true;
  } catch {
    toast.error("Failed to copy");
    return false;
  }
}

export function mapProviderAccountToInstructions(
  a: V2FiatProviderAccountDTO,
  fallbackCurrency: string,
  fallbackAmount: number,
): OnrampPaymentInstructions {
  const raw = a.amountToTransfer?.replace(/,/g, "") ?? "";
  const parsed = raw ? parseFloat(raw) : fallbackAmount;
  return {
    provider:
      a.institution && a.accountName
        ? `${a.institution} | ${a.accountName}`
        : a.institution || a.accountName,
    accountNumber: a.accountIdentifier,
    amount: Number.isFinite(parsed) ? parsed : fallbackAmount,
    currency: a.currency || fallbackCurrency,
    expiresAt: new Date(a.validUntil),
  };
}

/** Same window as Make payment: not API `validUntil` until backend aligns. */
export const ONRAMP_CLIENT_PAYMENT_SESSION_MS = 30 * 60 * 1000;

/**
 * True when an on-ramp order is still pending/processing in the API but the
 * client payment window (30 minutes from `created_at`) has ended.
 */
export function isOnrampClientPaymentSessionExpired(
  transaction: Pick<
    TransactionHistory,
    "created_at" | "transaction_type" | "status"
  >,
): boolean {
  if (
    transaction.transaction_type !== "onramp" ||
    (transaction.status !== "pending" && transaction.status !== "processing")
  ) {
    return false;
  }
  const t = new Date(transaction.created_at).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() >= t + ONRAMP_CLIENT_PAYMENT_SESSION_MS;
}

/**
 * True when an on-ramp order is still **pending** (awaiting bank transfer), not yet **processing**.
 * Dot hides once history shows `processing` or terminal statuses.
 */
export function isOnrampAwaitingUserBankTransfer(
  transaction: Pick<
    TransactionHistory,
    "transaction_type" | "status" | "order_id" | "created_at"
  >,
): boolean {
  if (transaction.transaction_type !== "onramp" || !transaction.order_id) {
    return false;
  }
  const s = String(transaction.status ?? "").toLowerCase();
  if (s !== "pending") return false;
  const created = new Date(transaction.created_at).getTime();
  if (
    !Number.isNaN(created) &&
    Date.now() >= created + ONRAMP_CLIENT_PAYMENT_SESSION_MS
  ) {
    return false;
  }
  return true;
}

/** Whether any history row needs the user to complete a bank transfer for an on-ramp order. */
export function hasOnrampAwaitingBankTransfer(
  transactions: Pick<
    TransactionHistory,
    "transaction_type" | "status" | "order_id" | "created_at"
  >[],
): boolean {
  return transactions.some(isOnrampAwaitingUserBankTransfer);
}

/**
 * Animated pending indicator (orange): expanding ping ripple + solid core.
 * Navbar wallet pill and Transactions tab (client components only).
 */
export function OnrampPendingNotificationDot(): ReactElement {
  return createElement(
    "span",
    {
      className:
        "relative inline-flex h-3 w-3 shrink-0 items-center justify-center",
      "aria-hidden": true,
    },
    createElement("span", {
      className:
        "absolute inline-flex h-full w-full rounded-full bg-orange-500/50 motion-safe:animate-ping",
    }),
    createElement("span", {
      className:
        "relative z-[1] h-2 w-2 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.75)]",
    }),
  );
}
