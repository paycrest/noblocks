"use client";
import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PiCaretDown } from "react-icons/pi";

import { useOutsideClick } from "../hooks";
import { classNames, formatCurrency } from "../utils";
import { WalletIcon } from "./ImageAssets";
import { useBalance } from "../context/BalanceContext";
import { tokens } from "../mocks";
import { dropdownVariants } from "./AnimatedComponents";
import { useFundWallet, usePrivy } from "@privy-io/react-auth";

export const WalletDetails = () => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const { smartWalletBalance, allBalances } = useBalance();

  const { user } = usePrivy();
  const { fundWallet } = useFundWallet();
  const handleFundWallet = async (address: string) => await fundWallet(address);

  const smartWallet = user?.linkedAccounts.find(
    (account) => account.type === "smart_wallet",
  );

  const dropdownRef = useRef<HTMLDivElement>(null);
  useOutsideClick({
    ref: dropdownRef,
    handler: () => setIsOpen(false),
  });

  const getTokenImageUrl = (tokenName: string) => {
    const token = tokens.find((token) => token.name === tokenName);
    return token ? token.imageUrl : "";
  };

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        title="Wallet balance"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center gap-2 rounded-xl bg-gray-50 p-2.5 shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:bg-neutral-800 dark:focus-visible:ring-offset-neutral-900"
      >
        <WalletIcon className="size-4" />
        <div className="flex items-center gap-2 dark:text-white/80">
          <p className="pr-1">
            {formatCurrency(smartWalletBalance?.total ?? 0, "USD", "en-US")}
          </p>
          <PiCaretDown
            aria-label="Caret down"
            className={classNames(
              "text-base text-gray-400 transition-transform dark:text-white/50",
              isOpen ? "rotate-180" : "",
            )}
          />
        </div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial="closed"
            animate="open"
            exit="closed"
            variants={dropdownVariants}
            className="absolute right-0 mt-2 w-64 space-y-4 rounded-xl border border-neutral-100 bg-white p-4 shadow-lg dark:border-white/5 dark:bg-neutral-800"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-gray-500 dark:text-white/50">
                  Noblocks Wallet
                </h3>
                <button
                  type="button"
                  onClick={() => handleFundWallet(smartWallet?.address ?? "")}
                  className="font-semibold text-primary"
                >
                  Fund
                </button>
              </div>
              <ul className="space-y-2 text-neutral-900 dark:text-white/80">
                {Object.entries(allBalances.smartWallet?.balances || {}).map(
                  ([token, balance]) => (
                    <li key={token} className="flex items-center gap-1">
                      <img
                        src={getTokenImageUrl(token)}
                        alt={token}
                        className="size-3.5"
                      />
                      <span>
                        {balance} {token}
                      </span>
                    </li>
                  ),
                )}
              </ul>
            </div>

            <div className="border-t border-dashed border-gray-200 dark:border-white/10" />

            <div className="space-y-2">
              <h3 className="text-gray-500 dark:text-white/50">
                External Wallet
              </h3>
              <ul className="space-y-2 text-neutral-900 dark:text-white/80">
                {Object.entries(allBalances.externalWallet?.balances || {}).map(
                  ([token, balance]) => (
                    <li key={token} className="flex items-center gap-1">
                      <img
                        src={getTokenImageUrl(token)}
                        alt={token}
                        className="size-3.5"
                      />
                      <span>
                        {balance} {token}
                      </span>
                    </li>
                  ),
                )}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
