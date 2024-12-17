import { arbitrum, base, bsc, optimism, polygon, scroll } from "viem/chains";

export const currencies = [
  {
    name: "KES",
    label: "Kenyan Shilling",
    imageUrl: "/logos/kes-logo.svg",
  },
  {
    name: "NGN",
    label: "Nigerian Naira",
    imageUrl: "/logos/ngn-logo.svg",
  },
  {
    name: "GHS",
    label: "Ghanaian Cedi",
    imageUrl: "/logos/ghs-logo.svg",
    disabled: true,
  },
  {
    name: "ARS",
    label: "Argentine Peso",
    imageUrl: "/logos/ars-logo.png",
    disabled: true,
  },
  {
    name: "BRL",
    label: "Brazilian Real",
    imageUrl: "/logos/brl-logo.png",
    disabled: true,
  },
];

export const networks = [
  {
    chain: base,
    imageUrl: "/logos/base-logo.svg",
  },
  {
    chain: bsc,
    imageUrl: "/logos/bnb-smart-chain-logo.svg",
  },
  {
    chain: arbitrum,
    imageUrl: "/logos/arbitrum-one-logo.svg",
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
    chain: optimism,
    imageUrl: "/logos/op-mainnet-logo.svg",
  },
];

export const tokens = [
  {
    name: "USDT",
    label: "Tether",
    imageUrl: "/logos/usdt-logo.svg",
  },
  {
    name: "USDC",
    label: "USD Coin",
    imageUrl: "/logos/usdc-logo.svg",
  },
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
