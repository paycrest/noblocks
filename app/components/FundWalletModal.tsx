"use client";
import { useForm } from "react-hook-form";
import { useEffect, useState } from "react";
import Image from "next/image";
import { ArrowLeft02Icon, Cancel01Icon } from "hugeicons-react";
import { AnimatedModal } from "./AnimatedComponents";
import { useNetwork } from "../context/NetworksContext";
import { FormDropdown } from "./FormDropdown";
import { primaryBtnClasses } from "./Styles";
import { classNames, fetchSupportedTokens } from "../utils";
import { trackEvent } from "../hooks/analytics";
import type { Token } from "../types";

type FundFormData = {
  amount: number;
  token: string;
};

type FundWalletModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onFund: (
    amount: string,
    tokenAddress: `0x${string}`,
    onComplete?: (success: boolean) => void,
  ) => Promise<void>;
};

export const FundWalletModal = ({
  isOpen,
  onClose,
  onFund,
}: FundWalletModalProps) => {
  const { selectedNetwork } = useNetwork();
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [fundingInProgress, setFundingInProgress] = useState<boolean>(false);

  const formMethods = useForm<FundFormData>({ mode: "onChange" });
  const {
    handleSubmit,
    register,
    setValue,
    watch,
    reset,
    formState: { errors, isValid, isDirty },
  } = formMethods;
  const { token, amount } = watch();

  const tokens = [];
  const fetchedTokens: Token[] =
    fetchSupportedTokens(selectedNetwork.chain.name) || [];

  for (const token of fetchedTokens) {
    tokens.push({
      name: token.symbol,
      imageUrl: token.imageUrl,
    });
  }

  const handleFund = async (data: FundFormData) => {
    try {
      setIsConfirming(true);
      const tokenAddress = fetchedTokens.find(
        (t) => t.symbol.toUpperCase() === data.token,
      )?.address as `0x${string}`;

      trackEvent("Funding started", {
        "Entry point": "Fund modal",
        Amount: data.amount,
        Network: selectedNetwork.chain.name,
        Token: data.token,
      });

      // Show funding in progress state
      setFundingInProgress(true);

      // Pass a callback to onFund to handle completion
      await onFund(data.amount.toString(), tokenAddress, (success) => {
        setFundingInProgress(false);
        setIsConfirming(false);
        if (success) {
          reset();
          onClose();
        }
      });
    } catch (error) {
      console.error("Fund error:", error);
      setFundingInProgress(false);
      setIsConfirming(false);
    }
  };

  const handleModalClose = () => {
    if (!fundingInProgress) {
      reset();
      onClose();
    } else {
      if (confirm("Are you sure you want to cancel the funding process?")) {
        setFundingInProgress(false);
        reset();
        onClose();
      }
    }
  };

  useEffect(() => {
    if (!token) {
      setValue(
        "token",
        selectedNetwork.chain.name === "Base" ? "USDC" : "USDT",
      );
    }
  }, [token, selectedNetwork.chain.name, setValue]);

  return (
    <AnimatedModal isOpen={isOpen} onClose={handleModalClose}>
      {fundingInProgress ? (
        <div className="flex flex-col items-center justify-center space-y-4 py-6">
          <div className="absolute right-4 top-4">
            <button
              type="button"
              aria-label="Cancel funding"
              onClick={handleModalClose}
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
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <button
              type="button"
              aria-label="Close fund modal"
              onClick={fundingInProgress ? undefined : handleModalClose}
              disabled={fundingInProgress}
              className={`rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10 max-sm:-ml-2 sm:hidden ${
                fundingInProgress ? "cursor-not-allowed opacity-50" : ""
              }`}
            >
              <ArrowLeft02Icon className="size-5 text-outline-gray dark:text-white/50" />
            </button>
            <h2 className="text-lg font-semibold text-text-body dark:text-white sm:flex-1">
              {fundingInProgress ? "Funding Wallet..." : "Fund wallet"}
            </h2>
            <button
              type="button"
              aria-label="Close fund modal"
              onClick={fundingInProgress ? undefined : handleModalClose}
              disabled={fundingInProgress}
              className={`hidden rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10 sm:block ${
                fundingInProgress ? "cursor-not-allowed opacity-50" : ""
              }`}
            >
              <Cancel01Icon className="size-5 text-outline-gray dark:text-white/50" />
            </button>
            <div className="w-10 sm:hidden" />
          </div>
          <form
            onSubmit={handleSubmit(handleFund)}
            className="z-50 space-y-4 text-neutral-900 transition-all *:text-sm dark:text-white"
            noValidate
          >
            <div className="grid gap-3.5 rounded-[20px] border border-border-light px-4 py-3 dark:border-white/10">
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
                  {...register("amount", {
                    required: {
                      value: true,
                      message: "Amount is required",
                    },
                    min: {
                      value: 0.0001,
                      message: `Min. amount is 0.0001`,
                    },
                    pattern: {
                      value: /^\d+(\.\d{1,4})?$/,
                      message: "Invalid amount",
                    },
                  })}
                  className={`w-full rounded-xl border-b border-transparent bg-transparent py-2 text-2xl outline-none transition-all placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed dark:placeholder:text-white/30 ${
                    errors.amount
                      ? "text-red-500 dark:text-red-500"
                      : "text-neutral-900 dark:text-white/80"
                  }`}
                  placeholder="0"
                  title="Enter amount to fund"
                />

                <FormDropdown
                  defaultTitle="Select token"
                  data={tokens}
                  defaultSelectedItem={token}
                  onSelect={(selectedToken) => setValue("token", selectedToken)}
                  className="min-w-44"
                />
              </div>
            </div>

            <div className="flex w-full items-center justify-between rounded-xl bg-accent-gray px-4 py-2.5 dark:bg-white/5">
              <p className="text-text-secondary dark:text-white/50">Network</p>
              <div className="flex items-center gap-2">
                <Image
                  src={selectedNetwork.imageUrl}
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
              disabled={!isValid || !isDirty || isConfirming}
            >
              {isConfirming ? "Loading..." : "Choose funding method"}
            </button>
          </form>
        </div>
      )}
    </AnimatedModal>
  );
};
