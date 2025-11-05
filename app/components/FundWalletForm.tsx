"use client";
import React, { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { useNetwork } from "../context/NetworksContext";
import { useBalance, useTokens } from "../context";
import { classNames, getNetworkImageUrl, shouldUseInjectedWallet } from "../utils";
import { useSearchParams } from "next/navigation";
import { FormDropdown } from "./FormDropdown";
import { AnimatedComponent, slideInOut } from "./AnimatedComponents";
import { useFundWalletHandler } from "../hooks/useFundWalletHandler";
import { useActualTheme } from "../hooks/useActualTheme";
import { networks } from "../mocks";
import { toast } from "sonner";
import {
  ArrowLeft02Icon,
  Cancel01Icon,
  ArrowDown01Icon,
  InformationSquareIcon,
} from "hugeicons-react";
import { usePrivy } from "@privy-io/react-auth";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { Token } from "../types";
import Image from "next/image";

type MobileView = "wallet" | "settings" | "transfer" | "fund" | "history";

export const FundWalletForm: React.FC<{
  onClose: () => void;
  onSuccess?: () => void;
  showBackButton?: boolean;
  setCurrentView?: React.Dispatch<React.SetStateAction<MobileView>>;
}> = ({ onClose, onSuccess, showBackButton = false, setCurrentView }) => {
  const searchParams = useSearchParams();
  const { selectedNetwork, setSelectedNetwork } = useNetwork();
  const { refreshBalance } = useBalance();
  const { allTokens } = useTokens();
  const { handleFundWallet } = useFundWalletHandler("Fund wallet form");
  const { user } = usePrivy();
  const useInjectedWallet = shouldUseInjectedWallet(searchParams);
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
  // Filter out Celo and Hedera Mainnet for non-injected wallets (smart wallets)
  const availableNetworks = networks
    .filter((network) => {
      if (useInjectedWallet) return true;
      return network.chain.name !== "Celo" && network.chain.name !== "Hedera Mainnet";
    })
    .map((network) => ({
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
      if (!data.token) {
        setIsFundConfirming(false);
        toast.error("Please select a currency");
        return;
     }
      const tokenAddress = fundTokens.find(
        (t: Token) => t.symbol.toUpperCase() === data.token,
      )?.address as `0x${string}`;

      if (!tokenAddress) {
        setIsFundConfirming(false);
        toast.error("Selected token is not available on this network");
        return;
      }
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
      <div className="flex items-center justify-between gap-4 bg-white dark:bg-surface-overlay">
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
        <div className="w-10 sm:hidden" />
      </div>
      {/* Amount field */}
      <div className="w-full max-w-full space-y-2">
        <div className="relative w-full flex flex-col justify-between rounded-2xl border border-border-input dark:border-white/10 dark:bg-black2 min-h-[94px] px-4 py-2">
        <label
          htmlFor="amount"
          className="text-sm font-light text-text-secondary dark:text-white/70"
        >
          Amount
        </label>
        <div className="flex items-center justify-between gap-2 w-full">
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
            className={`w-full py-2 bg-transparent text-3xl font-medium outline-none transition-all placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed dark:placeholder:text-white/30 ${
              fundErrors.amount
                ? "text-red-500 dark:text-red-500"
                : "text-neutral-900 dark:text-white"
            }`}
            placeholder="0"
            title="Enter amount to fund"
          />
          <FormDropdown
            defaultTitle="Select currency"
            data={fundTokenOptions}
            defaultSelectedItem={fundToken}
            isCTA={false}
            onSelect={(selectedToken: string) =>
              setFundValue("token", selectedToken)
            }
            className="min-w-32"
            dropdownWidth={192}
          />
        </div>
                </div>
        {fundErrors.amount && (
            <AnimatedComponent
              variant={slideInOut}
              className="relative left-2 text-xs text-red-500"
            >
              {fundErrors.amount.message}
            </AnimatedComponent>
          )}
      </div>

      {/* Network field */}
      <div className="w-full max-w-full space-y-2 rounded-2xl p-4 dark:bg-black2 border-[0.3px] border-border-light dark:border-white/0">
        <label
          htmlFor="network"
          className="text-sm font-medium text-black dark:text-white/70"
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
              <Image
                src={getNetworkImageUrl(
                  networks.find(
                    (n) => n.chain.name === selectedNetwork.chain.name,
                  ) || networks[0],
                  isDark,
                )}
                alt={selectedNetwork.chain.name}
                width={24}
                height={24}
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
              className={`absolute right-3 top-[45%] size-4 -translate-y-1/2 text-outline-gray transition-transform dark:text-white/50 ${
                isNetworkDropdownOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {/* Dropdown Menu */}
          {isNetworkDropdownOpen && (
            <div
              id="network-listbox"
              role="listbox"
              className="scrollbar-hide absolute left-0 right-0 top-full z-50 mt-1 max-h-[144px] w-full overflow-y-scroll overflow-x-hidden rounded-xl border border-border-input bg-white shadow-lg dark:border-white/20 dark:bg-neutral-800"
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
                  <Image
                    src={network.imageUrl}
                    alt={network.name}
                    className="h-6 w-6 rounded-full"
                    width={24}
                    height={24}
                  />
                  <span className="truncate text-sm font-medium text-neutral-900 dark:text-white">
                    {network.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Warning note */}
        <div className="h-[48px] w-full bg-warning-background/[8%] dark:bg-warning-background/[8%] px-3 py-2 rounded-xl mb-4 flex items-start justify-start gap-0.5">
          <InformationSquareIcon className="text-warning-foreground dark:text-warning-text w-[24px] h-[24px] mr-1 -mt-0.5" />
          <p className="text-xs font-light text-warning-foreground dark:text-warning-text leading-tight text-wrap break-words">
            Only send funds to the supported networks, sending to an unlisted network will lead to loss of funds
          </p>
        </div>
      </div>

      {/* Deposit information */}
        <div className="flex flex-wrap text-wrap break-words items-center gap-1 text-xs text-text-secondary dark:text-white/50 p-2 rounded-lg border-[0.3px] border-border-light dark:border-white/10">
          <span>You are depositing this amount via</span>
          <Image
            src={getNetworkImageUrl(
              networks.find(
                (n) => n.chain.name === selectedNetwork.chain.name,
              ) || networks[0],
              isDark,
            )}
            alt={selectedNetwork.chain.name}
            width={16}
            height={16}
            className="h-4 w-4 flex-shrink-0 rounded-full"
          />
          <span className="font-light text-text-secondary dark:text-white/70">
            {selectedNetwork.chain.name} network
          </span>
        </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleFundModalClose}
          className="min-h-12 rounded-2xl bg-gray-100 text-text-body dark:bg-white/10 dark:text-white px-6 py-3 text-sm font-semibold transition-all hover:bg-gray-200 dark:hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-lavender-500 focus:ring-offset-2 disabled:cursor-not-allowed dark:focus:ring-offset-neutral-900"
        >
          Cancel
        </button>
        <button
          type="submit"
          className={classNames(
            "min-h-12 flex-1 rounded-2xl px-4 py-3 text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-lavender-500 focus:ring-offset-2 disabled:cursor-not-allowed dark:focus:ring-offset-neutral-900",
            !isFundValid || !isFundDirty || isFundConfirming || !fundToken
              ? "bg-gray-300 text-white dark:bg-white/10 dark:text-white/50"
              : "bg-lavender-500 text-primary hover:bg-lavender-500 dark:hover:bg-lavender-500",
          )}
          disabled={!isFundValid || !isFundDirty || isFundConfirming || !fundToken}
        >
          {isFundConfirming ? "Loading..." : "Continue"}
        </button>
      </div>
    </form>
  );
};
