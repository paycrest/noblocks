import JSEncrypt from "jsencrypt";
import type {
  InstitutionProps,
  Network,
  Token,
  Currency,
  APIToken,
} from "./types";
import type { SanityPost, SanityCategory } from "./blog/types";
import { erc20Abi } from "viem";
import { colors } from "./mocks";
import { fetchTokens } from "./api/aggregator";
import { toast } from "sonner";
import config from "./lib/config";

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
  // Create a new instance of Intl.NumberFormat with the 'en-US' locale and currency set to 'NGN'.
  // This object provides methods to format numbers based on the specified locale and options.
  return new Intl.NumberFormat(locale, {
    // Set the style to 'currency' to format the number as a currency value.
    style: "currency",
    // Set the currency to 'NGN' to format the number as Nigerian Naira.
    currency,
  }).format(value); // Format the provided value as a currency string.
};

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
    case "Hedera Mainnet":
      return `https://hashscan.io/mainnet/transaction/${txHash}`;
    default:
      return "";
  }
};

// write function to get rpc url for a given network
export function getRpcUrl(network: string) {
  switch (network) {
    case "Polygon":
      return `https://137.rpc.thirdweb.com/${process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID}`;
    case "BNB Smart Chain":
      return `https://56.rpc.thirdweb.com/${process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID}`;
    case "Base":
      return `https://8453.rpc.thirdweb.com/${process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID}`;
    case "Arbitrum One":
      return `https://42161.rpc.thirdweb.com/${process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID}`;
    case "Celo":
      return `https://42220.rpc.thirdweb.com/${process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID}`;
    case "Lisk":
      return `https://1135.rpc.thirdweb.com/${process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID}`;
    case "Hedera Mainnet":
      return "https://mainnet.hashio.io/api";
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
      name: "cNGN",
      symbol: "cNGN",
      decimals: 6,
      address: "0x46c85152bfe9f96829aa94755d9f915f9b10ef5f",
      imageUrl: "/logos/cngn-logo.svg",
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
      name: "cNGN",
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
      name: "cNGN",
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
      name: "Celo Dollar",
      symbol: "cUSD",
      decimals: 18,
      address: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
      imageUrl: "/logos/cusd-logo.svg",
    },
  ],
  "Hedera Mainnet": [
    {
      name: "USD Coin",
      symbol: "USDC",
      decimals: 6,
      address: "0x000000000000000000000000000000000006f89a",
      imageUrl: "/logos/usdc-logo.svg",
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
        // Update cache with all networks
        // Temporarily add USDT on Base for user withdrawal
        if (tokens["Base"]) {
          const usdtBase = {
            name: "Tether USD",
            symbol: "USDT",
            decimals: 6,
            address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
            imageUrl: "/logos/usdt-logo.svg",
          };

          // Check if USDT is not already in the list
          const hasUSDT = tokens["Base"].some(
            (token) => token.symbol === "USDT",
          );
          if (!hasUSDT) {
            tokens["Base"].push(usdtBase);
          }
        }
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

/**
 * Fetches the wallet balances for the specified network and address.
 *
 * @param network - The network name.
 * @param address - The wallet address.
 * @returns An object containing the total balance and individual token balances.
 */
export async function fetchWalletBalance(
  client: any,
  address: string,
): Promise<{ total: number; balances: Record<string, number> }> {
  const supportedTokens = await getNetworkTokens(client.chain?.name);
  if (!supportedTokens) return { total: 0, balances: {} };

  let totalBalance = 0;
  const balances: Record<string, number> = {};

  try {
    // Fetch balances in parallel
    const balancePromises = supportedTokens.map(async (token: Token) => {
      try {
        const balanceInWei = await client.readContract({
          address: token.address as `0x${string}`,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address as `0x${string}`],
        });
        const balance = Number(balanceInWei) / Math.pow(10, token.decimals);
        // Ensure balance is a valid number
        balances[token.symbol] = isNaN(balance) ? 0 : balance;
        return balances[token.symbol];
      } catch (error) {
        console.error(`Error fetching balance for ${token.symbol}:`, error);
        balances[token.symbol] = 0;
        return 0;
      }
    });

    // Wait for all promises to resolve
    const tokenBalances = await Promise.all(balancePromises);
    totalBalance = tokenBalances.reduce(
      (acc: number, curr: number) => (acc || 0) + (curr || 0),
      0,
    );
  } catch (error) {
    return { total: 0, balances: {} };
  }

  // Ensure final total is a valid number
  return {
    total: isNaN(totalBalance) ? 0 : totalBalance,
    balances,
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

  // Check for both "cNGN" and "CNGN" keys (case sensitivity issue)
  const cngnBalance =
    rawBalance.balances["cNGN"] ?? rawBalance.balances["CNGN"];

  // If there's cNGN balance and we have a rate, convert it
  if (
    typeof cngnBalance === "number" &&
    !isNaN(cngnBalance) &&
    cngnBalance > 0 &&
    cngnRate &&
    cngnRate > 0
  ) {
    // Remove the raw cNGN value (which was counted as 1:1 USD)
    correctedTotal -= cngnBalance;
    // Add back the USD equivalent
    const usdEquivalent = cngnBalance / cngnRate;
    correctedTotal += usdEquivalent;
  }

  return isNaN(correctedTotal) ? 0 : correctedTotal;
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
 */
export const handleNetworkSwitch = async (
  network: Network,
  useInjectedWallet: boolean,
  setSelectedNetwork: (network: Network) => void,
  onSuccess: () => void,
  onError: (error: Error) => void,
) => {
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
