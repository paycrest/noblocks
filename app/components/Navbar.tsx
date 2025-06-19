"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ArrowDown01Icon } from "hugeicons-react";
import { useEffect, useState, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";

import {
  useConnectModal,
  useActiveAccount,
  ConnectButton,
} from "thirdweb/react";
import { getConnectConfig } from "../lib/thirdweb";

import {
  NoblocksLogo,
  NoblocksLogoIcon,
  NoblocksBetaLogo,
} from "./ImageAssets";
import { baseBtnClasses } from "./Styles";
import { WalletDetails } from "./WalletDetails";
import { NetworksDropdown } from "./NetworksDropdown";
import { SettingsDropdown } from "./SettingsDropdown";
import {
  shortenAddress,
  IS_MAIN_PRODUCTION_DOMAIN,
  classNames,
  getNetworkImageUrl,
} from "../utils";
import { MobileDropdown } from "./MobileDropdown";
import { useNetwork } from "../context/NetworksContext";
import { useInjectedWallet } from "../context";
import { useActualTheme } from "../hooks/useActualTheme";
import { Chain } from "thirdweb";

export const Navbar = () => {
  const pathname = usePathname();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isDark = useActualTheme();
  const { selectedNetwork } = useNetwork();
  const { isInjectedWallet, injectedAddress } = useInjectedWallet();

  const [mounted, setMounted] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileDropdownOpen, setIsMobileDropdownOpen] = useState(false);

  const { connect } = useConnectModal();
  const account = useActiveAccount();
  const isAuthenticated = !!account;

  const activeWallet = isInjectedWallet
    ? { address: injectedAddress }
    : { address: account?.address };

  const handleConnect = async () => {
    await connect(
      getConnectConfig(isDark, selectedNetwork.chain as unknown as Chain),
    );
  };

  useEffect(() => {
    setMounted(true);
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
      className="fixed left-0 top-0 z-40 w-full bg-white transition-all dark:bg-neutral-900"
      role="banner"
    >
      <nav
        className="mx-auto flex items-center justify-between px-4 py-6 text-neutral-900 lg:container dark:text-white lg:px-8"
        aria-label="Navbar"
      >
        <div className="flex items-start gap-2 lg:flex-1">
          <div
            className="relative flex items-start gap-1"
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

            <AnimatePresence>
              {isDropdownOpen && (
                <>
                  <div className="absolute left-0 top-[calc(100%-0.5rem)] h-8 w-full" />
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="absolute left-0 top-full mt-4 w-48 rounded-lg border border-border-light bg-white p-2 text-sm shadow-lg *:flex *:w-full *:rounded-lg *:px-4 *:py-2 *:text-sm *:text-gray-700 *:transition-colors dark:border-white/5 dark:bg-surface-overlay *:dark:bg-surface-overlay *:dark:text-white/80"
                  >
                    {pathname !== "/" && (
                      <Link
                        href="/"
                        className="hover:bg-accent-gray dark:hover:bg-white/5"
                        onClick={() => setIsDropdownOpen(false)}
                      >
                        Home
                      </Link>
                    )}
                    <Link
                      href="/terms"
                      className="hover:bg-accent-gray dark:hover:bg-white/5"
                      onClick={() => setIsDropdownOpen(false)}
                    >
                      Terms
                    </Link>
                    <Link
                      href="/privacy-policy"
                      className="hover:bg-accent-gray dark:hover:bg-white/5"
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
          {isAuthenticated || isInjectedWallet ? (
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
                  alt={selectedNetwork.chain.name ?? "Network"}
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
                onClick={() => handleConnect()}
              >
                Sign in
              </button>
            )
          )}

          {/* This persists the user login and from observation, removing it will require login on every refresh */}
          <div hidden>
            <ConnectButton
              {...getConnectConfig(
                isDark,
                selectedNetwork.chain as unknown as Chain,
              )}
            />
          </div>
        </div>
      </nav>
    </header>
  );
};
