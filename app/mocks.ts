import { arbitrum, base, bsc, polygon, lisk } from "viem/chains";

export const acceptedCurrencies = [
  {
    name: "KES",
    label: "Kenyan Shilling (KES)",
  },
  {
    name: "NGN",
    label: "Nigerian Naira (NGN)",
  },
  {
    name: "GHS",
    label: "Ghanaian Cedi (GHS)",
    disabled: true,
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
  // {
  //   chain: celo,
  //   imageUrl: "/logos/celo-logo.svg",
  // },
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


export const transactions = [
  {
    id: "1",
    date: "Today",
    items: [
      {
          id: "t1",
          type: "Swapped",
          amount: "28.10",
          currency: "USDC",
          swappedCurrency: "CNGN",
          nativeValue: "NGN 369,723.88",
          time: "4:14 AM",
          status: "Completed",
          fees: "NGN 2,392",
          recipient: "Francesca Tobiloba",
          bank: "First Bank of Nigeria",
          account: "0267856481",
          memo: "From me, Donda North",
          fundStatus: "Deposited",
          timeSpent: "12 seconds",
          day: "13 May 2024"
      },
      {
        id: "t2",
        type: "Swapped",
        amount: "15.50",
        currency: "USDT",
        swappedCurrency: "CUSD",
        nativeValue: "NGN 5,672.15",
        time: "8:45 PM",
        status: "Completed",
        fees: "NGN 2,392",
          recipient: "Francesca Tobiloba",
          bank: "First Bank of Nigeria",
          account: "0267856481",
          memo: "From me, Donda North",
          fundStatus: "Deposited",
          timeSpent: "12 seconds",
          day: "13 May 2024"
      },
      {
        id: "t3",
        type: "Swapped",
        amount: "100.00",
        currency: "USDT",
        swappedCurrency: "CNGN",
        nativeValue: "KES 45,678.90",
        time: "2:20 PM",
        status: "Failed",
        fees: "NGN 2,392",
          recipient: "Francesca Tobiloba",
          bank: "First Bank of Nigeria",
          account: "0267856481",
          memo: "From me, Donda North",
          fundStatus: "Deposited",
          timeSpent: "12 seconds",
          day: "13 May 2024"
      },
    ],
  },
  {
    id: "2",
    date: "Yesterday",
    items: [
      {
        id: "t4",
        type: "Swapped",
        amount: "28.10",
        currency: "USDC",
        swappedCurrency: "CUSD",
        nativeValue: "NGN 369,723.88",
        time: "4:14 AM",
        status: "Completed",
        fees: "NGN 2,392",
          recipient: "Francesca Tobiloba",
          bank: "First Bank of Nigeria",
          account: "0267856481",
          memo: "From me, Donda North",
          fundStatus: "Deposited",
          timeSpent: "12 seconds",
          day: "13 May 2024"

      },
      {
        id: "t5",
        type: "Swapped",
        amount: "15.50",
        currency: "USDT",
        swappedCurrency: "CNGN",
        nativeValue: "ARS 82,506.45",
        time: "6:30 PM",
        status: "Completed",
        fees: "NGN 2,392",
          recipient: "Francesca Tobiloba",
          bank: "First Bank of Nigeria",
          account: "0267856481",
          memo: "From me, Donda North",
          fundStatus: "Deposited",
          timeSpent: "12 seconds",
          day: "13 May 2024"

      },
      {
        id: "t6",
        type: "Swapped",
        amount: "200.00",
        currency: "USDT",
        swappedCurrency: "CUSD",
        nativeValue: "KES 7,890.65",
        time: "8:00 AM",
        status: "Completed",
        fees: "NGN 2,392",
          recipient: "Francesca Tobiloba",
          bank: "First Bank of Nigeria",
          account: "0267856481",
          memo: "From me, Donda North",
          fundStatus: "Deposited",
          timeSpent: "12 seconds",
          day: "13 May 2024"

      },
      {
        id: "t7",
        type: "Swapped",
        amount: "75.30",
        currency: "CNGN",
        swappedCurrency: "USDC",
        nativeValue: "NGN 53,674.20",
        time: "5:55 PM",
        status: "Failed",
        fees: "NGN 2,392",
          recipient: "Francesca Tobiloba",
          bank: "First Bank of Nigeria",
          account: "0267856481",
          memo: "From me, Donda North",
          fundStatus: "Deposited",
          timeSpent: "12 seconds",
          day: "13 May 2024"

      },
    ],
  },
  {
    id: "3",
    date: "2 days ago",
    items: [
      {
        id: "t8",
        type: "Swapped",
        amount: "28.10",
        currency: "USDC",
        nativeValue: "NGN 369,723.88",
        time: "4:14 AM",
        status: "Completed",
        fees: "NGN 2,392",
          recipient: "Francesca Tobiloba",
          bank: "First Bank of Nigeria",
          account: "0267856481",
          memo: "From me, Donda North",
          fundStatus: "Deposited",
          timeSpent: "12 seconds",
          day: "13 May 2024"

      },
    ],
  },
];