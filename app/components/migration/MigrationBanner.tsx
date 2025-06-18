"use client";
import Image from "next/image";
import React, { useState, useEffect } from "react";
import { whiteBtnClasses } from "../Styles";
import MigrationModal from "./MigrationModal";
import { useInjectedWallet } from "@/app/context";
import { useActiveAccount } from "thirdweb/react";
import { DEFAULT_THIRDWEB_CONFIG } from "@/app/lib/config";

const MigrationBanner: React.FC<{ onClick?: () => void }> = ({ onClick }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [shouldShowBanner, setShouldShowBanner] = useState(false);
  const { isInjectedWallet } = useInjectedWallet();
  const account = useActiveAccount();

  useEffect(() => {
    const checkPrivyUser = async () => {
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
        // Call thirdweb API to get user details
        const response = await fetch(
          `/api/thirdweb/user-details?walletAddress=${account.address}`,
          {
            headers: {
              "Content-Type": "application/json",
            },
          },
        );

        if (!response.ok) {
          console.error(
            "Failed to fetch user details from thirdweb:",
            await response.text(),
          );
          setShouldShowBanner(false);
          return;
        }

        const userData = await response.json();

        // Validate userData structure
        if (!Array.isArray(userData) || userData.length === 0) {
          console.error("Invalid user data format from thirdweb");
          setShouldShowBanner(false);
          return;
        }

        const userEmail = userData[0]?.email;
        if (!userEmail) {
          console.error("No email found in user data");
          setShouldShowBanner(false);
          return;
        }

        // Check if user exists in Privy
        const privyResponse = await fetch("/api/check-privy-user", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email: userEmail }),
        });

        if (!privyResponse.ok) {
          console.error(
            "Failed to check Privy user:",
            await privyResponse.text(),
          );
          setShouldShowBanner(false);
          return;
        }

        const { exists } = await privyResponse.json();
        setShouldShowBanner(exists);
      } catch (error) {
        console.error("Error checking for Privy user:", error);
        setShouldShowBanner(false);
      }
    };

    checkPrivyUser();
  }, [account?.address, isInjectedWallet]);

  // Don't render anything if we shouldn't show the banner
  if (!shouldShowBanner) return null;

  return (
    <>
      <div className="fixed left-0 right-0 top-20 z-30 flex min-h-14 w-full items-center justify-center bg-[#2D77E2] px-0 md:px-0">
        <div className="relative w-full sm:flex sm:items-center sm:py-0 sm:pr-8">
          {/* Mobile Illustration - absolute */}
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
              <span className="font-semibold text-white">6th June, 2025.</span>{" "}
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
      </div>
      <MigrationModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
};

export default MigrationBanner;
