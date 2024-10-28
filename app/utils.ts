import JSEncrypt from "jsencrypt";
import type { InstitutionProps, Token } from "./types";

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
 * Formats a number with commas.
 *
 * @param num - The number to format.
 * @returns The formatted number as a string.
 */
export function formatNumberWithCommas(num: number): string {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
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
 * @returns A string representing the duration in seconds, minutes, or hours
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

  if (durationSec < 60) {
    return `${durationSec} second${durationSec !== 1 ? "s" : ""}`;
  }

  const durationMin = Math.floor(durationSec / 60);
  if (durationMin < 60) {
    return `${durationMin} minute${durationMin !== 1 ? "s" : ""}`;
  }

  const durationHours = Math.floor(durationMin / 60);
  return `${durationHours} hour${durationHours !== 1 ? "s" : ""}`;
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
      },
    ],
    "Arbitrum One": [
      {
        name: "USD Coin",
        symbol: "USDC",
        decimals: 6,
        address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      },
    ],
    "BNB Smart Chain": [
      {
        name: "USD Coin",
        symbol: "USDC",
        decimals: 6,
        address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      },
    ],
    "Polygon Mumbai": [
      {
        name: "USD Coin",
        symbol: "USDC",
        decimals: 6,
        address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      },
    ],
    Scroll: [
      {
        name: "USD Coin",
        symbol: "USDC",
        decimals: 6,
        address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      },
    ],
    Optimism: [
      {
        name: "USD Coin",
        symbol: "USDC",
        decimals: 6,
        address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      },
    ],
  };

  return tokens[network];
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
    "Arbitrum One": "0x30f6a8457f8e42371e204a9c103f2bd42341dd0f",
    "BNB Smart Chain": "0x30f6a8457f8e42371e204a9c103f2bd42341dd0f",
    "Polygon Mumbai": "0x30f6a8457f8e42371e204a9c103f2bd42341dd0f",
    Scroll: "0x30f6a8457f8e42371e204a9c103f2bd42341dd0f",
    Optimism: "0x30f6a8457f8e42371e204a9c103f2bd42341dd0f",
  }[network];
}

/**
 * An array of mobile money options available in Kenya.
 * Each option includes the name of the institution, a code, and the type.
 *
 * @constant {InstitutionProps[]} kenyaMobileMoneyOptions
 * @property {string} name - The name of the mobile money institution.
 * @property {string} code - The code representing the mobile money institution.
 * @property {string} type - The type of institution, which is "mobile-money" for all entries.
 */
export const kenyaMobileMoneyOptions: InstitutionProps[] = [
  {
    name: "SAFARICOM (MPESA)",
    code: "MPESA",
    type: "mobile-money",
  },
  {
    name: "AIRTEL",
    code: "AIRTEL",
    type: "mobile-money",
  },
];

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
