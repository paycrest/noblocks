"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";

import { ArrowDownIcon, NoblocksLogo } from "./ImageAssets";
import { primaryBtnClasses } from "./Styles";
import { WalletDetails } from "./WalletDetails";
import { NetworksDropdown } from "./NetworksDropdown";
import { SettingsDropdown } from "./SettingsDropdown";
import { AnimatedComponent } from "./AnimatedComponents";

export const Navbar = () => {
  const [mounted, setMounted] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const { ready, authenticated, login } = usePrivy();

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return (
    <header className="fixed left-0 top-0 z-20 w-full bg-white transition-all dark:bg-neutral-900">
      <nav
        className="container mx-auto flex items-center justify-between p-4 text-neutral-900 dark:text-white lg:px-8"
        aria-label="Navbar"
      >
        <div className="flex items-center gap-2 lg:flex-1">
          <Link href="/" className="flex items-center gap-1">
            <NoblocksLogo />
          </Link>
          <div
            className="relative flex items-center"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            {isHovered && (
              <AnimatedComponent
                className="ml-4 mr-4 flex items-center gap-4 text-sm font-normal dark:text-white/80"
                delay={0.1}
              >
                <Link href="/terms">Terms</Link>
                <Link href="/privacy_policy">Privacy Policy</Link>
              </AnimatedComponent>
            )}
            <ArrowDownIcon
              className={`cursor-pointer text-gray-400 transition-transform dark:text-white/50 ${isHovered ? "rotate-90" : "-rotate-90"}`}
            />
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
                onClick={login}
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
