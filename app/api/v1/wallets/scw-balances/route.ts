import { NextRequest, NextResponse } from "next/server";
import { getPrivyClient } from "@/app/lib/privy";
import { createPublicClient, http, erc20Abi, formatUnits } from "viem";
import {
  base,
  arbitrum,
  polygon,
  bsc,
  mainnet,
  celo,
  lisk,
  type Chain,
} from "viem/chains";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type TokenDef = {
  symbol: string;
  address: string;
  decimals: number;
};

type NetworkConfig = {
  chain: Chain;
  tokens: TokenDef[];
};

const NETWORK_TOKENS: Record<string, NetworkConfig> = {
  Base: {
    chain: base,
    tokens: [
      {
        symbol: "USDC",
        address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
        decimals: 6,
      },
      {
        symbol: "USDT",
        address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
        decimals: 6,
      },
      {
        symbol: "cNGN",
        address: "0x46c85152bfe9f96829aa94755d9f915f9b10ef5f",
        decimals: 6,
      },
    ],
  },
  "Arbitrum One": {
    chain: arbitrum,
    tokens: [
      {
        symbol: "USDC",
        address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
        decimals: 6,
      },
      {
        symbol: "USDT",
        address: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
        decimals: 6,
      },
    ],
  },
  Polygon: {
    chain: polygon,
    tokens: [
      {
        symbol: "USDC",
        address: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
        decimals: 6,
      },
      {
        symbol: "USDT",
        address: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
        decimals: 6,
      },
      {
        symbol: "cNGN",
        address: "0x52828daa48c1a9a06f37500882b42daf0be04c3b",
        decimals: 6,
      },
    ],
  },
  "BNB Smart Chain": {
    chain: bsc,
    tokens: [
      {
        symbol: "USDT",
        address: "0x55d398326f99059ff775485246999027b3197955",
        decimals: 18,
      },
      {
        symbol: "USDC",
        address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
        decimals: 18,
      },
      {
        symbol: "cNGN",
        address: "0xa8aea66b361a8d53e8865c62d142167af28af058",
        decimals: 6,
      },
    ],
  },
  Celo: {
    chain: celo,
    tokens: [
      {
        symbol: "USDC",
        address: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
        decimals: 6,
      },
      {
        symbol: "cUSD",
        address: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
        decimals: 18,
      },
    ],
  },
  Lisk: {
    chain: lisk,
    tokens: [
      {
        symbol: "USDT",
        address: "0x05D032ac25d322df992303dCa074EE7392C117b9",
        decimals: 6,
      },
    ],
  },
  Ethereum: {
    chain: mainnet,
    tokens: [
      {
        symbol: "USDC",
        address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        decimals: 6,
      },
      {
        symbol: "USDT",
        address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        decimals: 6,
      },
      {
        symbol: "cNGN",
        address: "0x17CDB2a01e7a34CbB3DD4b83260B05d0274C8dab",
        decimals: 6,
      },
    ],
  },
};

const THIRDWEB_CLIENT_ID = process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID;

function getRpcUrl(chainId: number): string {
  if (chainId === bsc.id) {
    return "https://bsc-dataseed.bnbchain.org/";
  }
  return `https://${chainId}.rpc.thirdweb.com/${THIRDWEB_CLIENT_ID}`;
}

const clients: Record<string, ReturnType<typeof createPublicClient>> = {};
for (const [networkName, config] of Object.entries(NETWORK_TOKENS)) {
  clients[networkName] = createPublicClient({
    chain: config.chain,
    transport: http(getRpcUrl(config.chain.id)),
  });
}

async function getTokenBalance(
  client: ReturnType<typeof createPublicClient>,
  tokenAddress: string,
  walletAddress: string,
  decimals: number,
): Promise<number> {
  try {
    const balanceInWei = await client.readContract({
      address: tokenAddress as `0x${string}`,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [walletAddress as `0x${string}`],
    });
    return Number(formatUnits(balanceInWei as bigint, decimals));
  } catch {
    return 0;
  }
}

async function fetchBalancesForAddress(
  scwAddress: string,
): Promise<{ network: string; token: string; amount: number }[]> {
  const results: { network: string; token: string; amount: number }[] = [];

  const networkPromises = Object.entries(NETWORK_TOKENS).map(
    async ([networkName, config]) => {
      const client = clients[networkName];
      const tokenPromises = config.tokens.map(async (token) => {
        const balance = await getTokenBalance(
          client,
          token.address,
          scwAddress,
          token.decimals,
        );
        if (balance > 0) {
          results.push({
            network: networkName,
            token: token.symbol,
            amount: balance,
          });
        }
      });
      await Promise.all(tokenPromises);
    },
  );

  await Promise.all(networkPromises);
  return results;
}

export type BalanceRow = {
  email: string | null;
  scw_address: string;
  network: string;
  token: string;
  amount: number;
};

export type SCWBalancesResponse = {
  success: boolean;
  data: {
    rows: BalanceRow[];
    totalUsers: number;
    usersWithSCW: number;
    usersWithBalance: number;
    grandTotal: number;
    fetchedAt: string;
  };
  error?: string;
};

export async function GET(request: NextRequest) {
  try {
    const privy = getPrivyClient();
    const users = await privy.getUsers();

    const rows: BalanceRow[] = [];
    let usersWithSCW = 0;
    const usersWithBalanceSet = new Set<string>();

    const CONCURRENCY = 5;
    const scwUsers: {
      email: string | null;
      scwAddress: string;
    }[] = [];

    for (const user of users) {
      const scwAddress = user.smartWallet?.address;
      if (!scwAddress) continue;

      usersWithSCW++;
      scwUsers.push({
        email: user.email?.address ?? null,
        scwAddress: scwAddress.toLowerCase(),
      });
    }

    for (let i = 0; i < scwUsers.length; i += CONCURRENCY) {
      const batch = scwUsers.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map(async ({ email, scwAddress }) => {
          const balances = await fetchBalancesForAddress(scwAddress);
          return balances.map((b) => ({
            email,
            scw_address: scwAddress,
            network: b.network,
            token: b.token,
            amount: b.amount,
          }));
        }),
      );
      for (const userRows of batchResults) {
        for (const row of userRows) {
          rows.push(row);
          usersWithBalanceSet.add(row.scw_address);
        }
      }
    }

    const grandTotal = rows.reduce((sum, r) => sum + r.amount, 0);

    const format = request.nextUrl.searchParams.get("format");

    if (format === "csv") {
      const header = "email,scw_address,network,token,amount";
      const csvRows = rows.map(
        (r) =>
          `"${r.email ?? ""}","${r.scw_address}","${r.network}","${r.token}",${r.amount}`,
      );
      const summary = [
        "",
        `"Total Users",${users.length}`,
        `"Users With SCW",${usersWithSCW}`,
        `"Users With Balance",${usersWithBalanceSet.size}`,
        `"Grand Total",${grandTotal}`,
        `"Fetched At","${new Date().toISOString()}"`,
      ];
      const csv = [header, ...csvRows, ...summary].join("\n");

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="scw-balances-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    const response: SCWBalancesResponse = {
      success: true,
      data: {
        rows,
        totalUsers: users.length,
        usersWithSCW,
        usersWithBalance: usersWithBalanceSet.size,
        grandTotal,
        fetchedAt: new Date().toISOString(),
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching SCW balances:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to fetch balances",
      },
      { status: 500 },
    );
  }
}
