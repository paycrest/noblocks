"use client";
import { useForm } from "react-hook-form";
import { useEffect, useState } from "react";
import Image from "next/image";
import { ArrowLeft02Icon, Cancel01Icon } from "hugeicons-react";
import { PayEmbed } from "thirdweb/react";
import { AnimatedModal } from "./AnimatedComponents";
import { useNetwork } from "../context/NetworksContext";
import { FormDropdown } from "./FormDropdown";
import { primaryBtnClasses } from "./Styles";
import {
  classNames,
  fetchSupportedTokens,
  getNetworkImageUrl,
  getRpcUrl,
} from "../utils";
import { trackEvent } from "../hooks/analytics";
import type { Token } from "../types";
import { useActualTheme } from "../hooks/useActualTheme";
import { useActiveAccount } from "thirdweb/react";
import { THIRDWEB_CLIENT } from "../lib/thirdweb/client";
import { useBalance } from "../context";
import type { Chain } from "thirdweb";
import { customLightTheme, customDarkTheme } from "../lib/thirdweb/theme";

type FundFormData = {
  amount: number;
  token: string;
};

type FundWalletModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export const FundWalletModal = ({ isOpen, onClose }: FundWalletModalProps) => {
  const { selectedNetwork } = useNetwork();
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [fundingInProgress, setFundingInProgress] = useState<boolean>(false);
  const [rpcUrl, setRpcUrl] = useState<string>("");
  const isDark = useActualTheme();
  const account = useActiveAccount();
  const { refreshBalance } = useBalance();

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
      if (!account?.address) {
        throw new Error("No wallet connected");
      }

      const networkRpcUrl = getRpcUrl(selectedNetwork.chain.name);
      if (!networkRpcUrl) {
        throw new Error("RPC URL not found for network");
      }
      setRpcUrl(networkRpcUrl);

      setIsConfirming(true);
      setFundingInProgress(true);

      trackEvent("Funding started", {
        "Entry point": "Fund modal",
        Amount: data.amount,
        Network: selectedNetwork.chain.name,
        Token: data.token,
      });

      // The PayEmbed component will handle the actual funding process
      // We just need to show it and handle the callbacks
    } catch (error) {
      console.error("Fund error:", error);
      setFundingInProgress(false);
      setIsConfirming(false);
    }
  };

  const handleModalClose = () => {
    if (fundingInProgress) {
      if (confirm("Are you sure you want to cancel the funding process?")) {
        setFundingInProgress(false);
        reset();
        onClose();
      }
    } else {
      reset();
      onClose();
    }

    refreshBalance();
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
          <PayEmbed
            client={THIRDWEB_CLIENT}
            theme={isDark ? customDarkTheme : customLightTheme}
            payOptions={{
              mode: "fund_wallet",
              metadata: {
                name: "Get funds",
              },
              prefillBuy: {
                chain: {
                  ...selectedNetwork.chain,
                  rpc: rpcUrl,
                } as Chain,
                amount: amount?.toString() || "0",
                token: fetchedTokens.find((t) => t.symbol === token)
                  ? {
                      address: fetchedTokens.find((t) => t.symbol === token)
                        ?.address as `0x${string}`,
                      symbol: token,
                      name:
                        fetchedTokens.find((t) => t.symbol === token)?.name ||
                        token,
                    }
                  : undefined,
              },
            }}
          />
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
                <div className="w-40">
                  <FormDropdown
                    defaultTitle="Select token"
                    data={tokens}
                    defaultSelectedItem={token}
                    onSelect={(selectedToken) =>
                      setValue("token", selectedToken)
                    }
                    className="min-w-44"
                  />
                </div>
              </div>
              {errors.amount && (
                <p className="text-xs text-red-500">{errors.amount.message}</p>
              )}
            </div>
            <button
              type="submit"
              disabled={!isValid || !isDirty}
              className={`${primaryBtnClasses} w-full`}
            >
              Next
            </button>
          </form>
        </div>
      )}
    </AnimatedModal>
  );
};
