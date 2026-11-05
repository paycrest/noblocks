/**
 * Copy and marketing numbers for the v2 wallet Home explore section.
 * Values are config-driven — not hard-coded from Figma placeholders.
 */

function readPositiveInt(envKey: string, fallback: number): number {
  const raw = process.env[envKey];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readPercentDisplay(envKey: string, fallback: string): string {
  const raw = process.env[envKey]?.trim();
  return raw || fallback;
}

export const WALLET_HOME_SUPPORTED_ASSET_COUNT = readPositiveInt(
  "NEXT_PUBLIC_WALLET_HOME_SUPPORTED_ASSET_COUNT",
  80,
);

export const WALLET_HOME_SUPPORTED_NETWORK_COUNT = readPositiveInt(
  "NEXT_PUBLIC_WALLET_HOME_SUPPORTED_NETWORK_COUNT",
  35,
);

/** Display string for max earn APY on Home (e.g. "4.4%"). */
export const WALLET_HOME_MAX_EARN_APY_DISPLAY = readPercentDisplay(
  "NEXT_PUBLIC_WALLET_HOME_MAX_EARN_APY_DISPLAY",
  "4.4%",
);

export const WALLET_HOME_EXPLORE = {
  stocks: {
    title: "Own popular stocks from $1",
    description:
      "Buy a piece of Nvidia, Apple and more with your balance.",
  },
  earn: {
    title: (apyDisplay: string) => `Earn up to ${apyDisplay} a year`,
    description:
      "Your balance grows while you hold it. Withdraw any time.",
  },
  invite: {
    title: "Invite friends",
    description: "Share your link and track who has joined.",
  },
} as const;

export const WALLET_HOME_ADD_FUNDS_CARD = {
  title: "Add funds to get started",
  supportLine: (assetCount: number, networkCount: number) =>
    `We support ${assetCount}+ assets across ${networkCount}+ networks.`,
} as const;
