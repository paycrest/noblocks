"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { PiCheck } from "react-icons/pi";
import {
  Setting07Icon,
  Cancel01Icon,
  Wallet01Icon,
  ArrowDown01Icon,
  RefreshIcon,
  Copy01Icon,
} from "hugeicons-react";
import { CrossChainBalanceSkeleton } from "../BalanceSkeleton";
import {
  classNames,
  getNetworkImageUrl,
  shortenAddress,
  tokenBalanceRowVisible,
} from "../../utils";
import type { CrossChainBalanceEntry } from "../../context";
import TransactionList from "../transaction/TransactionList";
import type { Network, TransactionHistory } from "../../types";
import { ReferralCTA } from "../ReferralCTA";

const Divider = () => (
  <div className="w-full border border-dashed border-[#EBEBEF] dark:border-[#FFFFFF1A]" />
);

type WalletTab = "balances" | "transactions";

interface WalletViewProps {
  isInjectedWallet: boolean;
  detectWalletProvider: () => string;
  isLoading: boolean;
  crossChainBalances: CrossChainBalanceEntry[];
  getTokenImageUrl: (tokenName: string) => string | undefined;
  onTransfer: () => void;
  onFund: () => void;
  smartWallet: { address?: string | null } | null | undefined;
  handleCopyAddress: () => void;
  isNetworkListOpen: boolean;
  setIsNetworkListOpen: (open: boolean) => void;
  networks: Network[];
  selectedNetwork: Network;
  isDark: boolean;
  handleNetworkSwitchWrapper: (network: Network) => void;
  onSettings: () => void;
  onClose: () => void;
  onHistory: () => void;
  onRefreshBalance: () => void;
  isRefreshing?: boolean;
  showEarnUi?: boolean;
  onEarn?: () => void;
  walletBalanceUsd?: number;
  onSelectTransaction?: (tx: TransactionHistory) => void;
  onViewReferrals?: () => void;
}

export const WalletView: React.FC<WalletViewProps> = ({
  isInjectedWallet,
  detectWalletProvider,
  isLoading,
  crossChainBalances,
  getTokenImageUrl,
  onTransfer,
  onFund,
  smartWallet,
  handleCopyAddress,
  isNetworkListOpen,
  setIsNetworkListOpen,
  networks,
  selectedNetwork,
  isDark,
  handleNetworkSwitchWrapper,
  onSettings,
  onClose,
  onHistory,
  onRefreshBalance,
  isRefreshing = false,
  showEarnUi = false,
  onEarn,
  walletBalanceUsd = 0,
  onSelectTransaction,
  onViewReferrals,
}) => {
  const showBalanceSkeleton = isLoading && !isRefreshing;
  const [walletTab, setWalletTab] = useState<WalletTab>("balances");
  const [isAddressCopied, setIsAddressCopied] = useState(false);

  useEffect(() => {
    if (showEarnUi && selectedNetwork.chain.name !== "Starknet") {
      setWalletTab("balances");
    }
  }, [showEarnUi, selectedNetwork.chain.name]);

  const handleCopyInCard = async () => {
    handleCopyAddress();
    setIsAddressCopied(true);
    window.setTimeout(() => setIsAddressCopied(false), 2000);
  };

  const actionButtonClass =
    "min-h-11 w-full rounded-xl bg-accent-gray py-2 text-sm font-medium text-gray-900 transition-all hover:scale-[0.98] hover:bg-[#EBEBEF] active:scale-95 dark:bg-white/5 dark:text-white dark:hover:bg-white/10";

  const tabBar = (
    <div className="sticky top-0 z-10 space-y-3 bg-white pb-2 pt-3 dark:bg-surface-overlay">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-6">
          {(
            [
              ["balances", "Balances"],
              ["transactions", "Transactions"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setWalletTab(id)}
              className={classNames(
                "shrink-0 text-sm font-medium transition-colors",
                walletTab === id
                  ? "text-text-body dark:text-white"
                  : "text-text-disabled dark:text-white/30",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          title="Select network"
          onClick={() => setIsNetworkListOpen(!isNetworkListOpen)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg py-1 pl-1 pr-0.5 hover:bg-accent-gray dark:hover:bg-white/10"
        >
          <Image
            src={getNetworkImageUrl(selectedNetwork, isDark)}
            alt={selectedNetwork.chain.name}
            width={16}
            height={16}
            className="size-4 rounded-full"
          />
          <span className="max-w-[5.5rem] truncate text-sm font-medium text-text-body dark:text-white">
            {selectedNetwork.chain.name}
          </span>
          <ArrowDown01Icon
            className={classNames(
              "size-4 text-outline-gray transition-transform dark:text-white/50",
              isNetworkListOpen && "rotate-180",
            )}
          />
        </button>
      </div>

      <AnimatePresence>
        {isNetworkListOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="space-y-1 overflow-hidden rounded-xl border border-border-light p-2 dark:border-white/10"
          >
            {networks.map((network) => (
              <button
                type="button"
                key={network.chain.name}
                onClick={() => handleNetworkSwitchWrapper(network)}
                className="flex w-full items-center justify-between rounded-lg px-2 py-2.5 hover:bg-accent-gray dark:hover:bg-white/5"
              >
                <div className="flex items-center gap-2">
                  <Image
                    src={getNetworkImageUrl(network, isDark)}
                    alt={network.chain.name}
                    width={24}
                    height={24}
                    className="size-6"
                  />
                  <span className="text-text-body dark:text-white/80">
                    {network.chain.name}
                  </span>
                </div>
                {selectedNetwork.chain.name === network.chain.name && (
                  <PiCheck
                    className="size-5 text-green-900 dark:text-green-500"
                    strokeWidth={2}
                  />
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  const balancesContent =
    walletTab === "balances" ? (
      <div className="space-y-4">
        {showBalanceSkeleton ? (
          <CrossChainBalanceSkeleton isMobile />
        ) : (
          crossChainBalances.map((entry) => {
            const isSelectedNetwork =
              entry.network.chain.name === selectedNetwork.chain.name;
            const balanceEntries = Object.entries(
              entry.balances.balances || {},
            ) as [string, number][];

            const filteredBalances = isSelectedNetwork
              ? balanceEntries
              : balanceEntries.filter(([t, balance]) =>
                  tokenBalanceRowVisible(
                    entry.balances.rawBalances,
                    t,
                    balance,
                    isSelectedNetwork,
                  ),
                );

            if (filteredBalances.length === 0) return null;

            return (
              <div key={entry.network.chain.name} className="space-y-2">
                <div className="flex items-center justify-between gap-x-4">
                  <span className="whitespace-nowrap text-xs font-medium text-text-secondary dark:text-white/50">
                    {entry.network.chain.name}
                  </span>
                  <Divider />
                </div>

                <div className="space-y-1.5">
                  {filteredBalances.map(([token, balance]) => {
                    const isCNGN = token === "CNGN" || token === "cNGN";
                    const rawBalance =
                      entry.balances.rawBalances?.[token] ?? balance;
                    const tokenImageUrl =
                      getTokenImageUrl(token) ||
                      `/logos/${token.toLowerCase()}-logo.svg`;

                    return (
                      <div
                        key={`${entry.network.chain.name}-${token}`}
                        className="flex items-center justify-between"
                      >
                        <div className="flex items-center gap-1">
                          <div className="relative">
                            <Image
                              src={tokenImageUrl}
                              alt={token}
                              width={14}
                              height={14}
                              className="size-3.5"
                            />
                            <Image
                              src={getNetworkImageUrl(entry.network, isDark)}
                              alt={entry.network.chain.name}
                              width={8}
                              height={8}
                              className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full"
                            />
                          </div>
                          <span className="font-medium dark:text-white/80">
                            {isCNGN ? rawBalance : balance} {token}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}

      </div>
    ) : (
      <TransactionList onSelectTransaction={(tx) => onSelectTransaction?.(tx)} />
    );

  return (
    <div className="mb-[1.5rem] flex min-h-0 flex-1 flex-col">
      <div className="flex-shrink-0 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-body dark:text-white">
            Wallet
          </h2>
          <div className="flex items-center">
            {!isInjectedWallet && (
              <button
                type="button"
                title="Refresh balance"
                onClick={onRefreshBalance}
                disabled={isLoading}
                className="rounded-lg p-2 hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-white/10"
              >
                <RefreshIcon
                  className={`size-5 text-outline-gray dark:text-white/50 ${isLoading || isRefreshing ? "animate-spin" : ""}`}
                />
              </button>
            )}
            <button
              type="button"
              title="Settings"
              onClick={onSettings}
              className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10"
            >
              <Setting07Icon className="size-5 text-outline-gray dark:text-white/50" />
            </button>
            <button
              type="button"
              title="Close"
              onClick={onClose}
              className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10"
            >
              <Cancel01Icon className="size-5 text-outline-gray dark:text-white/50" />
            </button>
          </div>
        </div>

        {smartWallet?.address ? (
          <div className="space-y-4 rounded-[20px] border border-border-light p-4 dark:border-white/10">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Wallet01Icon className="size-5 text-outline-gray dark:text-white/50" />
                <span className="text-sm font-medium text-text-body dark:text-white/80">
                  {shortenAddress(smartWallet.address, 8)}
                </span>
              </div>
              <button
                type="button"
                title="Copy wallet address"
                onClick={handleCopyInCard}
                className="rounded-lg p-2 hover:bg-accent-gray dark:hover:bg-white/10"
              >
                {isAddressCopied ? (
                  <PiCheck className="size-4 text-green-500" />
                ) : (
                  <Copy01Icon className="size-4 text-outline-gray dark:text-white/50" />
                )}
              </button>
            </div>

            <p className="text-[1.75rem] font-medium leading-9 text-text-body dark:text-white">
              {showBalanceSkeleton ? (
                <span className="inline-block h-9 w-28 animate-pulse rounded bg-accent-gray dark:bg-white/10" />
              ) : (
                `$${walletBalanceUsd.toFixed(2)}`
              )}
            </p>

            {!isInjectedWallet && !showBalanceSkeleton && (
              <div
                className={classNames(
                  "grid gap-3",
                  showEarnUi ? "grid-cols-3" : "grid-cols-2",
                )}
              >
                <button type="button" onClick={onTransfer} className={actionButtonClass}>
                  Transfer
                </button>
                <button type="button" onClick={onFund} className={actionButtonClass}>
                  Fund
                </button>
                {showEarnUi && (
                  <button
                    type="button"
                    title="Earn yield on USDC via Vesu"
                    onClick={onEarn}
                    className={actionButtonClass}
                  >
                    Earn
                  </button>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>

      <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto">
        {!isInjectedWallet && (
          <div className="mt-4">
            <ReferralCTA onViewReferrals={onViewReferrals ?? (() => {})} />
          </div>
        )}

        {tabBar}

        <div className="pb-16 pt-2">{balancesContent}</div>
      </div>
    </div>
  );
};
