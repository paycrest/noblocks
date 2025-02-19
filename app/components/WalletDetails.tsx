"use client";
import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Dialog, DialogPanel } from "@headlessui/react";

import { useOutsideClick } from "../hooks";
import { classNames, fetchSupportedTokens, formatCurrency } from "../utils";
import { useBalance } from "../context/BalanceContext";
import { dropdownVariants } from "./AnimatedComponents";
import { useFundWallet, usePrivy, useWallets } from "@privy-io/react-auth";
import { Token } from "../types";
import { useNetwork } from "../context/NetworksContext";
import { trackEvent } from "../hooks/analytics";
import { TransferModal } from "./TransferModal";
import { ArrowDown01Icon, Wallet01Icon } from "hugeicons-react";
import Image from "next/image";

export const WalletDetails = () => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isTransferModalOpen, setIsTransferModalOpen] =
    useState<boolean>(false);

  const { selectedNetwork } = useNetwork();
  const { smartWalletBalance, allBalances, refreshBalance } = useBalance();

  const { user } = usePrivy();

  const { fundWallet } = useFundWallet({
    onUserExited: ({ fundingMethod, chain }) => {
      // NOTE: This is an inaccurate way of tracking funding status
      // Privy doesn't provide detailed funding status information
      // Available variables in onUserExited: address, chain, fundingMethod, balance
      // Limitations:
      // 1. fundingMethod only indicates user selected a method, not if funding completed
      // 2. User can select method and cancel, but it still records as "completed"
      // 3. No way to track funding errors
      // 4. balance is returned as bigint and doesn't specify token type
      // 5. No webhook or callback for actual funding confirmation
      if (fundingMethod) {
        refreshBalance();
        trackEvent("Funding Completed", {
          "Funding type": fundingMethod,
          Amount: "Not available on Privy",
          Network: chain.name,
          Token: "USDC", // privy only supports USDC
          "Funding date": new Date().toISOString(),
        });
      } else {
        trackEvent("Funding cancelled", {
          "Funding type": "User exited the funding process",
          Amount: "Not available on Privy",
          Network: chain.name,
          Token: "USDC", // privy only supports USDC
          "Funding date": new Date().toISOString(),
        });
      }
    },
  });

  const handleFundWallet = async (address: string) => {
    trackEvent("Funding started", {
      "Entry point": "Fund button on navbar",
    });
    const fetchedTokens: Token[] =
      fetchSupportedTokens(selectedNetwork.chain.name) || [];
    const tokenAddress = fetchedTokens.find(
      (t) =>
        t.symbol.toUpperCase() ===
        (selectedNetwork.chain.name.toLowerCase() === "base" ? "USDC" : "USDT"),
    )?.address as `0x${string}`;

    await fundWallet(address, {
      chain: selectedNetwork.chain,
      asset: { erc20: tokenAddress },
    });
  };

  const smartWallet = user?.linkedAccounts.find(
    (account) => account.type === "smart_wallet",
  );

  const { wallets } = useWallets();
  const externalWallet = wallets.find(
    (wallet) => wallet.walletClientType !== "privy",
  );

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
            <p>
              {formatCurrency(smartWalletBalance?.total ?? 0, "USD", "en-US")}
            </p>
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
                {allBalances.smartWallet?.balances && (
                  <motion.div
                    initial="closed"
                    animate="open"
                    exit="closed"
                    variants={dropdownVariants}
                    className="space-y-3 rounded-xl bg-accent-gray p-3 dark:bg-white/5"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="font-light text-gray-500 dark:text-white/50">
                        Noblocks Wallet
                      </h3>
                    </div>

                    <ul className="space-y-2 text-neutral-900 dark:text-white/80">
                      {Object.entries(
                        allBalances.smartWallet?.balances || {},
                      ).map(([token, balance]) => (
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
                      ))}
                    </ul>

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          handleFundWallet(smartWallet?.address ?? "");
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
                  </motion.div>
                )}
              </AnimatePresence>

              {/* <AnimatePresence>
                {allBalances.externalWallet?.balances && (
                  <motion.div
                    initial="closed"
                    animate="open"
                    exit="closed"
                    variants={dropdownVariants}
                    className="space-y-3 rounded-xl bg-accent-gray p-3 dark:bg-white/5"
                  >
                    <h3 className="font-light capitalize text-gray-500 dark:text-white/50">
                      {externalWallet?.walletClientType}
                    </h3>
                    <ul className="space-y-2 text-neutral-900 dark:text-white/80">
                      {Object.entries(allBalances.externalWallet.balances).map(
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
                  </motion.div>
                )}
              </AnimatePresence> */}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {isTransferModalOpen && (
          <Dialog
            open={isTransferModalOpen}
            onClose={() => setIsTransferModalOpen(false)}
            className="relative z-50"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="fixed inset-0 bg-black/30 backdrop-blur-sm"
            />

            <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 30,
                }}
              >
                <DialogPanel className="relative max-h-[90vh] w-full max-w-[25.75rem] overflow-y-auto rounded-2xl bg-white p-5 text-sm shadow-xl dark:bg-surface-overlay">
                  <TransferModal
                    setIsTransferModalOpen={setIsTransferModalOpen}
                  />
                </DialogPanel>
              </motion.div>
            </div>
          </Dialog>
        )}
      </AnimatePresence>
    </>
  );
};
