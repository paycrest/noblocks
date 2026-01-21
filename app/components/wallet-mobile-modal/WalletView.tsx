import React from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { PiCheck } from "react-icons/pi";
import {
  Clock01Icon,
  Setting07Icon,
  Cancel01Icon,
  Wallet01Icon,
  ArrowDown01Icon,
  RefreshIcon,
} from "hugeicons-react";
import { BalanceCardSkeleton } from "../BalanceSkeleton";
import { classNames, getNetworkImageUrl } from "../../utils";
import { ReferralCTA } from "../ReferralCTA";

// Types for props
interface WalletViewProps {
  isInjectedWallet: boolean;
  detectWalletProvider: () => string;
  isLoading: boolean;
  activeBalance: any;
  getTokenImageUrl: (tokenName: string) => string | undefined;
  onTransfer: () => void;
  onFund: () => void;
  smartWallet: any;
  handleCopyAddress: () => void;
  isNetworkListOpen: boolean;
  setIsNetworkListOpen: (open: boolean) => void;
  networks: any[];
  selectedNetwork: any;
  isDark: boolean;
  handleNetworkSwitchWrapper: (network: any) => void;
  onSettings: () => void;
  onClose: () => void;
  onHistory: () => void;
  setSelectedNetwork: (network: any) => void;
  onRefreshBalance: () => void;
  onViewReferrals?: () => void;
}

export const WalletView: React.FC<WalletViewProps> = ({
  isInjectedWallet,
  detectWalletProvider,
  isLoading,
  activeBalance,
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
  onViewReferrals,
}) => {
  return (
    <div className="mb-[1.5rem] space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-body dark:text-white">
          Wallet
        </h2>
        <div className="flex items-center">
          <button
            type="button"
            title="Transactions"
            onClick={onHistory}
            className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10"
          >
            <Clock01Icon className="size-5 text-outline-gray dark:text-white/50" />
          </button>
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

      {/* Smart Wallet Container */}
      <div className="space-y-3 rounded-[20px] border border-border-light bg-transparent p-3 dark:border-white/10">
        <div className="flex items-center justify-between">
          <h3 className="font-light text-text-secondary dark:text-white/50">
            {isInjectedWallet ? detectWalletProvider() : "Noblocks Wallet"}
          </h3>
          <button
            type="button"
            onClick={onRefreshBalance}
            title="Refresh balance"
            disabled={isLoading}
            className="rounded-lg p-1.5 transition-colors hover:bg-accent-gray disabled:opacity-50 dark:hover:bg-white/10"
          >
            <RefreshIcon
              className={`size-4 text-outline-gray dark:text-white/50 ${isLoading ? "animate-spin" : ""}`}
            />
          </button>
        </div>

        <div className="space-y-2">
          {isLoading ? (
            <BalanceCardSkeleton />
          ) : (
            (
              Object.entries(activeBalance?.balances || {}) as [
                string,
                string | number,
              ][]
            ).map(([token, balance]) => (
              <div key={token} className="flex items-center gap-1">
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
                <span className="font-medium dark:text-white/80">
                  {balance} {token}
                </span>
              </div>
            ))
          )}
        </div>

        {!isInjectedWallet && !isLoading && (
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={onTransfer}
              className="min-h-11 w-full rounded-xl bg-accent-gray py-2 text-sm font-medium text-gray-900 dark:bg-white/5 dark:text-white"
            >
              Transfer
            </button>
            <button
              type="button"
              onClick={onFund}
              className="min-h-11 w-full rounded-xl bg-accent-gray py-2 text-sm font-medium text-gray-900 dark:bg-white/5 dark:text-white"
            >
              Fund
            </button>
          </div>
        )}
      </div>

      {/* Wallet Address Container */}
      {smartWallet?.address && (
        <div className="space-y-3 rounded-[20px] border border-border-light bg-transparent p-3 dark:border-white/10">
          <div className="flex items-center gap-2">
            <Wallet01Icon className="size-4 text-outline-gray dark:text-white/50" />
            <span className="text-sm text-text-secondary dark:text-white/50">
              Wallet Address
            </span>
          </div>

          <span className="block break-words text-sm font-medium dark:text-white/80">
            {smartWallet?.address ?? ""}
          </span>

          <button
            type="button"
            onClick={handleCopyAddress}
            className="min-h-11 w-full rounded-xl bg-accent-gray py-2 text-sm font-medium text-gray-900 dark:bg-white/5 dark:text-white"
          >
            <span>Copy</span>
          </button>
        </div>
      )}

      {/* Network List Container */}
      <div
        className={classNames(
          "space-y-3 rounded-[16px] py-3 border border-border-light px-4 dark:border-white/10",
        )}
      >
        <div
          className="flex cursor-pointer items-center justify-between"
          onClick={() => setIsNetworkListOpen(!isNetworkListOpen)}
        >
          <div
            className={classNames(
              "flex items-center",
              isNetworkListOpen ? "gap-3" : "gap-1",
            )}
          >
            <AnimatePresence mode="wait">
              <motion.span
                key={isNetworkListOpen ? "select" : "network"}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className={classNames(
                  "font-medium text-text-body",
                  isNetworkListOpen
                    ? "text-base dark:text-white"
                    : "dark:text-white/80",
                )}
              >
                {isNetworkListOpen ? "Select network" : "Network"}
              </motion.span>
            </AnimatePresence>
          </div>
          <AnimatePresence mode="wait">
            {!isNetworkListOpen && (
              <motion.div
                initial={{ x: -10, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -10, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-2"
              >
                <Image
                  src={getNetworkImageUrl(selectedNetwork, isDark)}
                  alt={selectedNetwork.chain.name}
                  width={16}
                  height={16}
                  className="size-4 rounded-full"
                />
                <span className="text-text-body dark:text-white">
                  {selectedNetwork.chain.name}
                </span>
                <ArrowDown01Icon className="size-4 text-outline-gray transition-transform dark:text-white/50" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {isNetworkListOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="space-y-2 overflow-hidden *:min-h-11"
            >
              {networks
                .filter(
                  (network) =>
                    isInjectedWallet || network.chain.name !== "Celo",
                )
                .map((network) => (
                  <button
                    type="button"
                    key={network.chain.name}
                    onClick={() => handleNetworkSwitchWrapper(network)}
                    className="flex w-full items-center justify-between"
                  >
                    <div className="flex items-center gap-2 py-2.5">
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
      {!isInjectedWallet && (
        <ReferralCTA
          onViewReferrals={onViewReferrals ?? (() => { })}
        />
      )}
    </div>
  );
};
