"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useRef, useState } from "react";
import { useLinkAccount, useLogout, usePrivy } from "@privy-io/react-auth";
import { ImSpinner } from "react-icons/im";

import { PiCheck } from "react-icons/pi";

import { useOutsideClick } from "../hooks";
import { shortenAddress } from "../utils";
import { dropdownVariants } from "./AnimatedComponents";
import { trackEvent } from "../hooks/analytics";
import {
  AccessIcon,
  Copy01Icon,
  Logout03Icon,
  Mail01Icon,
  Setting07Icon,
  Wallet01Icon,
} from "hugeicons-react";
import { toast } from "sonner";

export const SettingsDropdown = () => {
  const { user, exportWallet, updateEmail } = usePrivy();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isAddressCopied, setIsAddressCopied] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  useOutsideClick({
    ref: dropdownRef,
    handler: () => setIsOpen(false),
  });

  const smartWallet = user?.linkedAccounts.find(
    (account) => account.type === "smart_wallet",
  );

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(smartWallet?.address ?? "");
    setIsAddressCopied(true);
    setTimeout(() => setIsAddressCopied(false), 2000);
  };

  const { logout } = useLogout({
    onSuccess: () => {
      setIsLoggingOut(false);
      trackEvent("sign_out");
    },
  });

  const { linkEmail } = useLinkAccount({
    onSuccess: ({ user }) => {
      toast.success(`${user.email} linked successfully`);
    },
    onError: () => {
      toast.error("Error linking account", {
        description: "You might have this email linked already",
      });
    },
  });

  const handleLogout = () => {
    setIsLoggingOut(true);
    logout();
  };

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        aria-label="Wallet details"
        aria-expanded={isOpen}
        aria-haspopup="true"
        onClick={() => {
          setIsOpen(!isOpen);
          trackEvent("cta_clicked", { cta: "Settings Dropdown" });
        }}
        className="flex h-9 items-center justify-center gap-2 rounded-xl bg-accent-gray p-2 transition-colors duration-300 hover:bg-border-light focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white active:scale-95 dark:bg-white/10 dark:hover:bg-white/20 dark:focus-visible:ring-offset-neutral-900"
      >
        <Setting07Icon className="size-5 text-outline-gray dark:text-white" />
      </button>

      {/* Dropdown menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial="closed"
            animate={isOpen ? "open" : "closed"}
            exit="closed"
            variants={dropdownVariants}
            aria-label="Dropdown menu"
            className="absolute right-0 z-10 mt-4 w-fit space-y-4 overflow-hidden rounded-xl border-2 border-border-light bg-white py-2 shadow-xl dark:bg-neutral-800"
          >
            <ul
              role="menu"
              aria-labelledby="settings-dropdown"
              aria-orientation="vertical"
              className="text-sm font-normal text-black dark:text-white/80"
            >
              <li
                role="menuitem"
                className="flex cursor-pointer items-center justify-between gap-2 px-4 py-2 transition hover:bg-accent-gray dark:hover:bg-neutral-700"
              >
                <button
                  type="button"
                  className="group flex w-full items-center justify-between gap-2.5"
                  onClick={handleCopyAddress}
                >
                  <div className="flex items-center gap-2.5">
                    <Wallet01Icon className="text-icon-outline-secondary size-5" />
                    <p className="max-w-60 break-words">
                      {shortenAddress(smartWallet?.address ?? "", 6)}
                    </p>
                  </div>
                  {isAddressCopied ? (
                    <PiCheck className="size-4 text-green-900 dark:text-green-500" />
                  ) : (
                    <Copy01Icon className="text-icon-outline-secondary size-4 transition group-hover:text-lavender-500 dark:hover:text-white" />
                  )}
                </button>
              </li>
              {user?.email ? (
                <li
                  role="menuitem"
                  className="flex cursor-pointer items-center justify-between gap-2 px-4 py-2 transition hover:bg-accent-gray dark:hover:bg-neutral-700"
                >
                  <button
                    type="button"
                    className="group flex w-full items-center justify-between gap-4"
                    onClick={updateEmail}
                  >
                    <div className="flex items-center gap-2.5">
                      <Mail01Icon className="text-icon-outline-secondary size-5 flex-shrink-0 dark:text-white/40" />
                      <p className="whitespace-nowrap">Linked email</p>
                    </div>
                    <p className="max-w-20 truncate text-neutral-500 dark:text-white/40">
                      {user.email.address}
                    </p>
                  </button>
                </li>
              ) : (
                <li
                  role="menuitem"
                  className="flex cursor-pointer items-center justify-between gap-2 px-4 py-2 transition hover:bg-accent-gray dark:hover:bg-neutral-700"
                >
                  <button
                    type="button"
                    className="group flex w-full items-center justify-between gap-2.5"
                    onClick={linkEmail}
                  >
                    <div className="flex items-center gap-2.5">
                      <Mail01Icon
                        className="text-icon-outline-secondary size-5 dark:text-white/40"
                        strokeWidth={2}
                      />
                      <p>Link email address</p>
                    </div>
                  </button>
                </li>
              )}
              <li
                role="menuitem"
                className="flex cursor-pointer items-center gap-2.5 px-4 py-2 transition hover:bg-accent-gray dark:hover:bg-neutral-700"
                onClick={exportWallet}
              >
                <AccessIcon className="text-icon-outline-secondary size-5" />
                <p>Export wallet</p>
              </li>
              <li
                role="menuitem"
                className="flex cursor-pointer items-center gap-2.5 px-4 py-2 transition hover:bg-accent-gray dark:hover:bg-neutral-700"
                onClick={handleLogout}
              >
                {isLoggingOut ? (
                  <ImSpinner className="text-icon-outline-secondary size-5 animate-spin" />
                ) : (
                  <Logout03Icon className="text-icon-outline-secondary size-5" />
                )}
                <p>Sign out</p>
              </li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
