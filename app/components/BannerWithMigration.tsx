"use client";
import React, { useState, useEffect, useCallback } from "react";
import NoticeBanner from "./NoticeBanner";
import MigrationModal from "./migration/MigrationModal";
import { useInjectedWallet } from "@/app/context";
import { useActiveAccount } from "thirdweb/react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import config from "@/app/lib/config";
import { fetchKYCStatus } from "@/app/api/aggregator";
import { useMultiNetworkBalance } from "@/app/context/MultiNetworkBalanceContext";

const BannerWithMigration: React.FC = () => {
  const [migrationModalOpen, setMigrationModalOpen] = useState(false);
  const [isCheckingMigration, setIsCheckingMigration] = useState(true);
  const [isThirdwebKYCVerified, setIsThirdwebKYCVerified] = useState(false);
  const [isPrivyKYCVerified, setIsPrivyKYCVerified] = useState(false);
  const [hasBalances, setHasBalances] = useState(false);
  const [isLegacyUser, setIsLegacyUser] = useState(false);

  const { isInjectedWallet } = useInjectedWallet();
  const account = useActiveAccount();
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const { fetchAllNetworkBalances } = useMultiNetworkBalance();

  const checkKYCStatus = async (walletAddress: string): Promise<boolean> => {
    try {
      const response = await fetchKYCStatus(walletAddress);
      return response.data.status === "success";
    } catch (error) {
      return false;
    }
  };

  const checkPrivyUser = useCallback(async () => {
    setIsCheckingMigration(true);

    if (isInjectedWallet || !account?.address) {
      setIsLegacyUser(false);
      setIsCheckingMigration(false);
      return;
    }

    const getPrivyWalletAddresses = () => {
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
    };

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
        setIsLegacyUser(false);
        setIsCheckingMigration(false);
        return;
      }

      const lookupResult = await response.json();

      if (!lookupResult.email) {
        setIsLegacyUser(false);
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

        setIsThirdwebKYCVerified(thirdwebKYCVerified);
        setIsPrivyKYCVerified(privyKYCVerified);

        // Check if there are actual balances using multi-network balance check
        if (privySmartAddress) {
          try {
            const networkBalances =
              await fetchAllNetworkBalances(privySmartAddress);
            const hasAnyBalance =
              networkBalances?.some((balance) => balance.total > 0) || false;
            setHasBalances(hasAnyBalance);
          } catch (error) {
            console.error("Failed to fetch balances:", error);
            setHasBalances(false);
          }
        } else {
          setHasBalances(false);
        }

        // Set legacy user status
        setIsLegacyUser(privyResult.exists);
      } else {
        console.error("Failed to check Privy user");
        setIsLegacyUser(false);
      }

      setIsCheckingMigration(false);
    } catch (error) {
      console.error("Error checking migration eligibility:", error);
      setIsLegacyUser(false);
      setIsCheckingMigration(false);
    }
  }, [isInjectedWallet, account?.address, user?.linkedAccounts]);

  useEffect(() => {
    checkPrivyUser();
  }, [checkPrivyUser]);

  const handleCtaClick = () => {
    if (config.migrationMode && isLegacyUser) {
      // If migration mode and legacy user, open migration modal
      setMigrationModalOpen(true);
    } else if (isLegacyUser) {
      // Legacy user but not in migration mode - go to old site
      window.open("https://old.noblocks.xyz", "_blank");
    } else if (config.noticeBannerCtaUrl) {
      // If there's a URL, open it
      window.open(config.noticeBannerCtaUrl, "_blank");
    }
    // If neither migration mode nor URL, CTA does nothing
  };

  let finalBannerText = "";
  let finalCtaText = "";

  if (isCheckingMigration) {
    return null;
  }

  // Use environment variables when migration mode is OFF
  if (!config.migrationMode) {
    if (config.noticeBannerText) {
      finalBannerText = config.noticeBannerText;
      finalCtaText = config.noticeBannerCtaText || "";
    } else {
      // Fallback messages when no env vars are set
      if (isLegacyUser) {
        finalBannerText =
          "We've upgraded to Thirdweb!|Access your previous account and funds at [old.noblocks.xyz](https://old.noblocks.xyz)";
        finalCtaText = "Go to Old Site";
      } else {
        finalBannerText =
          "Welcome to Noblocks!|Experience faster, more secure crypto-to-fiat conversions powered by Thirdweb.";
        finalCtaText = "Get Started";
      }
    }
  } else {
    // Migration mode ON - use hardcoded logic
    if (isLegacyUser) {
      if (isPrivyKYCVerified && !isThirdwebKYCVerified) {
        finalBannerText =
          "Migration Required|We're upgrading to a faster, more secure wallet. Complete your migration to continue using Noblocks.";
        finalCtaText = "Start Migration";
      } else if (isPrivyKYCVerified && isThirdwebKYCVerified) {
        if (hasBalances) {
          finalBannerText =
            "Fund Transfer Reminder|You have funds in your old wallet that need to be transferred. Access your previous account at [old.noblocks.xyz](https://old.noblocks.xyz)";
          finalCtaText = "Transfer Funds";
        } else {
          finalBannerText =
            "Migration Complete|Your account has been successfully upgraded to Thirdweb. Access your previous account at [old.noblocks.xyz](https://old.noblocks.xyz)";
          finalCtaText = "Go to Old Site";
        }
      } else if (!isPrivyKYCVerified && isThirdwebKYCVerified) {
        if (hasBalances) {
          finalBannerText =
            "Fund Transfer Reminder|You have funds in your old wallet that need to be transferred. Access your previous account at [old.noblocks.xyz](https://old.noblocks.xyz)";
          finalCtaText = "Transfer Funds";
        } else {
          finalBannerText =
            "Migration Complete|Your account has been successfully upgraded to Thirdweb. Access your previous account at [old.noblocks.xyz](https://old.noblocks.xyz)";
          finalCtaText = "Go to Old Site";
        }
      } else {
        finalBannerText =
          "We've upgraded to Thirdweb!|Access your previous account and funds at [old.noblocks.xyz](https://old.noblocks.xyz)";
        finalCtaText = "Go to Old Site";
      }
    } else {
      finalBannerText =
        "Welcome to Noblocks!|Experience faster, more secure crypto-to-fiat conversions powered by Thirdweb.";
      finalCtaText = "Get Started";
    }
  }

  if (!finalBannerText) return null;

  return (
    <>
      <NoticeBanner
        textLines={finalBannerText.split("|")}
        ctaText={finalCtaText}
        onCtaClick={finalCtaText ? handleCtaClick : undefined}
        bannerId={isLegacyUser ? "legacy-user" : "new-user"}
      />
      {config.migrationMode && (
        <MigrationModal
          isOpen={migrationModalOpen}
          onClose={() => setMigrationModalOpen(false)}
        />
      )}
    </>
  );
};

export default BannerWithMigration;
