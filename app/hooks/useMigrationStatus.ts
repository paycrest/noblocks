import { useState, useCallback } from "react";
import { useActiveAccount } from "thirdweb/react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useInjectedWallet } from "@/app/context";
import { useMultiNetworkBalance } from "@/app/context/MultiNetworkBalanceContext";
import { fetchKYCStatus } from "@/app/api/aggregator";
import { UserStatus } from "@/app/utils";

/**
 * Custom hook for managing migration status and user eligibility checks.
 *
 * This hook handles the complex logic of determining whether a user is eligible
 * for migration, checking KYC status for both Privy and Thirdweb wallets,
 * and fetching balance information across multiple networks.
 *
 * @returns Object containing user status, loading state, and check function
 * @returns {UserStatus} userStatus - Current user migration status
 * @returns {boolean} isCheckingMigration - Whether migration check is in progress
 * @returns {Function} checkPrivyUser - Function to trigger migration status check
 */
export const useMigrationStatus = () => {
  const [isCheckingMigration, setIsCheckingMigration] = useState(true);
  const [userStatus, setUserStatus] = useState<UserStatus>({
    isLegacyUser: false,
    isThirdwebKYCVerified: false,
    isPrivyKYCVerified: false,
    hasBalances: false,
  });

  const { isInjectedWallet } = useInjectedWallet();
  const account = useActiveAccount();
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const { fetchAllNetworkBalances } = useMultiNetworkBalance();

  // Helper function to check KYC status
  const checkKYCStatus = async (walletAddress: string): Promise<boolean> => {
    try {
      const response = await fetchKYCStatus(walletAddress);
      return response.data.status === "success";
    } catch (error) {
      return false;
    }
  };

  // Helper function to get Privy wallet addresses
  const getPrivyWalletAddresses = useCallback(() => {
    if (!wallets) return { embedded: null, smart: null };

    const embeddedWallet = wallets.find(
      (wallet) => wallet.walletClientType === "privy",
    );
    const smartWallet = user?.linkedAccounts?.find(
      (account) => account.type === "smart_wallet",
    );

    return {
      embedded: embeddedWallet?.address || null,
      smart: smartWallet?.address || null,
    };
  }, [wallets, user?.linkedAccounts]);

  // Helper function to check balances
  const checkUserBalances = useCallback(
    async (smartWalletAddress: string): Promise<boolean> => {
      try {
        const networkBalances =
          await fetchAllNetworkBalances(smartWalletAddress);
        return networkBalances?.some((balance) => balance.total > 0) || false;
      } catch (error) {
        console.error("Failed to fetch balances:", error);
        return false;
      }
    },
    [fetchAllNetworkBalances],
  );

  // Main function to check Privy user and determine status
  const checkPrivyUser = useCallback(async () => {
    setIsCheckingMigration(true);

    if (isInjectedWallet || !account?.address) {
      setUserStatus({
        isLegacyUser: false,
        isThirdwebKYCVerified: false,
        isPrivyKYCVerified: false,
        hasBalances: false,
      });
      setIsCheckingMigration(false);
      return;
    }

    try {
      const response = await fetch(
        `/api/privy/enhanced-lookup?walletAddress=${account.address}`,
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        console.error("Enhanced lookup failed");
        setUserStatus({
          isLegacyUser: false,
          isThirdwebKYCVerified: false,
          isPrivyKYCVerified: false,
          hasBalances: false,
        });
        setIsCheckingMigration(false);
        return;
      }

      const lookupResult = await response.json();

      if (!lookupResult.email) {
        setUserStatus({
          isLegacyUser: false,
          isThirdwebKYCVerified: false,
          isPrivyKYCVerified: false,
          hasBalances: false,
        });
        setIsCheckingMigration(false);
        return;
      }

      const privyResponse = await fetch("/api/privy/check-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: lookupResult.email }),
      });

      if (privyResponse.ok) {
        const privyResult = await privyResponse.json();

        const { embedded: privyEmbeddedAddress, smart: privySmartAddress } =
          getPrivyWalletAddresses();

        const thirdwebKYCVerified = await checkKYCStatus(account.address);
        const privyKYCVerified = privyEmbeddedAddress
          ? await checkKYCStatus(privyEmbeddedAddress)
          : false;

        const hasBalances = privySmartAddress
          ? await checkUserBalances(privySmartAddress)
          : false;

        setUserStatus({
          isLegacyUser: privyResult.exists,
          isThirdwebKYCVerified: thirdwebKYCVerified,
          isPrivyKYCVerified: privyKYCVerified,
          hasBalances,
        });
      } else {
        console.error("Failed to check Privy user");
        setUserStatus({
          isLegacyUser: false,
          isThirdwebKYCVerified: false,
          isPrivyKYCVerified: false,
          hasBalances: false,
        });
      }

      setIsCheckingMigration(false);
    } catch (error) {
      console.error("Error checking migration eligibility:", error);
      setUserStatus({
        isLegacyUser: false,
        isThirdwebKYCVerified: false,
        isPrivyKYCVerified: false,
        hasBalances: false,
      });
      setIsCheckingMigration(false);
    }
  }, [
    isInjectedWallet,
    account?.address,
    getPrivyWalletAddresses,
    checkUserBalances,
  ]);

  return {
    userStatus,
    isCheckingMigration,
    checkPrivyUser,
  };
};
