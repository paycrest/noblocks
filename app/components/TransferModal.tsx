import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { useEffect, useState } from "react";

import {
  ArrowLeft02Icon,
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Wallet01Icon,
} from "hugeicons-react";

import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { BaseError, encodeFunctionData, erc20Abi, parseUnits } from "viem";

import { useBalance } from "../context";
import type { Token } from "../types";
import { useNetwork } from "../context/NetworksContext";
import { classNames, fetchSupportedTokens } from "../utils";

import { primaryBtnClasses } from "./Styles";
import { FormDropdown } from "./FormDropdown";
import { AnimatedModal } from "./AnimatedComponents";

export const TransferModal = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) => {
  const { selectedNetwork } = useNetwork();
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [errorCount, setErrorCount] = useState(0);
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [isTransferSuccess, setIsTransferSuccess] = useState<boolean>(false);
  const [transferAmount, setTransferAmount] = useState<string>("");
  const [transferToken, setTransferToken] = useState<string>("");

  const { smartWalletBalance, refreshBalance } = useBalance();
  const { client } = useSmartWallets();

  type FormData = {
    amount: number;
    token: string;
    recipientAddress: string;
  };

  const formMethods = useForm<FormData>({ mode: "onChange" });
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

  const handleTransfer = async (data: FormData) => {
    try {
      const fetchedTokens: Token[] =
        fetchSupportedTokens(client?.chain.name) || [];
      const tokenAddress = fetchedTokens.find(
        (t) => t.symbol.toUpperCase() === token,
      )?.address as `0x${string}`;
      const tokenDecimals = fetchedTokens.find(
        (t) => t.symbol.toUpperCase() === data.token,
      )?.decimals;
      setIsConfirming(true);
      await client?.sendTransaction({
        to: tokenAddress,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "transfer",
          args: [
            data.recipientAddress as `0x${string}`,
            parseUnits(data.amount.toString(), tokenDecimals!),
          ],
        }),
      });

      setTransferAmount(data.amount.toString());
      setTransferToken(token);
      setIsTransferSuccess(true);

      toast.success(
        `${data.amount.toString()} ${token} successfully transferred`,
      );
      setIsConfirming(false);
      reset();
    } catch (e: any) {
      onClose();
      setErrorMessage((e as BaseError).shortMessage);
      setErrorCount((prevCount) => prevCount + 1);
      setIsConfirming(false);
    }
    refreshBalance();
  };

  const handleBalanceMaxClick = () => {
    setValue("amount", smartWalletBalance?.balances[token] ?? 0, {
      shouldValidate: true,
      shouldDirty: true,
    });
  };

  const handleModalClose = () => {
    setIsTransferSuccess(false);
    reset();
    onClose();
  };

  useEffect(() => {
    if (errorMessage) {
      toast.error(errorMessage);
    }
  }, [errorCount, errorMessage]);

  useEffect(() => {
    if (!token) {
      setValue("token", "USDC");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tokenBalance = Number(smartWalletBalance?.balances[token]) || 0;

  const renderSuccessView = () => (
    <div className="space-y-6 pt-4">
      <CheckmarkCircle01Icon className="mx-auto size-10" color="#39C65D" />

      <div className="space-y-3 pb-5 text-center">
        <h2 className="text-lg font-semibold text-text-body dark:text-white">
          Transfer successful
        </h2>

        <p className="text-gray-500 dark:text-white/50">
          {transferAmount} {transferToken} has been successfully transferred to
          the recipient.
        </p>
      </div>

      <button
        type="button"
        className={`${primaryBtnClasses} w-full`}
        onClick={handleModalClose}
      >
        Close
      </button>
    </div>
  );

  return (
    <AnimatedModal isOpen={isOpen} onClose={handleModalClose}>
      <div className="space-y-4">
        {isTransferSuccess ? (
          renderSuccessView()
        ) : (
          <>
            <div className="flex items-center justify-between">
              <button
                type="button"
                aria-label="Close transfer modal"
                onClick={handleModalClose}
                className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10 max-sm:-ml-2 sm:hidden"
              >
                <ArrowLeft02Icon className="size-5 text-outline-gray dark:text-white/50" />
              </button>
              <h2 className="text-lg font-semibold text-text-body dark:text-white sm:flex-1">
                Transfer
              </h2>
              <button
                type="button"
                aria-label="Close transfer modal"
                onClick={handleModalClose}
                className="hidden rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10 sm:block"
              >
                <Cancel01Icon className="size-5 text-outline-gray dark:text-white/50" />
              </button>
              <div className="w-10 sm:hidden" />
            </div>

            <form
              onSubmit={handleSubmit(handleTransfer)}
              className="z-50 space-y-4 text-neutral-900 transition-all *:text-sm dark:text-white"
              noValidate
            >
              <div className="grid gap-3.5 rounded-[20px] border border-border-light px-4 py-3 dark:border-white/10">
                {/* Amount to send & token with wallet balance */}
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
                    onSelect={(selectedToken) =>
                      setValue("token", selectedToken)
                    }
                    className="min-w-44"
                  />
                </div>
              </div>

              <div className="flex w-full items-center justify-between rounded-xl bg-accent-gray px-4 py-2.5 dark:bg-white/5">
                <p className="text-text-secondary dark:text-white/50">
                  Balance
                </p>
                <div className="flex items-center gap-3">
                  {Number(amount) >= tokenBalance ? (
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
                  <p className="text-[10px] text-gray-300 dark:text-white/10">
                    |
                  </p>
                  <p className="font-medium text-neutral-900 dark:text-white/80">
                    {tokenBalance} {token}
                  </p>
                </div>
              </div>

              {/* Recipient Address */}
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
                        value.length === 42 ||
                        "Address must be 42 characters long",
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
          </>
        )}
      </div>
    </AnimatedModal>
  );
};
