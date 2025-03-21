"use client";
import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { useOutsideClick } from "../hooks";
import {
  classNames,
  fetchSupportedTokens,
  formatCurrency,
  detectWalletProvider,
} from "../utils";
import { useBalance } from "../context/BalanceContext";
import { dropdownVariants } from "./AnimatedComponents";
import { usePrivy } from "@privy-io/react-auth";
import { Token } from "../types";
import { useNetwork } from "../context/NetworksContext";
import { TransferModal } from "./TransferModal";
import { ArrowDown01Icon, Wallet01Icon } from "hugeicons-react";
import Image from "next/image";
import { FundWalletModal } from "./FundWalletModal";
import { useFundWalletHandler } from "../hooks/useFundWalletHandler";
import { useInjectedWallet } from "../context";

export const WalletDetails = () => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isTransferModalOpen, setIsTransferModalOpen] =
    useState<boolean>(false);
  const [isFundModalOpen, setIsFundModalOpen] = useState(false);

  const { selectedNetwork } = useNetwork();
  const { allBalances } = useBalance();
  const { isInjectedWallet, injectedAddress } = useInjectedWallet();

  const { user } = usePrivy();

  const { handleFundWallet } = useFundWalletHandler("Wallet details");

  const activeWallet = isInjectedWallet
    ? { address: injectedAddress }
    : user?.linkedAccounts.find((account) => account.type === "smart_wallet");

  const activeBalance = isInjectedWallet
    ? allBalances.injectedWallet
    : allBalances.smartWallet;

  const handleFundWalletClick = async (
    amount: string,
    tokenAddress: `0x${string}`,
    onComplete?: (success: boolean) => void,
  ) => {
    await handleFundWallet(
      activeWallet?.address ?? "",
      amount,
      tokenAddress,
      onComplete,
    );
  };

  const dropdownRef = useRef<HTMLDivElement>(null);
  useOutsideClick({
    ref: dropdownRef,
    handler: () => setIsOpen(false),
  });

  const tokens: { name: string; imageUrl: string | undefined }[] = [];
  const fetchedTokens: Token[] =
    fetchSupportedTokens(selectedNetwork.chain.name) || [];
  for (const token of fetchedTokens) {
    tokens.push({
      name: token.symbol,
      imageUrl: token.imageUrl,
    });
  }

  const getTokenImageUrl = (tokenName: string) => {
    const token = tokens.find((token) => token.name === tokenName);
    return token ? token.imageUrl : "";
  };

  return (
    <>
      <div ref={dropdownRef} className="relative">
        <button
          type="button"
          title="Wallet balance"
          onClick={() => {
            setIsOpen(!isOpen);
          }}
          className="flex h-9 items-center justify-center gap-2 rounded-xl bg-accent-gray px-2.5 py-2.5 transition-colors duration-300 hover:bg-border-light focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:bg-white/10 dark:hover:bg-white/20 dark:focus-visible:ring-offset-neutral-900 sm:py-0"
        >
          <Wallet01Icon className="size-5 text-icon-outline-secondary dark:text-white/50" />
          <div className="h-9 w-px border-r border-dashed border-border-light dark:border-white/10" />
          <div className="flex items-center gap-1.5 dark:text-white/80">
            <p>{formatCurrency(activeBalance?.total ?? 0, "USD", "en-US")}</p>
            <ArrowDown01Icon
              aria-label="Caret down"
              className={classNames(
                "mx-1 size-4 text-icon-outline-secondary transition-transform duration-300 dark:text-white/50",
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
              className="absolute right-0 mt-3 w-[273px] space-y-2 rounded-xl border border-neutral-100 bg-white p-2 shadow-lg dark:border-white/5 dark:bg-surface-overlay"
            >
              <AnimatePresence>
                {activeBalance?.balances ? (
                  <motion.div
                    initial="closed"
                    animate="open"
                    exit="closed"
                    variants={dropdownVariants}
                    className="space-y-3 rounded-xl bg-accent-gray p-3 dark:bg-white/5"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="font-light text-gray-500 dark:text-white/50">
                        {isInjectedWallet
                          ? detectWalletProvider()
                          : "Noblocks Wallet"}
                      </h3>
                    </div>

                    <ul className="space-y-2 text-neutral-900 dark:text-white/80">
                      {Object.entries(activeBalance?.balances || {}).map(
                        ([token, balance]) => (
                          <li key={token} className="flex items-center gap-1">
                            {(() => {
                              const imageUrl = getTokenImageUrl(token);

                              return imageUrl ? (
                                <Image
                                  src={imageUrl}
                                  alt={token}
                                  width={14}
                                  height={14}
                                  className="size-3.5"
                                />
                              ) : null;
                            })()}

                            <span className="font-medium">
                              {balance} {token}
                            </span>
                          </li>
                        ),
                      )}
                    </ul>

                    {!isInjectedWallet && (
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setIsFundModalOpen(true);
                            setIsOpen(false);
                          }}
                          className="font-medium text-lavender-500"
                        >
                          Fund
                        </button>
                        <p className="text-[10px] text-gray-200 dark:text-white/10">
                          |
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setIsTransferModalOpen(true);
                            setIsOpen(false);
                          }}
                          className="font-medium text-lavender-500"
                        >
                          Transfer
                        </button>
                      </div>
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    initial="closed"
                    animate="open"
                    exit="closed"
                    variants={dropdownVariants}
                    className="space-y-3 rounded-xl bg-accent-gray p-3 dark:bg-white/5"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="font-light text-gray-500 dark:text-white/50">
                        No balances available
                      </h3>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {!isInjectedWallet && (
        <>
          <TransferModal
            isOpen={isTransferModalOpen}
            onClose={() => setIsTransferModalOpen(false)}
          />

          <FundWalletModal
            isOpen={isFundModalOpen}
            onClose={() => setIsFundModalOpen(false)}
            onFund={handleFundWalletClick}
          />
        </>
      )}
    </>
  );
};
