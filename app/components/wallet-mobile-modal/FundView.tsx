import React from "react";
import { motion } from "framer-motion";
import { ArrowLeft02Icon, Cancel01Icon } from "hugeicons-react";
import { primaryBtnClasses } from "../Styles";
import { FormDropdown } from "../FormDropdown";
import { AnimatedComponent, slideInOut } from "../AnimatedComponents";
import {
  classNames,
  fetchSupportedTokens,
  getNetworkImageUrl,
} from "../../utils";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { useState, useEffect } from "react";
import { Token, Network } from "../../types";

interface FundViewProps {
  setCurrentView: (
    v: React.SetStateAction<
      "wallet" | "settings" | "transfer" | "fund" | "history"
    >,
  ) => void;
  refreshBalance: () => void;
  client: any;
  selectedNetwork: Network;
  smartWalletBalance: any;
  handleFundWalletClick: (
    amount: string,
    tokenAddress: `0x${string}`,
    onComplete?: (success: boolean) => void,
  ) => Promise<void>;
  isDark: boolean;
  onClose: () => void;
}

export const FundView: React.FC<FundViewProps> = ({
  setCurrentView,
  refreshBalance,
  selectedNetwork,
  handleFundWalletClick,
  isDark,
  onClose,
}) => {
  const [fundingInProgress, setFundingInProgress] = useState(false);
  const [isFundConfirming, setIsFundConfirming] = useState(false);
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
  const { token: fundToken, amount: fundAmount } = watchFund();
  const fundTokens: Token[] =
    fetchSupportedTokens(selectedNetwork.chain.name) || [];
  const fundTokenOptions = fundTokens.map((token) => ({
    name: token.symbol,
    imageUrl: token.imageUrl,
  }));

  const handleFund = async (data: { amount: number; token: string }) => {
    try {
      setIsFundConfirming(true);
      const tokenAddress = fundTokens.find(
        (t) => t.symbol.toUpperCase() === data.token,
      )?.address as `0x${string}`;
      setFundingInProgress(true);
      await handleFundWalletClick(
        data.amount.toString(),
        tokenAddress ?? ("" as `0x${string}`),
        (success) => {
          setFundingInProgress(false);
          setIsFundConfirming(false);
          if (success) {
            resetFund();
            onClose();
            refreshBalance();
          }
        },
      );
    } catch (e: any) {
      setFundingInProgress(false);
      setIsFundConfirming(false);
    }
  };
  const handleFundModalClose = () => {
    if (!fundingInProgress) {
      resetFund();
      setCurrentView("wallet");
    } else {
      if (confirm("Are you sure you want to cancel the funding process?")) {
        setFundingInProgress(false);
        resetFund();
        setCurrentView("wallet");
      }
    }
  };
  useEffect(() => {
    if (!fundToken) {
      setFundValue(
        "token",
        selectedNetwork.chain.name === "Base" ? "USDC" : "USDT",
      );
    }
  }, [fundToken, selectedNetwork.chain.name, setFundValue]);

  return (
    <div className="space-y-6">
      {fundingInProgress ? (
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
      ) : (
        <form onSubmit={handleFundSubmit(handleFund)} className="space-y-4">
          <div className="flex items-center justify-between">
            <button
              type="button"
              aria-label="Close fund modal"
              onClick={handleFundModalClose}
              className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10 sm:hidden"
            >
              <ArrowLeft02Icon className="size-5 text-outline-gray dark:text-white/50" />
            </button>
            <h2 className="text-lg font-semibold text-text-body dark:text-white sm:flex-1">
              Fund wallet
            </h2>
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
          <motion.div
            layout
            className="grid gap-3.5 rounded-[20px] border border-border-light px-4 py-3 dark:border-white/10"
          >
            <label
              htmlFor="amount"
              className="text-text-secondary dark:text-white/50"
            >
              Amount
            </label>
            <div className="flex items-center justify-between gap-2">
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
                className={`w-full rounded-xl border-b border-transparent bg-transparent py-2 text-2xl outline-none transition-all placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed dark:placeholder:text-white/30 ${fundErrors.amount ? "text-red-500 dark:text-red-500" : "text-neutral-900 dark:text-white/80"}`}
                placeholder="0"
                title="Enter amount to fund"
              />
              <FormDropdown
                defaultTitle="Select token"
                data={fundTokenOptions}
                defaultSelectedItem={fundToken}
                onSelect={(selectedToken: string) =>
                  setFundValue("token", selectedToken)
                }
                className="min-w-44"
              />
            </div>
            {fundErrors.amount && (
              <AnimatedComponent
                variant={slideInOut}
                className="text-xs text-red-500"
              >
                {fundErrors.amount.message}
              </AnimatedComponent>
            )}
          </motion.div>
          <div className="flex w-full items-center justify-between rounded-xl bg-accent-gray px-4 py-2.5 dark:bg-white/5">
            <p className="text-text-secondary dark:text-white/50">Network</p>
            <div className="flex items-center gap-2">
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
            </div>
          </div>
          <button
            type="submit"
            className={classNames(primaryBtnClasses, "w-full")}
            disabled={!isFundValid || !isFundDirty || isFundConfirming}
          >
            {isFundConfirming ? "Loading..." : "Choose funding method"}
          </button>
        </form>
      )}
    </div>
  );
};
