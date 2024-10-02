"use client";
import Image from "next/image";
import { useAccount } from "wagmi";
import { motion } from "framer-motion";
import { useRef, useState } from "react";
import { GoQuestion } from "react-icons/go";
import { PiCaretDown } from "react-icons/pi";

import { classNames } from "../utils";
import { useOutsideClick } from "../hooks";
import { FundWalletModal } from "./FundWalletModal";
import { dropdownVariants } from "./AnimatedComponents";

export const WalletDetails = () => {
  const account = useAccount();
  const [isOpen, setIsOpen] = useState<boolean>(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  useOutsideClick({
    ref: dropdownRef,
    handler: () => setIsOpen(false),
  });

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        aria-label="Wallet details"
        aria-expanded={isOpen}
        aria-haspopup="true"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center gap-2 rounded-xl bg-gray-50 px-2 shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white active:scale-95 dark:bg-neutral-800 dark:focus-visible:ring-offset-neutral-900"
      >
        <div className="px-0.5 py-2.5">
          <Image
            src="/logos/coinbase-logo.svg"
            alt="Coinbase logo"
            width={20}
            height={20}
          />
        </div>
        <div className="h-10 w-px border-r border-dashed border-gray-100 dark:border-white/10" />
        <div className="flex items-center gap-2 py-2.5 dark:text-white/80">
          <p className="hidden sm:block">293 USDC</p>
          <PiCaretDown
            className={classNames(
              "text-base text-gray-400 transition-transform dark:text-white/50",
              isOpen ? "rotate-180" : "",
            )}
          />
        </div>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <motion.div
          initial="closed"
          animate={isOpen ? "open" : "closed"}
          exit="closed"
          variants={dropdownVariants}
          aria-label="Dropdown menu"
          className="absolute right-0 z-10 mt-4 max-h-52 min-w-64 max-w-full space-y-4 overflow-y-auto rounded-xl bg-gray-50 p-4 shadow-xl dark:bg-neutral-800"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-gray-500 dark:text-white/50">
              <p>Smart Wallet</p>

              <a
                title="Learn more about smart wallets"
                href="https://paycrest.io" // TODO: replace with link to more info about smart wallets
                target="_blank"
                rel="noopener noreferrer"
              >
                <GoQuestion className="text-base transition-colors hover:text-neutral-900 dark:hover:text-white" />
              </a>
            </div>

            <FundWalletModal address="0xb1...48e7" />
          </div>
          <div className="flex items-center gap-1">
            <Image
              src="/usdc-logo.svg"
              alt="USDC logo"
              width={14}
              height={14}
            />
            <p>293 USDC</p>
          </div>

          <hr className="w-full border border-dashed border-gray-200 dark:border-white/10" />

          <p className="text-gray-500 dark:text-white/50">
            {account.connector?.name}
          </p>
          <div className="flex items-center gap-1">
            <Image
              src="/usdc-logo.svg"
              alt="USDC logo"
              width={14}
              height={14}
            />
            <p>62.8974028 USDC</p>
          </div>
        </motion.div>
      )}
    </div>
  );
};
