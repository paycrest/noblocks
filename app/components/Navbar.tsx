"use client";
import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { useLogin, usePrivy } from "@privy-io/react-auth";

import { ArrowDownIcon, NoblocksBetaLogo } from "./ImageAssets";
import { primaryBtnClasses } from "./Styles";
import { WalletDetails } from "./WalletDetails";
import { NetworksDropdown } from "./NetworksDropdown";
import { SettingsDropdown } from "./SettingsDropdown";
import { AnimatedComponent } from "./AnimatedComponents";
import { trackEvent } from "../hooks/analytics";

export const Navbar = () => {
  const [mounted, setMounted] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { ready, authenticated } = usePrivy();

  const { login } = useLogin({
    onComplete: () => {
      trackEvent("wallet_connected");
    },
  });

  useEffect(() => setMounted(true), []);

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
    <header className="fixed left-0 top-0 z-20 w-full bg-white transition-all dark:bg-neutral-900">
      <nav
        className="container mx-auto flex items-center justify-between p-4 text-neutral-900 dark:text-white lg:px-8"
        aria-label="Navbar"
      >
        <div className="flex items-start gap-2 lg:flex-1">
          <div
            className="flex items-start gap-1"
            ref={dropdownRef}
            onMouseEnter={() => setIsDropdownOpen(true)}
            onMouseLeave={() => setIsDropdownOpen(false)}
          >
            <button
              aria-label="Noblocks Beta Logo"
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center gap-1"
            >
              <NoblocksBetaLogo />
            </button>

            <div className="relative">
              <button
                aria-label="Dropdown Menu"
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center gap-1 text-gray-400 hover:text-gray-600 dark:text-white/50 dark:hover:text-white/80"
              >
                <ArrowDownIcon
                  className={`transition-transform duration-200 ${
                    isDropdownOpen ? "rotate-0" : "-rotate-90"
                  }`}
                />
              </button>

              {isDropdownOpen && (
                <div className="absolute left-0 top-full mt-2 w-48 rounded-lg border border-gray-200 bg-white py-2 shadow-lg dark:border-white/10 dark:bg-neutral-800">
                  <Link
                    href="/terms"
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-white/80 dark:hover:bg-white/5"
                    onClick={() => setIsDropdownOpen(false)}
                  >
                    Terms
                  </Link>
                  <Link
                    href="/privacy-policy"
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-white/80 dark:hover:bg-white/5"
                    onClick={() => setIsDropdownOpen(false)}
                  >
                    Privacy Policy
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-4 text-sm font-medium">
          {ready && authenticated ? (
            <>
              <WalletDetails />

              <NetworksDropdown />

              <SettingsDropdown />
            </>
          ) : (
            <>
              <button
                type="button"
                className={primaryBtnClasses}
                onClick={() => login()}
              >
                Sign In
              </button>
            </>
          )}
        </div>
      </nav>
    </header>
  );
};
