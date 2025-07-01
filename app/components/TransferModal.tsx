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
import { usePrivy } from "@privy-io/react-auth";
import { createPublicClient, http } from "viem";
import { getRpcUrl } from "../utils";

import { useBalance } from "../context";
import type { Token } from "../types";
import { useNetwork } from "../context/NetworksContext";
import { classNames, fetchSupportedTokens, getExplorerLink } from "../utils";

import { primaryBtnClasses } from "./Styles";
import { FormDropdown } from "./FormDropdown";
import { AnimatedModal } from "./AnimatedComponents";
import { BalanceSkeleton } from "./BalanceSkeleton";

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
  const [transactionHash, setTransactionHash] = useState<string | null>(null);

  const { smartWalletBalance, refreshBalance, isLoading } = useBalance();
  const { client } = useSmartWallets();
  const { user } = usePrivy();

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

  // Add effect to revalidate amount when token changes
  useEffect(
    function revalidateAmount() {
      if (token) {
        setValue("amount", Number(amount), { shouldValidate: true });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token],
  );

  const handleTransfer = async (data: FormData) => {
    try {
      const fetchedTokens: Token[] =
        fetchSupportedTokens(selectedNetwork.chain.name) || [];

      await client?.switchChain({
        id: selectedNetwork.chain.id,
      });

      const searchToken = token.toUpperCase();
      const tokenData = fetchedTokens.find(
        (t) => t.symbol.toUpperCase() === searchToken,
      );

      const tokenAddress = tokenData?.address as `0x${string}`;
      const tokenDecimals = tokenData?.decimals;

      if (!tokenAddress || tokenDecimals === undefined) {
        setErrorMessage(`Token data not found for ${token}.`);
        throw new Error(
          `Token data not found for ${token}. Available tokens: ${fetchedTokens.map((t) => t.symbol).join(", ")}`,
        );
      }

      setIsConfirming(true);

      const response = await client?.sendTransaction({
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

      // Poll for the Transfer event to get the real txHash
      const pollForTransferEvent = async () => {
        let intervalId: NodeJS.Timeout;
        const publicClient = createPublicClient({
          chain: selectedNetwork.chain,
          transport: http(getRpcUrl(selectedNetwork.chain.name)),
        });
        // Get smart wallet address from user linked accounts
        const smartWallet = user?.linkedAccounts.find(
          (account) => account.type === "smart_wallet",
        );
        const from = smartWallet?.address as `0x${string}`;
        const value = parseUnits(data.amount.toString(), tokenDecimals);
        const to = data.recipientAddress as `0x${string}`;

        const getTransferLogs = async () => {
          try {
            const toBlock = await publicClient.getBlockNumber();
            const blockRange = 10;
            const logs = await publicClient.getContractEvents({
              address: tokenAddress,
              abi: erc20Abi,
              eventName: "Transfer",
              args: { from, to },
              fromBlock: toBlock - BigInt(blockRange),
              toBlock: toBlock,
            });
            // Filter logs by value in JS
            const matchingLog = logs.find(
              (log) =>
                log.args && log.args.value?.toString() === value.toString(),
            );
            if (matchingLog) {
              clearInterval(intervalId);
              setTransactionHash(matchingLog.transactionHash);
              setTransferAmount(data.amount.toString());
              setTransferToken(token);
              setIsTransferSuccess(true);
              toast.success(
                `${data.amount.toString()} ${token} successfully transferred`,
              );
              setIsConfirming(false);
              reset();
            }
          } catch (error) {
            // Optionally handle polling errors
          }
        };
        getTransferLogs();
        intervalId = setInterval(getTransferLogs, 2000);
      };

      pollForTransferEvent();
    } catch (e: any) {
      console.error("Transfer failed:", {
        error: e,
        shortMessage: (e as BaseError).shortMessage,
        fullError: e.toString(),
        token,
        availableTokens: fetchedTokens.map((t) => t.symbol),
      });
      onClose();
      setErrorMessage((e as BaseError).shortMessage || e.message);
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
    setTransactionHash(null);
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

  const renderSuccessView = () => {
    const explorerLink = transactionHash
      ? getExplorerLink(selectedNetwork.chain.name, transactionHash)
      : null;

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
          onClick={handleModalClose}
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
        {isLoading ? (
          <BalanceSkeleton className="w-24" />
        ) : (
          <>
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
            <p className="text-[10px] text-gray-300 dark:text-white/10">|</p>
            <p className="font-medium text-neutral-900 dark:text-white/80">
              {tokenBalance} {token}
            </p>
          </>
        )}
      </div>
    </div>
  );

  return (
    <AnimatedModal isOpen={isOpen} onClose={handleModalClose}>
      {isTransferSuccess ? (
        renderSuccessView()
      ) : (
        <div className="grid gap-6">
          <div className="flex items-center justify-between gap-4">
            <button
              type="button"
              title="Go back"
              onClick={handleModalClose}
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
                />
              </div>
            </div>

            {renderBalanceSection()}

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
        </div>
      )}
    </AnimatedModal>
  );
};
