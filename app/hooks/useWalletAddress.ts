import { usePrivy } from "@privy-io/react-auth";
import { useInjectedWallet } from "../context";
import { useStarknet } from "../context/StarknetContext";
import { useNetwork } from "../context/NetworksContext";

/**
 * Hook to get the appropriate wallet address based on the current network
 * @returns The wallet address for the currently selected network
 */
export function useWalletAddress(): string | undefined {
  const { user } = usePrivy();
  const { isInjectedWallet, injectedAddress } = useInjectedWallet();
  const { address: starknetAddress } = useStarknet();
  const { selectedNetwork } = useNetwork();

  // If using injected wallet, return injected address
  if (isInjectedWallet) {
    return injectedAddress ?? undefined;
  }

  // If on Starknet Sepolia, return Starknet wallet address
  if (selectedNetwork?.chain?.name === "Starknet Sepolia") {
    return starknetAddress ?? undefined;
  }

  // Otherwise, return EVM smart wallet address
  return user?.linkedAccounts.find((account) => account.type === "smart_wallet")
    ?.address;
}
