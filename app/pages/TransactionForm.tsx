"use client";
import { useState, useEffect } from "react";
import { ImSpinner, ImSpinner3 } from "react-icons/im";
import { usePrivy, useFundWallet, useWallets } from "@privy-io/react-auth";
import { AnimatePresence, motion } from "framer-motion";

import {
  AnimatedComponent,
  primaryBtnClasses,
  slideInOut,
  FormDropdown,
  RecipientDetailsForm,
  KycModal,
} from "../components";
import type { TransactionFormProps, Token } from "../types";
import { currencies } from "../mocks";
import { fetchSupportedTokens } from "../utils";
import { useNetwork } from "../context/NetworksContext";
import { useBalance } from "../context/BalanceContext";
import { trackEvent } from "../hooks/analytics";
import { ArrowDown02Icon, NoteEditIcon, Wallet01Icon } from "hugeicons-react";
import { useSwapButton } from "../hooks/useSwapButton";
import { Dialog, DialogBackdrop, DialogPanel } from "@headlessui/react";
import { fetchKYCStatus } from "../api/aggregator";

/**
 * TransactionForm component renders a form for submitting a transaction.
 * It includes fields for selecting network, token, amount, and recipient details.
 * The form also displays rate and fee information based on the selected token.
 *
 * @param formMethods - Form methods from react-hook-form library.
 * @param onSubmit - Function to handle form submission.
 * @param stateProps - State properties for the form.
 */
export const TransactionForm = ({
  formMethods,
  onSubmit,
  stateProps,
}: TransactionFormProps) => {
  // Destructure stateProps
  const { rate, isFetchingRate } = stateProps;
  const { authenticated, ready, login, user } = usePrivy();
  const { wallets } = useWallets();
  const { selectedNetwork } = useNetwork();
  const { smartWalletBalance, refreshBalance } = useBalance();
  const embeddedWalletAddress = wallets.find(
    (wallet) => wallet.walletClientType === "privy",
  )?.address;

  const [isUserVerified, setIsUserVerified] = useState(false);
  const [isKycModalOpen, setIsKycModalOpen] = useState(false);
  const [isReceiveInputActive, setIsReceiveInputActive] = useState(false);

  const {
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isValid, isDirty },
  } = formMethods;
  const { amountSent, amountReceived, token, currency, recipientName } =
    watch();

  const balance = smartWalletBalance?.balances[token] ?? 0;

  const { fundWallet } = useFundWallet({
    onUserExited: ({ fundingMethod, chain }) => {
      // NOTE: This is an inaccurate way of tracking funding status
      // Privy doesn't provide detailed funding status information
      // Available variables in onUserExited: address, chain, fundingMethod, balance
      // Limitations:
      // 1. fundingMethod only indicates user selected a method, not if funding completed
      // 2. User can select method and cancel, but it still records as "completed"
      // 3. No way to track funding errors
      // 4. balance is returned as bigint and doesn't specify token type
      // 5. No webhook or callback for actual funding confirmation
      if (fundingMethod) {
        refreshBalance();
        trackEvent("Funding Completed", {
          "Funding type": fundingMethod,
          Amount: "Not available on Privy",
          Network: chain.name,
          Token: "USDC", // privy only supports USDC
          "Funding date": new Date().toISOString(),
        });
      } else {
        trackEvent("Funding cancelled", {
          "Funding type": "User exited the funding process",
          Amount: "Not available on Privy",
          Network: chain.name,
          Token: "USDC", // privy only supports USDC
          "Funding date": new Date().toISOString(),
        });
      }
    },
  });

  const handleFundWallet = async (address: string) => {
    const amountToFund = Number(
      (Number(amountSent) - Number(balance)).toFixed(4),
    ).toString();

    const selectedToken = fetchSupportedTokens(
      selectedNetwork.chain.name,
    )?.find((t) => t.symbol === token);

    trackEvent("Funding started", {
      "Entry point": "Fund button on swap interface",
    });

    await fundWallet(address, {
      amount: amountToFund,
      chain: selectedNetwork.chain,
      asset: { erc20: selectedToken?.address as `0x${string}` },
    });
  };

  const smartWallet = user?.linkedAccounts.find(
    (account) => account.type === "smart_wallet",
  );

  const tokens = [];

  const fetchedTokens: Token[] =
    fetchSupportedTokens(selectedNetwork.chain.name) || [];
  for (const token of fetchedTokens) {
    tokens.push({
      name: token.symbol,
      imageUrl: token.imageUrl,
    });
  }

  const handleBalanceMaxClick = () => {
    if (balance > 0) {
      setValue("amountSent", balance);
      setIsReceiveInputActive(false);
    }
  };

  useEffect(() => {
    if (!embeddedWalletAddress) return;

    const fetchStatus = async () => {
      const response = await fetchKYCStatus(embeddedWalletAddress);
      if (response.data.status === "pending") {
        setIsKycModalOpen(true);
      }
    };

    fetchStatus();
  }, [embeddedWalletAddress]);

  // calculate receive amount based on send amount and rate
  useEffect(
    function calculateReceiveAmount() {
      if (rate && (amountSent || amountReceived)) {
        if (isReceiveInputActive) {
          setValue(
            "amountSent",
            Number((Number(amountReceived) / rate).toFixed(4)),
          );
        } else {
          setValue("amountReceived", Number((rate * amountSent).toFixed(2)));
        }
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [amountSent, amountReceived, rate],
  );

  // Register form fields
  useEffect(
    function registerFormFields() {
      formMethods.register("amountSent", {
        required: { value: true, message: "Amount is required" },
        disabled: !token,
        min: {
          value: 0.5,
          message: "Minimum amount is 0.5",
        },
        max: {
          value: 10000,
          message: "Maximum amount is 10,000",
        },
        validate: {
          decimals: (value) => {
            const decimals = value.toString().split(".")[1];
            return (
              !decimals ||
              decimals.length <= 4 ||
              "Maximum 4 decimal places allowed"
            );
          },
        },
      });

      formMethods.register("amountReceived", {
        disabled: !token || !currency,
      });

      formMethods.register("memo", {
        required: { value: false, message: "Add description" },
      });
    },
    [token, currency, formMethods],
  );

  const { isEnabled, buttonText, buttonAction, hasInsufficientBalance } =
    useSwapButton({
      watch,
      balance,
      isDirty,
      isValid,
    });

  const handleSwap = () => {
    handleSubmit(onSubmit)();
  };

  return (
    <>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="z-50 grid gap-4 pb-4 text-sm text-text-body transition-all dark:text-white sm:gap-2"
        noValidate
      >
        <div className="grid gap-2 rounded-[20px] bg-background-neutral p-2 dark:bg-white/5">
          <h3 className="px-2 py-1 text-base font-medium">Swap</h3>

          {/* Amount to send & token with wallet balance */}
          <div className="relative space-y-3.5 rounded-2xl bg-white px-4 py-3 dark:bg-surface-canvas">
            <div className="flex items-center justify-between">
              <label
                htmlFor="amount-sent"
                className="text-text-secondary dark:text-white/50"
              >
                Send
              </label>
              <AnimatePresence>
                {authenticated &&
                  token &&
                  smartWalletBalance &&
                  balance !== undefined && (
                    <AnimatedComponent
                      variant={slideInOut}
                      className="flex items-center gap-2"
                    >
                      <Wallet01Icon className="size-4 text-icon-outline-secondary dark:text-white/50" />
                      <span
                        className={amountSent > balance ? "text-red-500" : ""}
                      >
                        {balance} {token}
                      </span>
                      <button
                        type="button"
                        onClick={handleBalanceMaxClick}
                        className="font-medium text-lavender-500 dark:text-lavender-500"
                      >
                        Max
                      </button>
                    </AnimatedComponent>
                  )}
              </AnimatePresence>
            </div>

            <div className="flex items-center justify-between gap-2">
              <input
                id="amount-sent"
                type="number"
                step="0.0001"
                onChange={(e) => {
                  let inputValue = e.target.value;

                  // Allow empty input for clearing
                  if (inputValue === "") {
                    formMethods.setValue("amountSent", 0);
                    setIsReceiveInputActive(false);
                    return;
                  }

                  const value = Number(inputValue);
                  if (isNaN(value) || value < 0) return;

                  // Only limit decimal places, allow any whole number
                  if (inputValue.includes(".")) {
                    const decimals = inputValue.split(".")[1];
                    if (decimals?.length > 4) return;
                  }

                  formMethods.setValue("amountSent", value, {
                    shouldValidate: true,
                  });
                  setIsReceiveInputActive(false);
                }}
                value={formMethods.watch("amountSent").toString()}
                className={`w-full rounded-xl border-b border-transparent bg-transparent py-2 text-2xl outline-none transition-all placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed dark:placeholder:text-white/30 ${
                  authenticated && (amountSent > balance || errors.amountSent)
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
                onSelect={(selectedToken) => {
                  setValue("token", selectedToken);
                }}
              />
            </div>

            {/* Arrow showing swap direction */}
            <div className="absolute -bottom-5 left-1/2 z-10 w-fit -translate-x-1/2 rounded-xl border-4 border-background-neutral bg-background-neutral dark:border-white/5 dark:bg-surface-canvas">
              <div className="rounded-lg bg-white p-0.5 dark:bg-surface-canvas">
                {isFetchingRate ? (
                  <ImSpinner3 className="animate-spin text-xl text-outline-gray dark:text-white/50" />
                ) : (
                  <ArrowDown02Icon className="text-xl text-outline-gray dark:text-white/80" />
                )}
              </div>
            </div>
          </div>

          {/* Amount to receive & currency */}
          <div className="space-y-3.5 rounded-2xl bg-white px-4 py-3 dark:bg-surface-canvas">
            <label
              htmlFor="amount-received"
              className="text-text-secondary dark:text-white/50"
            >
              Receive
            </label>

            <div className="flex items-center justify-between gap-2">
              <input
                id="amount-received"
                type="number"
                step="0.01"
                onChange={(e) => {
                  let inputValue = e.target.value;

                  // Allow empty input for clearing
                  if (inputValue === "") {
                    formMethods.setValue("amountReceived", 0);
                    setIsReceiveInputActive(true);
                    return;
                  }

                  const value = Number(inputValue);
                  if (isNaN(value) || value < 0) return;

                  // Only limit decimal places to 2 for receive amount
                  if (inputValue.includes(".")) {
                    const decimals = inputValue.split(".")[1];
                    if (decimals?.length > 2) return;
                  }

                  formMethods.setValue("amountReceived", value, {
                    shouldValidate: true,
                  });
                  setIsReceiveInputActive(true);
                }}
                value={formMethods.watch("amountReceived").toString()}
                className={`w-full rounded-xl border-b border-transparent bg-transparent py-2 text-2xl outline-none transition-all placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed dark:placeholder:text-white/30 ${
                  errors.amountReceived
                    ? "text-red-500 dark:text-red-500"
                    : "text-neutral-900 dark:text-white/80"
                }`}
                placeholder="0"
                title="Enter amount to receive"
              />

              <FormDropdown
                defaultTitle="Select currency"
                data={currencies}
                defaultSelectedItem={currency}
                onSelect={(selectedCurrency) =>
                  setValue("currency", selectedCurrency)
                }
                className="min-w-60"
                isCTA={
                  // Show CTA styling when:
                  // 1. No currency is selected AND
                  // 2. Either user is not authenticated OR (user is authenticated AND doesn't need funding)
                  !currency &&
                  (!authenticated || (authenticated && !(amountSent > balance)))
                }
              />
            </div>
          </div>
        </div>

        {/* Recipient and memo */}
        <AnimatePresence>
          {/* {currency && authenticated && isUserVerified && ( */}
          {currency && authenticated && (
            <AnimatedComponent
              variant={slideInOut}
              className="space-y-2 rounded-[20px] bg-gray-50 p-2 dark:bg-white/5"
            >
              <RecipientDetailsForm
                formMethods={formMethods}
                stateProps={stateProps}
              />

              {/* Memo */}
              <div className="relative">
                <NoteEditIcon className="absolute left-3 top-3.5 size-4 text-icon-outline-secondary dark:text-white/50" />
                <input
                  type="text"
                  id="memo"
                  onChange={(e) => {
                    formMethods.setValue("memo", e.target.value);
                  }}
                  value={formMethods.watch("memo")}
                  className={`min-h-11 w-full rounded-xl border border-gray-300 bg-transparent py-2 pl-9 pr-4 text-sm transition-all placeholder:text-text-placeholder focus-within:border-gray-400 focus:outline-none disabled:cursor-not-allowed dark:border-white/20 dark:bg-input-focus dark:placeholder:text-white/30 dark:focus-within:border-white/40 ${
                    errors.memo
                      ? "text-red-500 dark:text-red-500"
                      : "text-text-body dark:text-white/80"
                  }`}
                  placeholder="Add description (optional)"
                  maxLength={25}
                />
              </div>
            </AnimatedComponent>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isKycModalOpen && (
            <Dialog
              open={isKycModalOpen}
              onClose={() => setIsKycModalOpen(false)}
              className="relative z-50"
            >
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <DialogBackdrop
                  transition
                  className="fixed inset-0 bg-black/30 backdrop-blur-sm"
                />
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  transition: { type: "spring", stiffness: 300, damping: 30 },
                }}
                exit={{
                  opacity: 0,
                  y: 20,
                  transition: { type: "spring", stiffness: 300, damping: 30 },
                }}
                className="fixed inset-0 flex w-screen items-end justify-center sm:items-center sm:p-4"
              >
                <DialogPanel
                  transition
                  className="relative max-h-[90vh] w-full max-w-[25.75rem] overflow-y-auto rounded-2xl bg-white p-5 text-sm shadow-xl transition-all duration-300 ease-out data-[closed]:scale-95 data-[closed]:opacity-0 dark:bg-surface-overlay"
                >
                  <KycModal
                    setIsKycModalOpen={setIsKycModalOpen}
                    setIsUserVerified={setIsUserVerified}
                  />
                </DialogPanel>
              </motion.div>
            </Dialog>
          )}
        </AnimatePresence>

        {/* Loading and Submit buttons */}
        {!ready && (
          <button
            title="Loading..."
            type="button"
            className={`${primaryBtnClasses} cursor-not-allowed`}
            disabled
          >
            <ImSpinner className="mx-auto animate-spin text-xl" />
          </button>
        )}

        {/* {ready && (
          <button
            type="button"
            className={primaryBtnClasses}
            disabled={!isEnabled && isUserVerified}
            onClick={buttonAction(
              handleSwap,
              login,
              () => handleFundWallet(smartWallet?.address ?? ""),
              () => setIsKycModalOpen(true),
              isUserVerified,
            )}
          >
            {!isUserVerified && authenticated && !hasInsufficientBalance
              ? "Get started"
              : buttonText}
          </button>
        )} */}

        {ready && (
          <button
            type="button"
            className={primaryBtnClasses}
            // disabled={!isEnabled && isUserVerified}
            disabled={!isEnabled}
            onClick={buttonAction(
              handleSwap,
              login,
              () => handleFundWallet(smartWallet?.address ?? ""),
              () => setIsKycModalOpen(true),
              isUserVerified,
            )}
          >
            {buttonText}
          </button>
        )}

        <AnimatePresence>
          {rate > 0 && (
            <AnimatedComponent
              variant={slideInOut}
              className="flex w-full flex-col justify-between gap-2 py-3 text-xs text-text-disabled transition-all dark:text-white/30 xsm:flex-row xsm:items-center"
            >
              {currency && (
                <div className="min-w-fit">
                  1 {token} ~ {isFetchingRate ? "..." : rate} {currency}
                </div>
              )}
              <div className="ml-auto flex w-full flex-col justify-end gap-2 xsm:flex-row xsm:items-center">
                <div className="h-px w-1/2 flex-shrink bg-gradient-to-tr from-white to-gray-300 dark:bg-gradient-to-tr dark:from-neutral-900 dark:to-neutral-700 sm:w-full" />
                <p className="min-w-fit">Swap usually completes in 30s</p>
              </div>
            </AnimatedComponent>
          )}
        </AnimatePresence>
      </form>
    </>
  );
};
