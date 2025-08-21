"use client";
import React, { useState, useEffect, useCallback } from "react";
import NoticeBanner from "./NoticeBanner";
import MigrationModal from "./migration/MigrationModal";
import { useInjectedWallet } from "@/app/context";
import { useActiveAccount } from "thirdweb/react";
import { usePrivy } from "@privy-io/react-auth";
import config from "@/app/lib/config";
import { fetchKYCStatus } from "@/app/api/aggregator";

const BannerWithMigration: React.FC = () => {
  const [migrationModalOpen, setMigrationModalOpen] = useState(false);
  const [shouldShowMigrationLogic, setShouldShowMigrationLogic] =
    useState(false);
  const [isCheckingMigration, setIsCheckingMigration] = useState(true);
  const [isThirdwebKYCVerified, setIsThirdwebKYCVerified] = useState(false);
  const [hasBalances, setHasBalances] = useState(false);
  const [bannerText, setBannerText] = useState("");
  const [ctaText, setCtaText] = useState("");
  
  const { isInjectedWallet } = useInjectedWallet();
  const account = useActiveAccount();
  const { user } = usePrivy();

  // Check KYC status for a wallet address
  const checkKYCStatus = async (walletAddress: string): Promise<boolean> => {
    try {
      const response = await fetchKYCStatus(walletAddress);
      return response.data.status === "success";
    } catch (error) {
      // If KYC check fails (404 or other error), assume not verified
      return false;
    }
  };

  const checkPrivyUser = useCallback(async () => {
    setIsCheckingMigration(true);

    // Don't check if it's an injected wallet
    if (isInjectedWallet) {
      setShouldShowMigrationLogic(false);
      setIsCheckingMigration(false);
      return;
    }

    // Only check if we have a thirdweb account
    if (!account?.address) {
      setShouldShowMigrationLogic(false);
      setIsCheckingMigration(false);
      return;
    }

    // Get Privy smart wallet address
    const getPrivySmartWalletAddress = () => {
      if (!user?.linkedAccounts) return null;
      const smartWallet = user.linkedAccounts.find(
        (account) => account.type === "smart_wallet"
      );
      return smartWallet?.address || null;
    };

    try {
      // Use enhanced user lookup that tries Thirdweb first, then Privy fallback
      const response = await fetch(
        `/api/enhanced-user-lookup?walletAddress=${account.address}`,
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        console.error("❌ BannerWithMigration: Enhanced lookup failed");
        setShouldShowMigrationLogic(false);
        setIsCheckingMigration(false);
        return;
      }

      const lookupResult = await response.json();

      // Check if we found a user with email from either source
      if (!lookupResult.email) {
        setShouldShowMigrationLogic(false);
        setIsCheckingMigration(false);
        return;
      }

      // Check if user exists in Privy (this should always be true for privy source, but let's verify)
      const privyResponse = await fetch("/api/check-privy-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: lookupResult.email }),
      });

      if (privyResponse.ok) {
        const privyResult = await privyResponse.json();

        // Check KYC status for Thirdweb wallet
        const thirdwebKYCVerified = await checkKYCStatus(account.address);
        setIsThirdwebKYCVerified(thirdwebKYCVerified);

        // Check if there are balances (simplified check)
        const privySmartWalletAddress = getPrivySmartWalletAddress();
        if (privySmartWalletAddress) {
          // For now, assume there might be balances if user has a Privy smart wallet
          setHasBalances(true);
        } else {
          setHasBalances(false);
        }

        // Set banner text based on KYC status and migration mode
        if (config.migrationMode) {
          if (thirdwebKYCVerified) {
            // User is already KYC verified, show fund transfer reminder
            setBannerText("Fund Transfer Reminder|You have funds in your old wallet that need to be transferred to your new wallet to complete the migration.");
            setCtaText("Transfer Funds");
          } else {
            // User needs KYC migration
            setBannerText("Migration Required|We're upgrading to a faster, more secure wallet. Complete your migration to continue using Noblocks.");
            setCtaText("Start Migration");
          }
        } else {
          // Use config text for non-migration mode
          setBannerText(config.noticeBannerText || "");
          setCtaText(config.noticeBannerCtaText || "");
        }

        // For now, just check if user exists - skip balance check for banner visibility
        setShouldShowMigrationLogic(privyResult.exists);

        // TODO: Store the old wallet address from privyResult.user.linked_accounts
        // for use in migration modal and other components that need it
        if (privyResult.exists && privyResult.user) {
          // Extract wallet address from linked accounts for future use
          const walletAccounts = privyResult.user.linked_accounts?.filter(
            (account: any) =>
              account.type === "wallet" || account.type === "smart_wallet",
          );

          if (walletAccounts?.length > 0) {
            // Store the old wallet address - could be used by migration modal
            // Legacy wallet address available: walletAccounts[0].address
          }
        }
      } else {
        console.error("❌ BannerWithMigration: Failed to check Privy user");
        setShouldShowMigrationLogic(false);
      }

      setIsCheckingMigration(false);
    } catch (error) {
      console.error(
        "❌ BannerWithMigration: Error checking migration eligibility:",
        error,
      );
      setShouldShowMigrationLogic(false);
      setIsCheckingMigration(false);
    }
  }, [isInjectedWallet, account?.address, user?.linkedAccounts]);

  useEffect(() => {
    checkPrivyUser();
  }, [checkPrivyUser]);

  const handleCtaClick = () => {
    if (config.migrationMode) {
      // If migration mode, open migration modal
      setMigrationModalOpen(true);
    } else if (config.noticeBannerCtaUrl) {
      // If there's a URL, open it
      window.open(config.noticeBannerCtaUrl, "_blank");
    }
    // If neither migration mode nor URL, CTA does nothing
  };

  // Only show banner if there's text configured
  if (!bannerText) return null;

  if (config.migrationMode) {
    // Migration mode: wait for check to complete, then only show for legacy users
    if (isCheckingMigration) {
      return null;
    }
    if (!shouldShowMigrationLogic) {
      return null;
    }
  }
  // Non-migration mode: show for everyone (if text exists)

  return (
    <>
      <NoticeBanner
        textLines={bannerText.split("|")}
        ctaText={ctaText}
        onCtaClick={ctaText ? handleCtaClick : undefined}
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
