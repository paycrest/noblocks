import React from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft02Icon,
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Wallet01Icon,
} from "hugeicons-react";
import { primaryBtnClasses } from "../Styles";
import { FormDropdown } from "../FormDropdown";
import { AnimatedComponent, slideInOut } from "../AnimatedComponents";
import { BalanceSkeleton } from "../BalanceSkeleton";
import { classNames } from "../../utils";
import { encodeFunctionData, erc20Abi, parseUnits } from "viem";
import { fetchSupportedTokens } from "../../utils";
import { toast } from "sonner";
import { useCallback, useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { Token, Network } from "../../types";

interface TransferViewProps {
  setCurrentView: (
    v: React.SetStateAction<
      "wallet" | "settings" | "transfer" | "fund" | "history"
    >,
  ) => void;
  refreshBalance: () => void;
  client: any;
  selectedNetwork: Network;
  smartWalletBalance: any;
  isBalanceLoading: boolean;
  onClose: () => void;
}

export const TransferView: React.FC<TransferViewProps> = ({
  setCurrentView,
  refreshBalance,
  client,
  selectedNetwork,
  smartWalletBalance,
  isBalanceLoading,
  onClose,
}) => {
  const [isTransferSuccess, setIsTransferSuccess] = useState(false);
  const [transferAmount, setTransferAmount] = useState("");
  const [transferToken, setTransferToken] = useState("");
  const [transferErrorMessage, setTransferErrorMessage] = useState("");
  const [transferErrorCount, setTransferErrorCount] = useState(0);
  const [isTransferConfirming, setIsTransferConfirming] = useState(false);
  const transferForm = useForm<{
    amount: number;
    token: string;
    recipientAddress: string;
  }>({ mode: "onChange" });
  const {
    handleSubmit: handleTransferSubmit,
    register: registerTransfer,
    setValue: setTransferValue,
    watch: watchTransfer,
    reset: resetTransfer,
    formState: {
      errors: transferErrors,
      isValid: isTransferValid,
      isDirty: isTransferDirty,
    },
  } = transferForm;
  const { token: transferTokenField, amount: transferAmountField } =
    watchTransfer();
  const transferTokens: Token[] =
    fetchSupportedTokens(selectedNetwork.chain.name) || [];
  const transferTokenOptions = transferTokens.map((token) => ({
    name: token.symbol,
    imageUrl: token.imageUrl,
  }));
  const transferTokenBalance =
    Number(smartWalletBalance?.balances?.[transferTokenField]) || 0;
  const isTransferLoading = isTransferConfirming;

  const handleTransferBalanceMaxClick = () => {
    if (isTransferLoading) return;
    setTransferValue(
      "amount",
      smartWalletBalance?.balances?.[transferTokenField] ?? 0,
      { shouldValidate: true, shouldDirty: true },
    );
  };
  const handleTransferModalClose = () => {
    setIsTransferSuccess(false);
    resetTransfer();
    setCurrentView("wallet");
  };
  useEffect(() => {
    if (transferErrorMessage) toast.error(transferErrorMessage);
  }, [transferErrorCount, transferErrorMessage]);
  useEffect(() => {
    if (!transferTokenField) setTransferValue("token", "USDC");
  }, []);

  const handleTransfer = useCallback(
    async (data: any) => {
      try {
        const fetchedTokens = fetchSupportedTokens(client?.chain.name) || [];
        const searchToken = transferTokenField?.toUpperCase();
        const tokenData = fetchedTokens.find(
          (t: any) => t.symbol.toUpperCase() === searchToken,
        );
        const tokenAddress = tokenData?.address as `0x${string}`;
        const tokenDecimals = tokenData?.decimals;
        if (!tokenAddress || tokenDecimals === undefined) {
          setTransferErrorMessage(
            `Token data not found for ${transferTokenField}.`,
          );
          throw new Error(
            `Token data not found for ${transferTokenField}. Available tokens: ${fetchedTokens.map((t: any) => t.symbol).join(", ")}`,
          );
        }
        setIsTransferConfirming(true);
        await client?.sendTransaction({
          to: tokenAddress,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "transfer",
            args: [
              data.recipientAddress as `0x${string}`,
              parseUnits(data.amount.toString(), tokenDecimals),
            ],
          }),
        });
        setTransferAmount(data.amount.toString());
        setTransferToken(transferTokenField);
        setIsTransferSuccess(true);
        toast.success(
          `${data.amount.toString()} ${transferTokenField} successfully transferred`,
        );
        setIsTransferConfirming(false);
        resetTransfer();
        onClose();
        refreshBalance();
      } catch (e: any) {
        setTransferErrorMessage(
          e?.shortMessage || e?.message || "Transfer failed",
        );
        setTransferErrorCount((c: number) => c + 1);
        setIsTransferConfirming(false);
        setCurrentView("wallet");
      }
    },
    [
      client,
      transferTokenField,
      setIsTransferSuccess,
      setTransferAmount,
      setTransferToken,
      setIsTransferConfirming,
      setTransferErrorMessage,
      setTransferErrorCount,
      resetTransfer,
      setCurrentView,
      onClose,
      refreshBalance,
    ],
  );

  return (
    <div className="space-y-6">
      {isTransferSuccess ? (
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
          </div>
          <button
            type="button"
            className={`${primaryBtnClasses} w-full`}
            onClick={handleTransferModalClose}
          >
            Close
          </button>
        </div>
      ) : (
        <form
          onSubmit={handleTransferSubmit(handleTransfer)}
          className="grid gap-6"
        >
          <div className="flex items-center justify-between gap-4">
            <button
              type="button"
              title="Go back"
              onClick={handleTransferModalClose}
              className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10 sm:hidden"
            >
              <ArrowLeft02Icon className="size-5 text-outline-gray dark:text-white/50" />
            </button>
            <h2 className="text-lg font-semibold text-text-body dark:text-white sm:flex-1">
              Transfer
            </h2>
            <button
              type="button"
              aria-label="Close transfer modal"
              onClick={handleTransferModalClose}
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
                {...registerTransfer("amount", {
                  required: {
                    value: true,
                    message: "Amount is required",
                  },
                  disabled: !transferTokenField,
                  min: {
                    value: 0.0001,
                    message: `Min. amount is 0.0001`,
                  },
                  max: {
                    value: transferTokenBalance,
                    message: `Max. amount is ${transferTokenBalance}`,
                  },
                  pattern: {
                    value: /^\d+(\.\d{1,4})?$/,
                    message: "Invalid amount",
                  },
                })}
                className={`w-full rounded-xl border-b border-transparent bg-transparent py-2 text-2xl outline-none transition-all placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed dark:placeholder:text-white/30 ${
                  transferErrors.amount
                    ? "text-red-500 dark:text-red-500"
                    : "text-neutral-900 dark:text-white/80"
                }`}
                placeholder="0"
                title="Enter amount to send"
              />
              <FormDropdown
                defaultTitle="Select token"
                data={transferTokenOptions}
                defaultSelectedItem={transferTokenField}
                onSelect={(selectedToken: string) =>
                  setTransferValue("token", selectedToken)
                }
                className="min-w-44"
                dropdownWidth={160}
              />
            </div>
            {transferErrors.amount && (
              <AnimatedComponent
                variant={slideInOut}
                className="text-xs text-red-500"
              >
                {transferErrors.amount.message}
              </AnimatedComponent>
            )}
          </motion.div>
          <div className="flex w-full items-center justify-between rounded-xl bg-accent-gray px-4 py-2.5 dark:bg-white/5">
            <p className="text-text-secondary dark:text-white/50">Balance</p>
            <div className="flex items-center gap-3">
              {isBalanceLoading ? (
                <BalanceSkeleton className="w-24" />
              ) : (
                <>
                  {Number(transferAmountField) >= transferTokenBalance ? (
                    <p className="dark:text-white/50">Maxed out</p>
                  ) : (
                    <button
                      type="button"
                      onClick={handleTransferBalanceMaxClick}
                      className="font-medium text-lavender-500"
                      disabled={isBalanceLoading}
                    >
                      Max
                    </button>
                  )}
                  <p className="text-[10px] text-gray-300 dark:text-white/10">
                    |
                  </p>
                  <p className="font-medium text-neutral-900 dark:text-white/80">
                    {transferTokenBalance} {transferTokenField}
                  </p>
                </>
              )}
            </div>
          </div>
          <div className="relative">
            <Wallet01Icon
              className={classNames(
                "absolute left-3 top-3.5 size-4 text-icon-outline-secondary transition-colors dark:text-white/50",
              )}
            />
            <input
              type="text"
              id="recipient-address"
              {...registerTransfer("recipientAddress", {
                required: {
                  value: true,
                  message: "Recipient address is required",
                },
                pattern: {
                  value: /^0x[a-fA-F0-9]{40}$/,
                  message: "Invalid wallet address format",
                },
                validate: {
                  length: (value: string) =>
                    value.length === 42 || "Address must be 42 characters long",
                  prefix: (value: string) =>
                    value.startsWith("0x") || "Address must start with 0x",
                },
              })}
              className={classNames(
                "min-h-11 w-full rounded-xl border border-border-input bg-transparent py-2 pl-9 pr-4 text-sm transition-all placeholder:text-text-placeholder focus-within:border-gray-400 focus:outline-none disabled:cursor-not-allowed dark:border-white/20 dark:placeholder:text-white/30 dark:focus-within:border-white/40",
                transferErrors.recipientAddress
                  ? "text-red-500 dark:text-red-500"
                  : "text-neutral-900 dark:text-white/80",
              )}
              placeholder="Recipient wallet address"
              maxLength={42}
            />
            {transferErrors.recipientAddress && (
              <span className="text-xs text-red-500">
                {transferErrors.recipientAddress.message}
              </span>
            )}
          </div>
          <button
            type="submit"
            className={classNames(primaryBtnClasses, "w-full")}
            disabled={!isTransferValid || !isTransferDirty || isTransferLoading}
          >
            {isTransferLoading ? "Confirming..." : "Confirm transfer"}
          </button>
        </form>
      )}
    </div>
  );
};
