"use client";
import { useState, useEffect } from "react";
import { ImSpinner3 } from "react-icons/im";
import { BsArrowDown } from "react-icons/bs";
import { usePrivy, useFundWallet } from "@privy-io/react-auth";
import { AnimatePresence } from "framer-motion";

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
import { NoteIcon, WalletIcon } from "../components/ImageAssets";
import { fetchSupportedTokens } from "../utils";
import { useNetwork } from "../context/NetworksContext";
import { useBalance } from "../context/BalanceContext";
import { trackEvent } from "../hooks/analytics";

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
  const { selectedNetwork } = useNetwork();
  const { smartWalletBalance, refreshBalance } = useBalance();

  const [isUserVerified, setIsUserVerified] = useState(false);
  const [isReceiveInputActive, setIsReceiveInputActive] = useState(false);

  const {
    handleSubmit,
    register,
    watch,
    setValue,
    formState: { errors, isValid, isDirty },
  } = formMethods;
  const { amountSent, amountReceived, token, currency, recipientName } =
    watch();

  const balance = smartWalletBalance?.balances[token] ?? 0;

  const { fundWallet } = useFundWallet({
    onUserExited: () => {
      refreshBalance();
    },
  });

  const handleFundWallet = async (address: string) => {
    const amountToFund = Number(
      (Number(amountSent) - Number(balance)).toFixed(4),
    ).toString();

    const selectedToken = fetchSupportedTokens(
      selectedNetwork.chain.name,
    )?.find((t) => t.symbol === token);

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
      trackEvent("cta_clicked", { cta: "Max balance" });
    }
  };

  // calculate receive amount based on send amount and rate
  useEffect(() => {
    if (rate && (amountSent || amountReceived)) {
      if (isReceiveInputActive) {
        setValue(
          "amountSent",
          Number((Number(amountReceived) / rate).toFixed(2)),
        );
      } else {
        setValue("amountReceived", Number((rate * amountSent).toFixed(2)));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amountSent, amountReceived, rate]);

  useEffect(() => {
    if (!token || !currency) {
      register("token", { value: "USDC" });
    }
  }, []);

  return (
    <>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="z-50 grid gap-6 py-10 text-sm text-neutral-900 transition-all dark:text-white"
        noValidate
      >
        <div className="space-y-2 rounded-2xl bg-gray-50 p-2 dark:bg-neutral-800">
          <div className="flex items-center justify-between py-1">
            <h3 className="px-2 font-medium">Swap</h3>
            {/* {authenticated && <NetworksDropdown iconOnly />} */}
          </div>

          {/* Amount to send & token with wallet balance */}
          <div className="relative space-y-3.5 rounded-2xl bg-white px-4 py-3 dark:bg-neutral-900">
            <div className="flex items-center justify-between">
              <label
                htmlFor="amount-sent"
                className="text-gray-500 dark:text-white/50"
              >
                Send
              </label>
              {authenticated &&
                token &&
                smartWalletBalance &&
                balance !== undefined && (
                  <div className="flex items-center gap-2">
                    <WalletIcon className="size-4" />
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
                  </div>
                )}
            </div>

            <div className="flex items-center justify-between gap-2">
              <input
                id="amount-sent"
                type="number"
                step="0.0001"
                {...register("amountSent", {
                  required: { value: true, message: "Amount is required" },
                  disabled: !token,
                  min: {
                    value: 0.5,
                    message: `Min. amount is 0.5`,
                  },
                  max: {
                    value: 10000,
                    message: `Max. amount is 10,000`,
                  },
                  pattern: {
                    value: /^\d+(\.\d{1,4})?$/,
                    message: "Invalid amount",
                  },
                  onChange: () => setIsReceiveInputActive(false),
                })}
                className={`w-full rounded-xl border-b border-transparent bg-transparent py-2 text-2xl outline-none transition-all placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed dark:bg-neutral-900 dark:placeholder:text-white/30 ${
                  amountSent > balance || errors.amountSent
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
                  trackEvent("token_selected", {
                    token: selectedToken,
                    network: selectedNetwork.chain.name,
                  });
                }}
              />
            </div>
            {/* {errors.amountSent && (
              <InputError message={errors.amountSent.message} />
            )} */}

            {/* Arrow showing swap direction */}
            <div className="absolute -bottom-5 left-1/2 z-10 w-fit -translate-x-1/2 rounded-xl border-4 border-gray-50 bg-gray-50 dark:border-neutral-800 dark:bg-neutral-800">
              <div className="rounded-lg bg-white p-1 dark:bg-neutral-900">
                {isFetchingRate ? (
                  <ImSpinner3 className="animate-spin text-xl text-gray-500 dark:text-white/50" />
                ) : (
                  <BsArrowDown className="text-xl text-gray-500 dark:text-white/80" />
                )}
              </div>
            </div>
          </div>

          {/* Amount to receive & currency */}
          <div className="space-y-3.5 rounded-2xl bg-white px-4 py-3 dark:bg-neutral-900">
            <label
              htmlFor="amount-received"
              className="text-gray-500 dark:text-white/50"
            >
              Receive
            </label>

            <div className="flex items-center justify-between gap-2">
              <input
                id="amount-received"
                type="number"
                step="0.01"
                {...register("amountReceived", {
                  disabled: !token || !currency,
                  onChange: () => setIsReceiveInputActive(true),
                })}
                className={`w-full rounded-xl border-b border-transparent bg-transparent py-2 text-2xl outline-none transition-all placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed dark:bg-neutral-900 dark:placeholder:text-white/30 ${
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
                className="min-w-52"
                isCTA={!currency && !(authenticated && amountSent > balance)}
              />
            </div>
            {/* {errors.amountReceived && (
              <InputError message={errors.amountReceived.message} />
            )} */}
          </div>
        </div>

        {/* Recipient and memo */}
        <AnimatePresence>
          {currency && (
            <AnimatedComponent
              variant={slideInOut}
              className="space-y-2 rounded-2xl bg-gray-50 p-2 dark:bg-neutral-800"
            >
              <RecipientDetailsForm
                formMethods={formMethods}
                stateProps={stateProps}
              />

              {/* Memo */}
              <div className="relative">
                <NoteIcon className="absolute left-2 top-2.5 fill-white stroke-gray-300 dark:fill-transparent dark:stroke-none" />
                <input
                  type="text"
                  id="memo"
                  {...register("memo", {
                    required: { value: false, message: "Add description" },
                  })}
                  className={`focus:ring-primary w-full rounded-xl border border-gray-300 bg-transparent py-2 pl-8 pr-4 text-sm transition-all placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-opacity-50 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed dark:border-white/20 dark:bg-neutral-900 dark:placeholder:text-white/30 dark:focus-visible:ring-offset-neutral-900 ${
                    errors.memo
                      ? "text-red-500 dark:text-red-500"
                      : "text-neutral-900 dark:text-white/80"
                  }`}
                  placeholder="Add description (optional)"
                  maxLength={25}
                />
              </div>
            </AnimatedComponent>
          )}
        </AnimatePresence>

        {!ready && (
          <button type="button" className={primaryBtnClasses} disabled>
            Loading...
          </button>
        )}

        {/* {ready && authenticated && !isUserVerified && (
          <KycModal setIsUserVerified={setIsUserVerified} />
        )} */}

        {ready && !authenticated && (
          <button type="button" className={primaryBtnClasses} onClick={login}>
            Get started
          </button>
        )}

        {ready && authenticated && (
          <button
            type="button"
            className={primaryBtnClasses}
            disabled={
              (!isDirty || !isValid || !currency || !recipientName) &&
              amountSent <= balance
            }
            onClick={() => {
              if (amountSent > balance) {
                handleFundWallet(smartWallet?.address ?? "");
              } else {
                handleSubmit(onSubmit)();
              }
            }}
          >
            {amountSent > balance ? "Fund Wallet" : "Swap"}
          </button>
        )}

        <AnimatePresence>
          {rate > 0 && (
            <AnimatedComponent
              variant={slideInOut}
              className="flex w-full flex-col justify-between gap-2 text-xs text-gray-500 transition-all dark:text-white/30 sm:flex-row sm:items-center"
            >
              {currency && (
                <div className="min-w-fit">
                  1 {token} ~ {isFetchingRate ? "..." : rate} {currency}
                </div>
              )}
              <div className="ml-auto flex w-full flex-col justify-end gap-2 sm:flex-row sm:items-center">
                <div className="h-px w-1/2 flex-shrink bg-gradient-to-tr from-white to-gray-300 dark:bg-gradient-to-tr dark:from-neutral-900 dark:to-neutral-700 sm:w-full" />
                <p className="min-w-fit">
                  Swap usually completes in 30s or less
                </p>
              </div>
            </AnimatedComponent>
          )}
        </AnimatePresence>
      </form>
    </>
  );
};
