"use client";
import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { usePrivy } from "@privy-io/react-auth";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { useNetwork } from "../context/NetworksContext";
import { useBalance } from "../context";
import { fetchSupportedTokens, classNames } from "../utils";
import { useSmartWalletTransfer } from "../hooks/useSmartWalletTransfer";
import { FormDropdown } from "./FormDropdown";
import { AnimatedComponent, slideInOut } from "./AnimatedComponents";
import { BalanceSkeleton } from "./BalanceSkeleton";
import { primaryBtnClasses } from "./Styles";
import { toast } from "sonner";
import {
  ArrowLeft02Icon,
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Wallet01Icon,
} from "hugeicons-react";

export const TransferForm: React.FC<{
  onClose: () => void;
  onSuccess?: () => void;
  showBackButton?: boolean;
  setCurrentView?: (v: any) => void;
}> = ({ onClose, onSuccess, showBackButton = false, setCurrentView }) => {
  const { selectedNetwork } = useNetwork();
  const { client } = useSmartWallets();
  const { user, getAccessToken } = usePrivy();
  const { smartWalletBalance, refreshBalance } = useBalance();

  const formMethods = useForm<{
    amount: number;
    token: string;
    recipientAddress: string;
  }>({ mode: "onChange" });
  const {
    handleSubmit,
    register,
    setValue,
    watch,
    reset,
    formState: { errors, isValid, isDirty },
  } = formMethods;
  const { token, amount } = watch();

  const fetchedTokens = fetchSupportedTokens(selectedNetwork.chain.name) || [];
  const tokens = fetchedTokens.map((token) => ({
    name: token.symbol,
    imageUrl: token.imageUrl,
  }));
  const tokenBalance = Number(smartWalletBalance?.balances?.[token]) || 0;

  const {
    isLoading: isConfirming,
    isSuccess: isTransferSuccess,
    transferAmount,
    transferToken,
    transfer,
    getTxExplorerLink,
    error,
  } = useSmartWalletTransfer({
    client: client ?? null,
    selectedNetwork,
    user,
    getAccessToken,
  });

  useEffect(() => {
    if (!token) {
      setValue("token", "USDC");
    }
  }, []);

  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error]);

  useEffect(() => {
    if (isTransferSuccess && onSuccess) {
      onSuccess();
    }
  }, [isTransferSuccess, onSuccess]);

  const handleBalanceMaxClick = () => {
    setValue("amount", tokenBalance, {
      shouldValidate: true,
      shouldDirty: true,
    });
  };

  const handleFormClose = () => {
    reset();
    onClose();
  };

  const renderSuccessView = () => {
    const explorerLink = getTxExplorerLink();
    return (
      <div className="space-y-6 pt-4">
        <CheckmarkCircle01Icon className="mx-auto size-10" color="#39C65D" />
        <div className="space-y-3 pb-5 text-center">
          <h2 className="text-lg font-semibold text-text-body dark:text-white">
            Transfer successful
          </h2>
          <p className="text-gray-500 dark:text-white/50">
            {transferAmount} {transferToken} has been successfully transferred
            to the recipient.
          </p>
          {explorerLink && (
            <a
              href={explorerLink}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 block text-center text-lavender-500 underline"
            >
              View in Explorer
            </a>
          )}
        </div>
        <button
          type="button"
          className={`${primaryBtnClasses} w-full`}
          onClick={() => {
            handleFormClose();
            refreshBalance();
          }}
        >
          Close
        </button>
      </div>
    );
  };

  const renderBalanceSection = () => (
    <div className="flex w-full items-center justify-between rounded-xl bg-accent-gray px-4 py-2.5 dark:bg-white/5">
      <p className="text-text-secondary dark:text-white/50">Balance</p>
      <div className="flex items-center gap-3">
        {smartWalletBalance === null ? (
          <BalanceSkeleton className="w-24" />
        ) : Number(amount) >= tokenBalance ? (
          <p className="dark:text-white/50">Maxed out</p>
        ) : (
          <button
            type="button"
            onClick={handleBalanceMaxClick}
            className="font-medium text-lavender-500"
          >
            Max
          </button>
        )}
        <p className="text-[10px] text-gray-300 dark:text-white/10">|</p>
        <p className="font-medium text-neutral-900 dark:text-white/80">
          {smartWalletBalance === null ? (
            <BalanceSkeleton className="w-12" />
          ) : (
            `${tokenBalance} ${token}`
          )}
        </p>
      </div>
    </div>
  );

  if (isTransferSuccess) {
    return renderSuccessView();
  }

  return (
    <form
      onSubmit={handleSubmit((data) => transfer({ ...data, resetForm: reset }))}
      className="z-50 space-y-4 text-neutral-900 transition-all *:text-sm dark:text-white"
      noValidate
    >
      <div className="flex items-center justify-between gap-4">
        {showBackButton && setCurrentView ? (
          <button
            type="button"
            title="Go back"
            onClick={() => {
              reset();
              setCurrentView("wallet");
            }}
            className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10 sm:hidden"
          >
            <ArrowLeft02Icon className="size-5 text-outline-gray dark:text-white/50" />
          </button>
        ) : null}
        <h2 className="text-lg font-semibold text-text-body dark:text-white sm:flex-1">
          Transfer
        </h2>
        <button
          type="button"
          aria-label="Close transfer modal"
          onClick={handleFormClose}
          className="hidden rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10 sm:block"
        >
          <Cancel01Icon className="size-5 text-outline-gray dark:text-white/50" />
        </button>
        <div className="w-10 sm:hidden" />
      </div>
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
              disabled: !token,
              min: {
                value: 0.0001,
                message: `Min. amount is 0.0001`,
              },
              max: {
                value: tokenBalance,
                message: `Max. amount is ${tokenBalance}`,
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
            title="Enter amount to send"
          />
          <FormDropdown
            defaultTitle="Select token"
            data={tokens}
            defaultSelectedItem={token}
            onSelect={(selectedToken) => setValue("token", selectedToken)}
            className="min-w-44"
            dropdownWidth={160}
          />
        </div>
        {errors.amount && (
          <AnimatedComponent
            variant={slideInOut}
            className="text-xs text-red-500"
          >
            {errors.amount.message}
          </AnimatedComponent>
        )}
      </div>
      {renderBalanceSection()}
      <div className="relative">
        <Wallet01Icon
          className={classNames(
            "absolute left-3 top-3.5 size-4 text-icon-outline-secondary transition-colors dark:text-white/50",
          )}
        />
        <input
          type="text"
          id="recipient-address"
          {...register("recipientAddress", {
            required: {
              value: true,
              message: "Recipient address is required",
            },
            pattern: {
              value: /^0x[a-fA-F0-9]{40}$/,
              message: "Invalid wallet address format",
            },
            validate: {
              length: (value) =>
                value.length === 42 || "Address must be 42 characters long",
              prefix: (value) =>
                value.startsWith("0x") || "Address must start with 0x",
            },
          })}
          className={classNames(
            "min-h-11 w-full rounded-xl border border-border-input bg-transparent py-2 pl-9 pr-4 text-sm transition-all placeholder:text-text-placeholder focus-within:border-gray-400 focus:outline-none disabled:cursor-not-allowed dark:border-white/20 dark:placeholder:text-white/30 dark:focus-within:border-white/40",
            errors.recipientAddress
              ? "text-red-500 dark:text-red-500"
              : "text-neutral-900 dark:text-white/80",
          )}
          placeholder="Recipient wallet address"
          maxLength={42}
        />
      </div>
      <button
        type="submit"
        className={classNames(primaryBtnClasses, "w-full")}
        disabled={!isValid || !isDirty || isConfirming}
      >
        {isConfirming ? "Confirming..." : "Confirm transfer"}
      </button>
    </form>
  );
};
