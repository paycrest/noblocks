"use client";
import Link from "next/link";
import { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
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
import { identifyUser, trackEvent } from "../hooks/analytics/client";
import {
  shortenAddress,
  IS_MAIN_PRODUCTION_DOMAIN,
  classNames,
  getNetworkImageUrl,
} from "../utils";
import { ArrowDown01Icon } from "hugeicons-react";
import { AnimatePresence, motion } from "framer-motion";
import { MobileDropdown } from "./MobileDropdown";
import { NoblocksWorldCupLogo } from "./NoblocksWorldCupLogo";
import { NoblocksAnimatedIcon } from "./NoblocksAnimatedIcon";
import Image from "next/image";
import { useNetwork } from "../context/NetworksContext";
import { useInjectedWallet } from "../context";
import { useActualTheme } from "../hooks/useActualTheme";
import { useLoginWithScrollPin } from "../hooks/useLoginWithScrollPin";
import { clearNetworkModalSeen } from "../lib/networkModalStore";
import { useWallets } from "@privy-io/react-auth";
import { useShouldUseEOA } from "../hooks/useEIP7702Account";
import { useWalletAddress } from "../hooks/useWalletAddress";

export const Navbar = () => {
  const [mounted, setMounted] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileDropdownOpen, setIsMobileDropdownOpen] = useState(false);
  const [logoDropdownPos, setLogoDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const portaledDropdownRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { selectedNetwork } = useNetwork();
  const { isInjectedWallet, injectedAddress } = useInjectedWallet();
  const isDark = useActualTheme();
  const walletAddress = useWalletAddress();

  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const shouldUseEOA = useShouldUseEOA();

  const embeddedWallet = wallets.find(
    (wallet) => wallet.walletClientType === "privy",
  );
  const smartWallet = user?.linkedAccounts.find(
    (account) => account.type === "smart_wallet",
  );

  const activeWallet = isInjectedWallet
    ? { address: injectedAddress, type: "injected_wallet" as const }
    : selectedNetwork.chain.name === "Starknet" ||
        selectedNetwork.chain.name === "Tron"
      ? walletAddress
        ? { address: walletAddress, type: "smart_wallet" as const }
        : undefined
      : shouldUseEOA
        ? embeddedWallet
          ? { address: embeddedWallet.address, type: "eoa" as const }
          : undefined
        : smartWallet;

  const { login } = useLogin({
    onComplete: async ({ user, isNewUser, loginMethod }) => {
      if (user.wallet?.address) {
        identifyUser(user.wallet.address, {
          login_method: loginMethod,
          isNewUser,
          createdAt: user.createdAt,
          email: user.email,
        });

        localStorage.setItem("userId", user.wallet.address);

        if (isNewUser) {
          clearNetworkModalSeen(user.wallet.address);

          trackEvent("Sign up completed", {
            "Login method": loginMethod,
            user_id: user.wallet.address,
            "Email address": user.email,
            "Sign up date": user.createdAt.toISOString(),
            "Noblocks balance": 0, // a new user should always have 0 balance
          });

          // New email signups: trigger the Tier 1 "verify your phone" email
          // (Activepieces → Brevo). Fire-and-forget so it never blocks the UI.
          if (loginMethod === "email" && user.email?.address) {
            const walletAddress = user.wallet.address;
            try {
              const accessToken = await getAccessToken();
              if (accessToken) {
                void fetch("/api/kyc/signup-email", {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "x-wallet-address": walletAddress.toLowerCase(),
                  },
                }).catch((error) => {
                  console.error("[signup-email] trigger failed", error);
                });
              }
            } catch (error) {
              console.error("[signup-email] token fetch failed", error);
            }
          }
        } else {
          trackEvent("Login completed", { "Login method": loginMethod });
        }
      }
    },
  });

  // Pin body scroll while the Privy dialog is up — its end-of-body iframe
  // steals focus on mobile and drags the page to the bottom otherwise.
  const loginWithScrollPin = useLoginWithScrollPin(login);

  useEffect(() => {
    setMounted(true);
    // Register service worker for PWA
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js");
      });
    }
  }, []);

  const updateLogoDropdownPos = useCallback(() => {
    if (!dropdownRef.current) return;
    const rect = dropdownRef.current.getBoundingClientRect();
    setLogoDropdownPos({
      top: rect.bottom + 16,
      left: rect.left,
      width: rect.width,
    });
  }, []);

  useEffect(() => {
    if (!isDropdownOpen) return;
    updateLogoDropdownPos();
    window.addEventListener("resize", updateLogoDropdownPos);
    window.addEventListener("scroll", updateLogoDropdownPos, true);
    return () => {
      window.removeEventListener("resize", updateLogoDropdownPos);
      window.removeEventListener("scroll", updateLogoDropdownPos, true);
    };
  }, [isDropdownOpen, updateLogoDropdownPos]);

  const closeLogoDropdownUnlessHovered = useCallback(
    (related: EventTarget | null) => {
      if (
        !related ||
        !(related instanceof Node) ||
        (!dropdownRef.current?.contains(related) &&
          !portaledDropdownRef.current?.contains(related))
      ) {
        setIsDropdownOpen(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!isDropdownOpen) return;

    const handlePointerDownOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (dropdownRef.current?.contains(target)) return;
      if (portaledDropdownRef.current?.contains(target)) return;
      setIsDropdownOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDownOutside);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDownOutside);
  }, [isDropdownOpen]);

  if (!mounted) return null;

  return (
    <header
      className="fixed left-0 top-0 z-50 w-full bg-white/95 backdrop-blur transition-all dark:bg-neutral-900/95"
      role="banner"
    >
      <nav
        className="mx-auto flex max-w-screen-2xl items-center justify-between p-4 text-neutral-900 dark:text-white lg:px-8"
        aria-label="Navbar"
      >
        <div className="flex items-start gap-2 lg:flex-1">
          <div
            className={`relative flex ${IS_MAIN_PRODUCTION_DOMAIN ? "items-center" : "items-start"} gap-5`}
            ref={dropdownRef}
          >
            <div
              className="flex cursor-pointer items-center gap-1"
              onMouseEnter={() => setIsDropdownOpen(true)}
              onMouseLeave={(e) => closeLogoDropdownUnlessHovered(e.relatedTarget)}
            >
              <button
                aria-label="Noblocks Logo Icon"
                aria-haspopup="menu"
                aria-controls="navbar-dropdown"
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setIsDropdownOpen(!isDropdownOpen);
                }}
                className="flex items-center gap-1 max-sm:min-h-9 max-sm:rounded-lg max-sm:bg-accent-gray max-sm:p-2 dark:max-sm:bg-white/10"
              >
                {IS_MAIN_PRODUCTION_DOMAIN ? (
                  <>
                    {/* <NoblocksLogo className="max-sm:hidden" /> */}
                    <NoblocksWorldCupLogo className="max-sm:hidden" />
                    <NoblocksAnimatedIcon className="size-[18px] sm:hidden" />
                  </>
                ) : (
                  <>
                    {/* <NoblocksBetaLogo className="max-sm:hidden" /> */}
                    <NoblocksWorldCupLogo className="max-sm:hidden" />
                    <NoblocksAnimatedIcon className="size-[18px] sm:hidden" />
                  </>
                )}
              </button>

              <ArrowDown01Icon
                className={classNames(
                  "size-5 cursor-pointer text-icon-outline-secondary transition-transform duration-200 dark:text-white/50 max-sm:hidden",
                  isDropdownOpen ? "rotate-0" : "-rotate-90",
                  IS_MAIN_PRODUCTION_DOMAIN ? "" : "!-mt-[0px]", // this adjusts the arrow position for beta logo
                )}
                onClick={(e) => {
                  e.preventDefault();
                  setIsDropdownOpen(!isDropdownOpen);
                }}
              />
            </div>

            {/* Home Link */}
            {pathname !== "/" && (
              <div className="hidden items-center sm:flex">
                <Link
                  href="/"
                  className={` ${IS_MAIN_PRODUCTION_DOMAIN ? "" : "-mt-[3px]"} text-sm font-medium text-gray-700 transition-colors hover:text-gray-900 dark:text-white/80 dark:hover:text-white`}
                >
                  Home
                </Link>
              </div>
            )}
            {/* Blog Link - Desktop Only */}
            {!pathname.startsWith("/blog") && (
              <div className="hidden items-center sm:flex">
                <Link
                  href="/blog"
                  className={` ${IS_MAIN_PRODUCTION_DOMAIN ? "" : "-mt-[3px]"} text-sm font-medium text-gray-700 transition-colors hover:text-gray-900 dark:text-white/80 dark:hover:text-white`}
                >
                  Blog
                </Link>
              </div>
            )}

            {/* Swap Link - Show on /blog and nested blog routes */}
            {pathname.startsWith("/blog") && (
              <div className="hidden items-center sm:flex">
                <Link
                  href="/"
                  className={`${IS_MAIN_PRODUCTION_DOMAIN ? "" : "-mt-[3px]"
                    } text-sm font-medium text-gray-700 transition-colors hover:text-gray-900 dark:text-white/80 dark:hover:text-white`}
                >
                  Swap
                </Link>
              </div>
            )}
            {mounted &&
              typeof document !== "undefined" &&
              createPortal(
                <AnimatePresence>
                  {isDropdownOpen && (
                    <div ref={portaledDropdownRef}>
                      {/* Invisible bridge — portaled above promo collage (z-[55]) */}
                      <div
                        className="fixed z-[60]"
                        style={{
                          top: logoDropdownPos.top - 24,
                          left: logoDropdownPos.left,
                          width: Math.max(logoDropdownPos.width, 192),
                          height: 24,
                        }}
                        onMouseEnter={() => setIsDropdownOpen(true)}
                        onMouseLeave={(e) =>
                          closeLogoDropdownUnlessHovered(e.relatedTarget)
                        }
                      />
                      <motion.div
                        id="navbar-dropdown"
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="fixed z-[60] w-48 rounded-lg border border-border-light bg-white p-2 text-sm shadow-lg dark:border-white/5 dark:bg-surface-overlay"
                        style={{
                          top: logoDropdownPos.top,
                          left: logoDropdownPos.left,
                        }}
                        onMouseEnter={() => setIsDropdownOpen(true)}
                        onMouseLeave={(e) =>
                          closeLogoDropdownUnlessHovered(e.relatedTarget)
                        }
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
                    </div>
                  )}
                </AnimatePresence>,
                document.body,
              )}
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
                onClick={() => loginWithScrollPin()}
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
