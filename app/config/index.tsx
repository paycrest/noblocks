import {
  mainnet,
  arbitrum,
   sepolia, solana, solanaTestnet, bitcoin,  polygon,
   bsc,
} from "@reown/appkit/networks";
import type { AppKitNetwork } from '@reown/appkit/networks'
// import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets'
import { cookieStorage, createStorage, Storage } from "wagmi";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
// import { SolanaAdapter } from "@reown/appkit-adapter-solana";
// import { PublicKey } from '@solana/web3.js'
import { BitcoinAdapter } from '@reown/appkit-adapter-bitcoin'


export const projectId = process.env.NEXT_PUBLIC_PROJECT_ID || 'b56e18d47c72ab683b10814fe9495694' // this is a public projectId only to use on localhost

if (!projectId) {
  throw new Error("Project ID is not defined");
}

export const networks: [AppKitNetwork, ...AppKitNetwork[]] = [mainnet, arbitrum, sepolia, solana, solanaTestnet, bitcoin, polygon, bsc] ;


//Set up the Wagmi Adapter (Config)
export const wagmiAdapter = new WagmiAdapter({
  storage: createStorage({
    storage: cookieStorage,
  }) as Storage,

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
