"use client";
import React, { useState, useEffect, useCallback } from "react";
import NoticeBanner from "./NoticeBanner";
import MigrationModal from "./migration/MigrationModal";
import { useInjectedWallet } from "@/app/context";
import { useActiveAccount } from "thirdweb/react";
import config from "@/app/lib/config";

const BannerWithMigration: React.FC = () => {
  const [migrationModalOpen, setMigrationModalOpen] = useState(false);
  const [shouldShowMigrationLogic, setShouldShowMigrationLogic] =
    useState(false);
  const [isCheckingMigration, setIsCheckingMigration] = useState(true);
  const { isInjectedWallet } = useInjectedWallet();
  const account = useActiveAccount();

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

    try {
      // Step 1: Get user details from ThirdWeb API to get email
      const thirdwebResponse = await fetch(
        `/api/thirdweb/user-details?walletAddress=${account.address}`,
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!thirdwebResponse.ok) {
        console.error(
          "Failed to fetch user details from thirdweb:",
          await thirdwebResponse.text(),
        );
        setShouldShowMigrationLogic(false);
        setIsCheckingMigration(false);
        return;
      }

      const userData = await thirdwebResponse.json();

      // userData is an array of user details from thirdweb API
      if (Array.isArray(userData) && userData.length > 0) {
        const userEmail = userData[0]?.email;

        if (userEmail) {
          // Step 2: Check if this email had a Privy account
          const privyResponse = await fetch("/api/check-privy-user", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ email: userEmail }),
          });

          if (privyResponse.ok) {
            const privyResult = await privyResponse.json();

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
            console.error(
              "Failed to check Privy user:",
              await privyResponse.text(),
            );
            setShouldShowMigrationLogic(false);
          }
        } else {
          // No email found in ThirdWeb user details
          setShouldShowMigrationLogic(false);
        }
      } else {
        setShouldShowMigrationLogic(false);
      }
      setIsCheckingMigration(false);
    } catch (error) {
      console.error("Error checking migration eligibility:", error);
      setShouldShowMigrationLogic(false);
      setIsCheckingMigration(false);
    }
  }, [isInjectedWallet, account?.address]);

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
  if (!config.noticeBannerText) return null;

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
        textLines={config.noticeBannerText.split("|")}
        ctaText={config.noticeBannerCtaText}
        onCtaClick={config.noticeBannerCtaText ? handleCtaClick : undefined}
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
