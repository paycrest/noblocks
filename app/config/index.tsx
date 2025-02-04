// config/index.tsx
import {
  mainnet,
  arbitrum,
   sepolia, solana, solanaTestnet, solanaDevnet, bitcoin
} from "@reown/appkit/networks";
import type { AppKitNetwork } from '@reown/appkit/networks'
// import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets'
import { cookieStorage, createStorage, http } from "wagmi";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
// import { SolanaAdapter } from "@reown/appkit-adapter-solana";
import { PublicKey } from '@solana/web3.js'
import { BitcoinAdapter } from '@reown/appkit-adapter-bitcoin'


// Get projectId from https://cloud.reown.com
export const projectId = process.env.NEXT_PUBLIC_PROJECT_ID || "c70ce5dae11d998ebacea800aca7a444";

if (!projectId) {
  throw new Error("Project ID is not defined");
}

export const networks: [AppKitNetwork, ...AppKitNetwork[]] = [mainnet, arbitrum, sepolia, solana, solanaTestnet, bitcoin, solanaDevnet];


//Set up the Wagmi Adapter (Config)
export const wagmiAdapter = new WagmiAdapter({
  storage: createStorage({
    storage: cookieStorage,
  }),
  ssr: true,
  projectId,
  networks,
});


// 2. Set up Bitcoin Adapter
export const bitcoinAdapter = new BitcoinAdapter({
  projectId
})

// // Create Solana adapter
// export const solanaWeb3JsAdapter = new SolanaAdapter({
//   wallets: [new PhantomWalletAdapter(), new SolflareWalletAdapter()]
// })


export const config = wagmiAdapter.wagmiConfig;
