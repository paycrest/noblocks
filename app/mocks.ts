import {
  arbitrum,
  base,
  bsc,
  polygon,
  lisk,
  celo,
  scroll,
  mainnet,
} from "viem/chains";

// Define Starknet Mainnet chain (not in viem by default)
export const starknetMainnet = {
  id: 23448594291968334, // Starknet Mainnet chain ID (SN_MAIN encoded)
  name: "Starknet",
  network: "starknet-mainnet",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_STARKNET_RPC_URL || ""],
    },
    public: {
      http: [process.env.NEXT_PUBLIC_STARKNET_RPC_URL || ""],
    },
  },
  blockExplorers: {
    default: { name: "Voyager", url: "https://voyager.online" },
  },
  testnet: false,
};

export const acceptedCurrencies = [
  {
    name: "NGN",
    label: "Nigerian Naira (NGN)",
  },
  {
    name: "KES",
    label: "Kenyan Shilling (KES)",
  },
  {
    name: "UGX",
    label: "Ugandan Shilling (UGX)",
  },
  {
    name: "TZS",
    label: "Tanzanian Shilling (TZS)",
  },
  {
    name: "MWK",
    label: "Malawian Kwacha (MWK)",
  },
  {
    name: "GHS",
    label: "Ghanaian Cedi (GHS)",
    disabled: true,
  },

  {
    name: "BRL",
    label: "Brazilian Real (BRL)",
    disabled: true,
  },
  {
    name: "ARS",
    label: "Argentine Peso (ARS)",
    disabled: true,
  },
];

export const networks = [
  {
    chain: arbitrum,
    imageUrl: "/logos/arbitrum-one-logo.svg",
  },
  {
    chain: base,
    imageUrl: "/logos/base-logo.svg",
  },
  {
    chain: bsc,
    imageUrl: "/logos/bnb-smart-chain-logo.svg",
  },
  {
    chain: celo,
    imageUrl: "/logos/celo-logo.svg",
  },
  {
    chain: mainnet,
    imageUrl: "/logos/eth-logo.svg",
  },
  {
    chain: lisk,
    imageUrl: {
      light: "/logos/lisk-logo-light.svg",
      dark: "/logos/lisk-logo-dark.svg",
    },
  },
  {
    chain: polygon,
    imageUrl: "/logos/polygon-logo.svg",
  },
  {
    chain: scroll,
    imageUrl: "/logos/scroll-logo.svg",
  },
  {
    chain: starknetMainnet,
    imageUrl: "/logos/strk-logo.svg",
  },
  //   {
  //     chain: hedera,
  //     imageUrl: "/logos/hedera-logo.svg",
  //   },
  // {
  //   chain: optimism,
  //   imageUrl: "/logos/op-mainnet-logo.svg",
  // },
];

/** Chain IDs excluded from wallet migration (popup math + transfer modal). */
export const MIGRATION_EXCLUDED_CHAIN_IDS = new Set<number>([
  celo.id,
  scroll.id,
  starknetMainnet.id,
]);

/** Networks scanned and shown in the wallet migration modal (excludes Celo and Scroll). */
export const migrationChecklistNetworks = networks.filter(
  (n) => !MIGRATION_EXCLUDED_CHAIN_IDS.has(n.chain.id),
);

export const colors = [
  "bg-blue-600",
  "bg-indigo-600",
  "bg-purple-600",
  "bg-pink-600",
  "bg-red-600",
  "bg-orange-600",
  "bg-amber-600",
  "bg-yellow-600",
  "bg-lime-600",
  "bg-green-600",
  "bg-emerald-600",
  "bg-teal-600",
  "bg-cyan-600",
  "bg-sky-600",
];
