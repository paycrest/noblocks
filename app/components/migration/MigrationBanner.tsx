"use client";
import Image from "next/image";
import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { whiteBtnClasses } from "../Styles";
import MigrationModal from "./MigrationModal";
import { useInjectedWallet } from "@/app/context";
import { useActiveAccount } from "thirdweb/react";

const MigrationBanner: React.FC<{ onClick?: () => void }> = ({ onClick }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [shouldShowBanner, setShouldShowBanner] = useState(false);
  const { isInjectedWallet } = useInjectedWallet();
  const account = useActiveAccount();

  const checkPrivyUser = useCallback(async () => {
    // Don't check if it's an injected wallet
    if (isInjectedWallet) {
      setShouldShowBanner(false);
      return;
    }

    // Only check if we have a thirdweb account
    if (!account?.address) {
      setShouldShowBanner(false);
      return;
    }

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
        console.error(
          "❌ Migration Banner: Failed to fetch user details:",
          await response.text(),
        );
        setShouldShowBanner(false);
        return;
      }

      const lookupResult = await response.json();

      // Check if we found a user with email from either source
      if (!lookupResult.email) {
        setShouldShowBanner(false);
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

      if (!privyResponse.ok) {
        console.error(
          "❌ Migration Banner: Failed to check Privy user:",
          await privyResponse.text(),
        );
        setShouldShowBanner(false);
        return;
      }

      const { exists } = await privyResponse.json();

      if (!exists) {
        setShouldShowBanner(false);
        return;
      }

      // Show banner if user exists in Privy (temporarily disable balance check)
      setShouldShowBanner(true);
    } catch (error) {
      console.error("Error checking for Privy user:", error);
      setShouldShowBanner(false);
    }
  }, [account?.address, isInjectedWallet]);

  useEffect(() => {
    checkPrivyUser();
  }, [checkPrivyUser]);

  if (!shouldShowBanner) return null;

  return (
    <>
      <motion.div
        className="fixed left-0 right-0 top-20 z-30 flex min-h-14 w-full items-center justify-center bg-[#2D77E2] px-0 md:px-0"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <div className="relative w-full sm:flex sm:items-center sm:py-0 sm:pr-8">
          {/* Mobile Illustration */}
          <div className="absolute left-0 top-0 z-0 sm:hidden">
            <Image
              src="/images/banner-illustration-mobile.svg"
              alt="Migration Banner Illustration Mobile"
              width={37}
              height={104}
              priority
              className="h-full w-auto"
            />
          </div>
          {/* Desktop Illustration */}
          <div className="z-10 hidden flex-shrink-0 sm:static sm:mr-4 sm:block">
            <Image
              src="/images/banner-illustration.svg"
              alt="Migration Banner Illustration"
              width={74}
              height={64}
              priority
            />
          </div>
          {/* Text and Button */}
          <div className="relative z-10 flex flex-grow flex-col items-start justify-between gap-3 px-4 py-4 pl-6 text-left text-sm font-medium leading-tight text-white/80 sm:flex-row sm:items-center sm:px-0 sm:py-4 sm:pl-0 sm:text-left">
            <span className="flex-1">
              Noblocks is migrating, this is a legacy version that will be
              closed by{" "}
              <span className="font-semibold text-white">September, 2025.</span>{" "}
              Click on start migration to move to the new version.
            </span>
            <button
              type="button"
              className={`${whiteBtnClasses} min-h-9 flex-shrink-0 sm:ml-6`}
              onClick={() => setModalOpen(true)}
            >
              Start migration
            </button>
          </div>
        </div>
      </motion.div>
      <MigrationModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
};

export default MigrationBanner;
