"use client";
import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { useLogin, usePrivy } from "@privy-io/react-auth";
import { usePathname } from "next/navigation";

import {
  NoblocksLogo,
  NoblocksLogoIcon,
  NoblocksBetaLogo,
} from "./ImageAssets";
import { baseBtnClasses } from "./Styles";
import { WalletDetails } from "./WalletDetails";
import { NetworksDropdown } from "./NetworksDropdown";
import { SettingsDropdown } from "./SettingsDropdown";
import { identifyUser, trackEvent } from "../hooks/analytics";
import {
  shortenAddress,
  IS_MAIN_PRODUCTION_DOMAIN,
  classNames,
  getNetworkImageUrl,
} from "../utils";
import { ArrowDown01Icon } from "hugeicons-react";
import { AnimatePresence, motion } from "framer-motion";
import { MobileDropdown } from "./MobileDropdown";
import Image from "next/image";
import { useNetwork } from "../context/NetworksContext";
import { useInjectedWallet } from "../context";
import { useActualTheme } from "../hooks/useActualTheme";

export const Navbar = () => {
  const [mounted, setMounted] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileDropdownOpen, setIsMobileDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { selectedNetwork } = useNetwork();
  const { isInjectedWallet, injectedAddress } = useInjectedWallet();
  const isDark = useActualTheme();

  const { ready, authenticated, user } = usePrivy();

  const activeWallet = isInjectedWallet
    ? { address: injectedAddress, type: "injected_wallet" }
    : user?.linkedAccounts.find((account) => account.type === "smart_wallet");

  const { login } = useLogin({
    onComplete: async ({ user, isNewUser, loginMethod }) => {
      if (user.wallet?.address) {
        identifyUser(user.wallet.address, {
          login_method: loginMethod,
          isNewUser,
          createdAt: user.createdAt,
          email: user.email,
        });

        if (isNewUser) {
          localStorage.removeItem(`hasSeenNetworkModal-${user.wallet.address}`);

          trackEvent("Sign up completed", {
            "Login method": loginMethod,
            user_id: user.wallet.address,
            "Email address": user.email,
            "Sign up date": user.createdAt.toISOString(),
            "Noblocks balance": 0, // a new user should always have 0 balance
          });
        } else {
          trackEvent("Login completed", { "Login method": loginMethod });
        }
      }
    },
  });

  useEffect(() => {
    setMounted(true);
    // Register service worker for PWA
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js");
      });
    }
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!mounted) return null;

  return (
    <header
      className="fixed left-0 top-0 z-20 w-full bg-white/95 backdrop-blur transition-all dark:bg-neutral-900/95"
      role="banner"
    >
      <nav
        className="mx-auto flex max-w-screen-2xl items-center justify-between p-4 text-neutral-900 dark:text-white lg:px-8"
        aria-label="Navbar"
      >
        <div className="flex items-start gap-2 lg:flex-1">
          <div
            className="relative flex items-start gap-5"
            ref={dropdownRef}
            onMouseEnter={() => setIsDropdownOpen(true)}
            onMouseLeave={() => setIsDropdownOpen(false)}
          >
            <div className="flex items-center gap-1">
              <button
                aria-label="Noblocks Logo Icon"
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center gap-1 max-sm:min-h-9 max-sm:rounded-lg max-sm:bg-accent-gray max-sm:p-2 dark:max-sm:bg-white/10"
              >
                {IS_MAIN_PRODUCTION_DOMAIN ? (
                  <>
                    <NoblocksLogo className="max-sm:hidden" />
                    <NoblocksLogoIcon className="size-[18px] sm:hidden" />
                  </>
                ) : (
                  <>
                    <NoblocksBetaLogo className="max-sm:hidden" />
                    <NoblocksLogoIcon className="size-[18px] sm:hidden" />
                  </>
                )}
              </button>

              <ArrowDown01Icon
                className={classNames(
                  "size-5 cursor-pointer text-icon-outline-secondary transition-transform duration-200 dark:text-white/50 max-sm:hidden",
                  isDropdownOpen ? "rotate-0" : "-rotate-90",
                  IS_MAIN_PRODUCTION_DOMAIN ? "" : "!-mt-[15px]", // this adjusts the arrow position for beta logo
                )}
              />
            </div>

            {/* Blog Link - Desktop Only */}
            {!pathname.startsWith("/blog") && (
              <div
                className="hidden items-center sm:flex"
                onMouseEnter={() => setIsDropdownOpen(false)}
                onMouseLeave={() => setIsDropdownOpen(true)}
              >
                <Link
                  href="/blog"
                  className="-mt-[3px] text-sm font-medium text-gray-700 transition-colors hover:text-gray-900 dark:text-white/80 dark:hover:text-white"
                >
                  Blog
                </Link>
              </div>
            )}

            <AnimatePresence>
              {isDropdownOpen && (
                <>
                  <div className="absolute left-0 top-[calc(100%-0.5rem)] h-8 w-full" />
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="absolute left-0 top-full mt-4 w-48 rounded-lg border border-border-light bg-white p-2 text-sm shadow-lg dark:border-white/5 dark:bg-surface-overlay"
                  >
                    {pathname !== "/" && (
                      <Link
                        href="/"
                        className="flex w-full rounded-lg px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-accent-gray dark:bg-surface-overlay dark:text-white/80 dark:hover:bg-white/5"
                        onClick={() => setIsDropdownOpen(false)}
                      >
                        Home
                      </Link>
                    )}
                    {!pathname.startsWith("/blog") && (
                      <Link
                        href="/blog"
                        className="flex w-full rounded-lg px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-accent-gray dark:bg-surface-overlay dark:text-white/80 dark:hover:bg-white/5 sm:hidden"
                        onClick={() => setIsDropdownOpen(false)}
                      >
                        Blog
                      </Link>
                    )}
                    <Link
                      href="/terms"
                      className="flex w-full rounded-lg px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-accent-gray dark:bg-surface-overlay dark:text-white/80 dark:hover:bg-white/5"
                      onClick={() => setIsDropdownOpen(false)}
                    >
                      Terms
                    </Link>
                    <Link
                      href="/privacy-policy"
                      className="flex w-full rounded-lg px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-accent-gray dark:bg-surface-overlay dark:text-white/80 dark:hover:bg-white/5"
                      onClick={() => setIsDropdownOpen(false)}
                    >
                      Privacy Policy
                    </Link>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="flex gap-3 text-sm font-medium *:flex-shrink-0 sm:gap-4">
          {(ready && authenticated) || isInjectedWallet ? (
            <>
              <div className="hidden sm:block">
                <WalletDetails />
              </div>

              <div className="hidden sm:block">
                <NetworksDropdown />
              </div>

              <div className="hidden sm:block">
                <SettingsDropdown />
              </div>

              <button
                type="button"
                className="flex min-h-9 items-center gap-2 rounded-xl bg-gray-50 p-2 dark:bg-white/10 sm:hidden"
                onClick={() => setIsMobileDropdownOpen(true)}
              >
                <Image
                  src={getNetworkImageUrl(selectedNetwork, isDark)}
                  alt={selectedNetwork.chain.name}
                  width={20}
                  height={20}
                  className="size-5 rounded-full"
                />
                <span className="font-medium dark:text-white">
                  {shortenAddress(activeWallet?.address ?? "", 6)}
                </span>
                <ArrowDown01Icon className="size-4 dark:text-white/50" />
              </button>

              <AnimatePresence>
                <MobileDropdown
                  isOpen={isMobileDropdownOpen}
                  onClose={() => setIsMobileDropdownOpen(false)}
                />
              </AnimatePresence>
            </>
          ) : (
            !isInjectedWallet && (
              <button
                type="button"
                className={`${baseBtnClasses} min-h-9 bg-lavender-50 text-lavender-500 hover:bg-lavender-100 dark:bg-lavender-500/[12%] dark:text-lavender-500 dark:hover:bg-lavender-500/[20%]`}
                onClick={() => login()}
              >
                Sign in
              </button>
            )
          )}
        </div>
      </nav>
    </header>
  );
};
