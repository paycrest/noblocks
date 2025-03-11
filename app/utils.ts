import JSEncrypt from "jsencrypt";
import type { InstitutionProps, Token } from "./types";
import { erc20Abi } from "viem";
import { colors } from "./mocks";
import { fetchRate } from "./api/aggregator";

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
    default:
      return "";
  }
};

/**
 * Fetches the supported tokens for the specified network.
 *
 * @param network - The network name.
 * @returns An array of supported tokens for the specified network.
 */
export function fetchSupportedTokens(network = ""): Token[] | undefined {
  let tokens: { [key: string]: Token[] };

  tokens = {
    Base: [
      {
        name: "USD Coin",
        symbol: "USDC",
        decimals: 6,
        address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
        imageUrl: "/logos/usdc-logo.svg",
      },
      {
        name: "cNGN",
        symbol: "cNGN",
        decimals: 6,
        address: "0x46C85152bFe9f96829aA94755D9f915F9B10EF5F",
        imageUrl: "/logos/cngn-logo.png",
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
        address: "0xa8AEA66B361a8d53e8865c62D142167Af28Af058",
        imageUrl: "/logos/cngn-logo.png",
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
        address: "0x52828daa48C1a9A06F37500882b42daf0bE04C3B",
        imageUrl: "/logos/cngn-logo.png",
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
    ],
    Optimism: [
      {
        name: "USD Coin",
        symbol: "USDC",
        decimals: 6,
        address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
        imageUrl: "/logos/usdc-logo.svg",
      },
    ],
    Celo: [
      {
        name: "Tether USD",
        symbol: "USDT",
        decimals: 6,
        address: "0x617f3112bf5397d0467d315cc709ef968d9ba546",
        imageUrl: "/logos/usdt-logo.svg",
      },
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
        decimals: 6,
        address: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
        imageUrl: "/logos/celo-logo.svg",
      },
    ],
  };

  return tokens[network];
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
  const supportedTokens = fetchSupportedTokens(client.chain?.name);
  if (!supportedTokens) return { total: 0, balances: {} };

  let totalBalance = 0;
  const balances: Record<string, number> = {};

  try {
    // Fetch balances in parallel
    const balancePromises = supportedTokens.map(async (token) => {
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
      (acc, curr) => (acc || 0) + (curr || 0),
      0,
    );

    // Add USD equivalent for cNGN
    if (typeof balances["cNGN"] === "number" && !isNaN(balances["cNGN"])) {
      totalBalance -= balances["cNGN"];
      try {
        const rate = await fetchRate({
          token: "USDT",
          amount: 1,
          currency: "NGN",
        });
        if (
          rate?.data &&
          typeof rate.data === "string" &&
          Number(rate.data) > 0
        ) {
          totalBalance += balances["cNGN"] / Number(rate.data);
        }
      } catch (error) {
        console.error("Error fetching cNGN rate:", error);
      }
    }
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
