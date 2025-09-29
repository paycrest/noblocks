import { arbitrum, base, bsc, polygon, lisk, celo } from "viem/chains";
import { defineChain } from "viem";

// Custom BSC configuration with multiple RPC endpoints for better reliability
export const customBsc = defineChain({
  ...bsc,
  rpcUrls: {
    default: {
      http: [
        "https://bsc-dataseed.binance.org/",
        "https://bsc-dataseed1.defibit.io/",
        "https://bsc-dataseed1.ninicoin.io/",
        "https://bsc-dataseed2.defibit.io/",
        "https://bsc-dataseed3.defibit.io/",
        "https://bsc-dataseed4.defibit.io/",
        "https://bsc-dataseed1.binance.org/",
        "https://bsc-dataseed2.binance.org/",
        "https://bsc-dataseed3.binance.org/",
        "https://bsc-dataseed4.binance.org/",
      ],
    },
    public: {
      http: [
        "https://bsc-dataseed.binance.org/",
        "https://bsc-dataseed1.defibit.io/",
        "https://bsc-dataseed1.ninicoin.io/",
        "https://bsc-dataseed2.defibit.io/",
        "https://bsc-dataseed3.defibit.io/",
        "https://bsc-dataseed4.defibit.io/",
        "https://bsc-dataseed1.binance.org/",
        "https://bsc-dataseed2.binance.org/",
        "https://bsc-dataseed3.binance.org/",
        "https://bsc-dataseed4.binance.org/",
      ],
    },
  },
});

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
    chain: customBsc,
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
