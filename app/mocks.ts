import { arbitrum, base, bsc, polygon, lisk, celo, hedera } from "viem/chains";

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
    chain: hedera,
    imageUrl: "/logos/hedera-logo.svg",
  },
  // {
  //   chain: scroll,
  //   imageUrl: "/logos/scroll-logo.svg",
  // },
  // {
  //   chain: optimism,
  //   imageUrl: "/logos/op-mainnet-logo.svg",
  // },
];

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
