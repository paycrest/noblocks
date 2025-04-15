import { createWalletClient, custom } from 'viem';
import { trackEvent } from './analytics';
import { toast } from 'sonner';

export const useWalletDisconnect = () => {
  const disconnectWallet = async () => {
    try {
      if (window.ethereum) {
        const walletClient = createWalletClient({
          transport: custom(window.ethereum)
        });

        // Clear any active connections
        walletClient.request({
          method: "wallet_revokePermissions",
          params: [{ eth_accounts: {} }],
        });


        trackEvent("Wallet disconnected", {
          "Wallet type": "External wallet",
          "Disconnect reason": "User sign out",
        });

        return true;
      }
      return false;
    } catch (error) {
      console.error("Error disconnecting wallet:", error);
      toast.error("Failed to disconnect wallet", {
        description: "Please disconnect your wallet manually"
      });
      return false;
    }
  };

  return { disconnectWallet };
}; 