"use client";

import Image from "next/image";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { useRouter } from "next/navigation";
import { ArrowUp01Icon } from "hugeicons-react";
import { useNoblocksLogout } from "@/app/hooks/useNoblocksLogout";
import { useWalletAddress } from "@/app/hooks/useWalletAddress";
import {
  copyToClipboard,
  classNames,
  shortenAddress,
  getAvatarImageFromAddress,
} from "@/app/utils";
import { usePrivy } from "@privy-io/react-auth";
import { shellFocusRingClasses } from "./shellFocusStyles";

const menuItemClasses =
  "flex min-h-11 w-full items-center px-3 py-3 text-left text-sm font-medium text-text-body data-[focus]:bg-accent-gray dark:text-white dark:data-[focus]:bg-white/10";

export function WalletAccountMenu() {
  const router = useRouter();
  const walletAddress = useWalletAddress();
  const { authenticated } = usePrivy();
  const { signOut, isLoggingOut } = useNoblocksLogout();

  const addressLine =
    authenticated && walletAddress ? shortenAddress(walletAddress, 6) : "—";

  const avatarSrc =
    authenticated && walletAddress
      ? getAvatarImageFromAddress(walletAddress)
      : "/images/avatar/Avatar.png";

  const items = [
    { label: "Profile", href: "/profile" },
    { label: "Settings", href: "/settings" },
    { label: "Beneficiaries", href: "/beneficiaries" },
  ];

  const menuAriaLabel = `Your account, ${addressLine}`;

  return (
    <Menu as="div" className="relative w-full">
      {({ open }) => (
        <>
          <MenuButton
            aria-label={menuAriaLabel}
            className={classNames(
              "flex w-full min-h-11 items-center gap-1.5 rounded-xl border-[0.5px] border-border-light bg-background-neutral py-2 pl-2 pr-[11px] text-left transition-colors hover:bg-accent-gray dark:border-white/10 dark:bg-surface-overlay dark:hover:bg-white/10",
              shellFocusRingClasses,
            )}
          >
            <span className="relative size-[25px] shrink-0 overflow-hidden rounded-full bg-accent-gray dark:bg-white/10">
              <Image
                src={avatarSrc}
                alt=""
                width={25}
                height={25}
                className="size-[25px] object-cover"
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium leading-5 text-lavender-700 dark:text-lavender-500">
                Your account
              </span>
              <span
                className={classNames(
                  "block truncate text-sm font-normal leading-5 tracking-[-0.01em] text-text-body dark:text-white/80",
                  authenticated && !walletAddress ? "animate-pulse" : "",
                )}
              >
                {addressLine}
              </span>
            </span>
            <ArrowUp01Icon
              className={classNames(
                "size-4 shrink-0 text-icon-outline-secondary transition-transform dark:text-white/50",
                open ? "rotate-180" : "",
              )}
              aria-hidden
            />
          </MenuButton>

          <MenuItems
            anchor="top start"
            modal={false}
            className="z-50 w-[var(--button-width)] min-w-[190px] rounded-xl border border-border-light bg-white py-1 shadow-lg outline-none [--anchor-gap:theme(spacing.2)] dark:border-white/10 dark:bg-surface-overlay"
          >
            {items.map((item) => (
              <MenuItem key={item.href}>
                <button
                  type="button"
                  className={classNames(menuItemClasses, shellFocusRingClasses)}
                  onClick={() => router.push(item.href)}
                >
                  {item.label}
                </button>
              </MenuItem>
            ))}
            <MenuItem>
              <button
                type="button"
                className={classNames(menuItemClasses, shellFocusRingClasses)}
                onClick={() => {
                  if (walletAddress) {
                    void copyToClipboard(walletAddress, "Address");
                  }
                }}
              >
                My wallet address
              </button>
            </MenuItem>
            <MenuItem>
              <button
                type="button"
                disabled={isLoggingOut}
                className={classNames(
                  menuItemClasses,
                  "text-accent-red",
                  shellFocusRingClasses,
                )}
                onClick={() => {
                  void signOut();
                }}
              >
                Sign out
              </button>
            </MenuItem>
          </MenuItems>
        </>
      )}
    </Menu>
  );
}
