"use client";
import React, { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { useNetwork } from "../context/NetworksContext";
import { useBalance, useTokens } from "../context";
import { classNames, getNetworkImageUrl } from "../utils";
import { primaryBtnClasses } from "./Styles";
import { FormDropdown } from "./FormDropdown";
import { AnimatedComponent, slideInOut } from "./AnimatedComponents";
import { useFundWalletHandler } from "../hooks/useFundWalletHandler";
import { useActualTheme } from "../hooks/useActualTheme";
import Image from "next/image";
import { networks } from "../mocks";
import { toast } from "sonner";
import {
  ArrowLeft02Icon,
  Cancel01Icon,
  ArrowDown01Icon,
} from "hugeicons-react";
import { usePrivy } from "@privy-io/react-auth";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { Token } from "../types";

type MobileView = "wallet" | "settings" | "transfer" | "fund" | "history";

export const FundWalletForm: React.FC<{
  onClose: () => void;
  onSuccess?: () => void;
  showBackButton?: boolean;
  setCurrentView?: React.Dispatch<React.SetStateAction<MobileView>>;
}> = ({ onClose, onSuccess, showBackButton = false, setCurrentView }) => {
  const { selectedNetwork, setSelectedNetwork } = useNetwork();
  const { refreshBalance } = useBalance();
  const { allTokens } = useTokens();
  const { handleFundWallet } = useFundWalletHandler("Fund wallet form");
  const { user } = usePrivy();
  const isDark = useActualTheme();

  const [fundingInProgress, setFundingInProgress] = useState(false);
  const [isFundConfirming, setIsFundConfirming] = useState(false);

  // State for network dropdown
  const [isNetworkDropdownOpen, setIsNetworkDropdownOpen] = useState(false);
  const networkDropdownRef = useRef<HTMLDivElement>(null);

  const fundForm = useForm<{ amount: number; token: string }>({
    mode: "onChange",
  });
  const {
    handleSubmit: handleFundSubmit,
    register: registerFund,
    setValue: setFundValue,
    watch: watchFund,
    reset: resetFund,
    formState: {
      errors: fundErrors,
      isValid: isFundValid,
      isDirty: isFundDirty,
    },
  } = fundForm;
  const { token: fundToken } = watchFund();
  const fundTokens = allTokens[selectedNetwork.chain.name] || [];
  const fundTokenOptions = fundTokens.map((token: Token) => ({
    name: token.symbol,
    imageUrl: token.imageUrl,
  }));

  // Networks for network selection
  const availableNetworks = networks.map((network) => ({
    name: network.chain.name,
    imageUrl: getNetworkImageUrl(network, isDark),
  }));

  useEffect(() => {
    if (!fundToken) {
      setFundValue(
        "token",
        selectedNetwork.chain.name === "Base" ? "USDC" : "USDT",
      );
    }
  }, [fundToken, selectedNetwork.chain.name, setFundValue]);

  // Close dropdown when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        networkDropdownRef.current &&
        !networkDropdownRef.current.contains(event.target as Node)
      ) {
        setIsNetworkDropdownOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isNetworkDropdownOpen) {
        setIsNetworkDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isNetworkDropdownOpen]);

  const handleFund = async (data: { amount: number; token: string }) => {
    try {
      setIsFundConfirming(true);
      const tokenAddress = fundTokens.find(
        (t: Token) => t.symbol.toUpperCase() === data.token,
      )?.address as `0x${string}`;
      const smartWalletAccount = user?.linkedAccounts?.find(
        (account) => account.type === "smart_wallet",
      );
      const walletAddress = smartWalletAccount?.address ?? "";
      setFundingInProgress(true);
      await handleFundWallet(
        walletAddress,
        data.amount.toString(),
        tokenAddress ?? ("" as `0x${string}`),
        (success) => {
          setFundingInProgress(false);
          setIsFundConfirming(false);
          if (success) {
            resetFund();
            if (onSuccess) onSuccess();
            onClose();
            refreshBalance();
            toast.success("Wallet funded successfully");
          } else {
            toast.error("Funding was not completed");
          }
        },
      );
    } catch (e: any) {
      setFundingInProgress(false);
      setIsFundConfirming(false);
      toast.error("Funding failed");
    }
  };

  const handleFundModalClose = () => {
    if (!fundingInProgress) {
      resetFund();
      if (setCurrentView && showBackButton) {
        setCurrentView("wallet");
      } else {
        onClose();
      }
    } else {
      if (confirm("Are you sure you want to cancel the funding process?")) {
        setFundingInProgress(false);
        resetFund();
        if (setCurrentView && showBackButton) {
          setCurrentView("wallet");
        } else {
          onClose();
        }
      }
    }
  };

  if (fundingInProgress) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 py-6">
        <div className="absolute right-4 top-4">
          <button
            type="button"
            aria-label="Cancel funding"
            onClick={handleFundModalClose}
            className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10"
          >
            <Cancel01Icon className="size-5 text-outline-gray dark:text-white/50" />
          </button>
        </div>
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-lavender-500 border-t-transparent"></div>
        <p className="text-center text-text-body dark:text-white/80">
          Please complete the funding process.
        </p>
        <p className="text-center text-sm text-text-secondary dark:text-white/50">
          This window will automatically close when the process is complete.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleFundSubmit(handleFund)} className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        {showBackButton && setCurrentView ? (
          <button
            type="button"
            title="Go back"
            onClick={handleFundModalClose}
            className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10 sm:hidden"
          >
            <ArrowLeft02Icon className="size-5 text-outline-gray dark:text-white/50" />
          </button>
        ) : null}
        <div className="sm:flex-1">
          <h2 className="text-xl font-semibold text-text-body dark:text-white">
            Fund wallet
          </h2>
          <p className="text-sm text-text-secondary dark:text-white/50">
            Deposit tokens into your smart wallet
          </p>
        </div>
        <button
          type="button"
          aria-label="Close fund modal"
          onClick={handleFundModalClose}
          className="hidden rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10 sm:block"
        >
          <Cancel01Icon className="size-5 text-outline-gray dark:text-white/50" />
        </button>
        <div className="w-10 sm:hidden" />
      </div>
      {/* Amount field */}
      <div className="w-full max-w-full space-y-2">
        <div className="relative w-full rounded-lg border border-border-input dark:border-white/20 dark:bg-black2 sm:h-[94px]">
          <label
            htmlFor="amount"
            className="absolute left-4 top-3 text-sm font-medium text-text-secondary dark:text-white/70"
          >
            Amount
          </label>
          <input
            id="amount"
            type="number"
            step="0.0001"
            {...registerFund("amount", {
              required: { value: true, message: "Amount is required" },
              min: { value: 0.0001, message: `Min. amount is 0.0001` },
              pattern: {
                value: /^\d+(\.\d{1,4})?$/,
                message: "Invalid amount",
              },
            })}
            className={`absolute bottom-3 left-4 right-20 bg-transparent text-3xl font-medium outline-none transition-all placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed dark:placeholder:text-white/30 ${
              fundErrors.amount
                ? "text-red-500 dark:text-red-500"
                : "text-neutral-900 dark:text-white"
            }`}
            placeholder="0"
            title="Enter amount to fund"
          />

          <div className="absolute bottom-3 right-4">
            <FormDropdown
              defaultTitle="Select currency"
              data={fundTokenOptions}
              defaultSelectedItem={fundToken}
              onSelect={(selectedToken: string) =>
                setFundValue("token", selectedToken)
              }
              className="min-w-44"
              dropdownWidth={192}
            />
          </div>

          {fundErrors.amount && (
            <AnimatedComponent
              variant={slideInOut}
              className="absolute -bottom-6 left-0 text-xs text-red-500"
            >
              {fundErrors.amount.message}
            </AnimatedComponent>
          )}
        </div>
      </div>

      {/* Network field */}
      <div className="w-full max-w-full space-y-2 rounded-lg p-4 dark:bg-black2">
        <label
          htmlFor="network"
          className="text-sm font-medium text-text-secondary dark:text-white/70"
        >
          Network
        </label>
        <div className="relative w-full" ref={networkDropdownRef}>
          <button
            type="button"
            onClick={() => setIsNetworkDropdownOpen(!isNetworkDropdownOpen)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setIsNetworkDropdownOpen(!isNetworkDropdownOpen);
              }
            }}
            className="mb-2 min-h-12 w-full rounded-xl border border-border-input bg-transparent px-4 py-3 text-left text-sm transition-all focus-within:border-gray-400 focus:outline-none disabled:cursor-not-allowed dark:border-white/20 dark:bg-transparent dark:focus-within:border-white/40"
            aria-haspopup="listbox"
            aria-expanded={isNetworkDropdownOpen}
            aria-controls="network-listbox"
          >
            <div className="flex items-center gap-3">
              <img
                src={getNetworkImageUrl(
                  networks.find(
                    (n) => n.chain.name === selectedNetwork.chain.name,
                  ) || networks[0],
                  isDark,
                )}
                alt={selectedNetwork.chain.name}
                className="h-6 w-6 rounded-full"
              />
              <span
                className={
                  selectedNetwork.chain.name
                    ? "text-neutral-900 dark:text-white"
                    : "text-gray-400 dark:text-white/30"
                }
              >
                {selectedNetwork.chain.name || "Select network"}
              </span>
            </div>
            <ArrowDown01Icon
              className={`absolute right-3 top-1/2 size-4 -translate-y-1/2 text-outline-gray transition-transform dark:text-white/50 ${
                isNetworkDropdownOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {/* Dropdown Menu */}
          {isNetworkDropdownOpen && (
            <div
              id="network-listbox"
              role="listbox"
              className="scrollbar-hide absolute left-0 right-0 top-full z-50 mt-1 max-h-60 w-full overflow-y-auto overflow-x-hidden rounded-xl border border-border-input bg-white shadow-lg dark:border-white/20 dark:bg-neutral-800"
            >
              {availableNetworks.map((network) => (
                <button
                  key={network.name}
                  type="button"
                  role="option"
                  aria-selected={selectedNetwork.chain.name === network.name}
                  onClick={() => {
                    const networkObj = networks.find(
                      (n) => n.chain.name === network.name,
                    );
                    if (networkObj) {
                      setSelectedNetwork(networkObj);
                    }
                    setIsNetworkDropdownOpen(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      const networkObj = networks.find(
                        (n) => n.chain.name === network.name,
                      );
                      if (networkObj) {
                        setSelectedNetwork(networkObj);
                      }
                      setIsNetworkDropdownOpen(false);
                    }
                  }}
                  className="flex w-full min-w-0 items-center gap-3 px-4 py-3 text-left transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-gray-50 focus:bg-gray-50 dark:hover:bg-white/5 dark:focus:bg-white/5"
                >
                  <img
                    src={network.imageUrl}
                    alt={network.name}
                    className="h-6 w-6 rounded-full"
                  />
                  <span className="truncate text-sm font-medium text-neutral-900 dark:text-white">
                    {network.name}
                  </span>
                  {selectedNetwork.chain.name === network.name && (
                    <div className="ml-auto h-2 w-2 rounded-full bg-lavender-500"></div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Network warning */}
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-900/10">
          <div className="flex items-start gap-2">
            <div className="flex-shrink-0">
              <Image
                src="/images/information-square.png"
                alt="information square"
                width={16}
                height={16}
              />
            </div>
            <p className="text-xs text-yellow-800 dark:text-yellow-200">
              Only send funds to the selected network, sending to a different
              network will lead to loss of funds.
            </p>
          </div>
        </div>
      </div>

      {/* Deposit information */}
      <div className="rounded-lg bg-gray-100 px-4 py-3 dark:bg-gray-800">
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-white/50">
          <span>You are depositing this amount via</span>
          <img
            src={getNetworkImageUrl(
              networks.find(
                (n) => n.chain.name === selectedNetwork.chain.name,
              ) || networks[0],
              isDark,
            )}
            alt={selectedNetwork.chain.name}
            className="h-4 w-4 flex-shrink-0 rounded-full"
          />
          <span className="font-medium text-gray-600 dark:text-white/70">
            {selectedNetwork.chain.name} network
          </span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleFundModalClose}
          className="min-h-12 rounded-xl bg-gray-700 px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-lavender-500 focus:ring-offset-2 disabled:cursor-not-allowed dark:focus:ring-offset-neutral-900"
        >
          Cancel
        </button>
        <button
          type="submit"
          className={classNames(
            "min-h-12 flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-lavender-500 focus:ring-offset-2 disabled:cursor-not-allowed dark:focus:ring-offset-neutral-900",
            !isFundValid || !isFundDirty || isFundConfirming
              ? "bg-gray-300 text-gray-500 dark:bg-white/10 dark:text-white/50"
              : "bg-lavender-500 text-gray-300 hover:bg-lavender-500 dark:hover:bg-lavender-500",
          )}
          disabled={!isFundValid || !isFundDirty || isFundConfirming}
        >
          {isFundConfirming ? "Loading..." : "Continue"}
        </button>
      </div>
    </form>
  );
};
