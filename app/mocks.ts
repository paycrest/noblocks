import { arbitrum, base, bsc, optimism, polygon, scroll } from "viem/chains";

export const currencies = [
  {
    name: "KES",
    label: "Kenyan Shilling (KES)",
    imageUrl: "https://flagcdn.com/h24/ke.png",
  },
  {
    name: "NGN",
    label: "Nigerian Naira (NGN)",
    imageUrl: "https://flagcdn.com/h24/ng.png",
  },
  {
    name: "GHS",
    label: "Ghanaian Cedi (GHS)",
    imageUrl: "https://flagcdn.com/h24/gh.png",
    disabled: true,
  },
  {
    name: "BRL",
    label: "Brazilian Real (BRL)",
    imageUrl: "https://flagcdn.com/h24/br.png",
    disabled: true,
  },
  {
    name: "ARS",
    label: "Argentine Peso (ARS)",
    imageUrl: "https://flagcdn.com/h24/ar.png",
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
    chain: polygon,
    imageUrl: "/logos/polygon-logo.svg",
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


export const currencyToCountryCode: Record<string, string> = {
  KES: "ke",
  NGN: "ng",
  GHS: "gh",
  BRL: "br",
  ARS: "ar",
  USD: "us",
  EUR: "eu",
  GBP: "gb",
  ZAR: "za",
  UGX: "ug",
  TZS: "tz",
  RWF: "rw",
  INR: "in",
  CAD: "ca",
  AUD: "au",
  JPY: "jp",
  CNY: "cn",
};