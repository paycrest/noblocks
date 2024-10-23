"use client";
import { useState, useEffect } from "react";
import { ImSpinner3 } from "react-icons/im";
import { BsArrowDown } from "react-icons/bs";
import { usePrivy } from "@privy-io/react-auth";
import { AnimatePresence } from "framer-motion";

import {
  AnimatedComponent,
  primaryBtnClasses,
  slideInOut,
  FormDropdown,
  RecipientDetailsForm,
  KycModal,
} from "../components";
import type { TransactionFormProps } from "../types";
import { currencies, networks, tokens } from "../mocks";
import { NoteIcon, WalletIcon } from "../components/ImageAssets";

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
  const { authenticated, ready, login } = usePrivy();
  const { rate, isFetchingRate } = stateProps;

  // Destructure formMethods from react-hook-form
  const {
    handleSubmit,
    register,
    watch,
    setValue,
    formState: { errors, isValid, isDirty },
  } = formMethods;

  const { amountSent, amountReceived, token, currency } = watch();

  const [isUserVerified, setIsUserVerified] = useState(false);
  const [isReceiveInputActive, setIsReceiveInputActive] = useState(false);

  const testBalance = 1000;
  const handleBalanceMaxClick = () => {
    setValue("amountSent", testBalance);
    setIsReceiveInputActive(false);
  };

  // Effect to calculate receive amount based on send amount and rate
  useEffect(() => {
    if (rate && (amountSent || amountReceived)) {
      if (isReceiveInputActive) {
        setValue(
          "amountSent",
          Number((Number(amountReceived) / rate).toFixed(4)),
        );
      } else {
        setValue("amountReceived", Number((rate * amountSent).toFixed(4)));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amountSent, amountReceived, rate]);

  // set the default value of the token and network
  useEffect(() => {
    register("token", { value: "USDT" });
    register("currency", { value: "KES" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

          {/* Amount to send & Token w/ wallet balance */}
          <div className="relative space-y-3.5 rounded-2xl bg-white px-4 py-3 dark:bg-neutral-900">
            <div className="flex items-center justify-between">
              <label
                htmlFor="amount-sent"
                className="text-gray-500 dark:text-white/80"
              >
                Send
              </label>
              {authenticated && token && (
                <div className="flex items-center gap-2">
                  <WalletIcon />
                  <p>{testBalance}</p>
                  <button
                    type="button"
                    onClick={handleBalanceMaxClick}
                    className="font-medium text-primary dark:text-primary"
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
                    value: 500,
                    message: `Max. amount is 500`,
                  },
                  pattern: {
                    value: /^\d+(\.\d{1,4})?$/,
                    message: "Max. of 4 decimal places + no leading dot",
                  },
                  onChange: () => setIsReceiveInputActive(false),
                })}
                className="w-full rounded-xl border-b border-transparent bg-transparent py-2 text-2xl text-neutral-900 outline-none transition-all placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed dark:bg-neutral-900 dark:text-white/80 dark:placeholder:text-white/30"
                placeholder="0"
                title="Enter amount to send"
              />

              <FormDropdown
                defaultTitle="Select token"
                data={tokens}
                defaultSelectedItem="USDT"
                onSelect={(selectedToken) => setValue("token", selectedToken)}
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
              className="text-gray-500 dark:text-white/80"
            >
              Receive
            </label>

            <div className="flex items-center justify-between gap-2">
              <input
                id="amount-received"
                type="number"
                step="0.0001"
                {...register("amountReceived", {
                  disabled: !token,
                  onChange: () => setIsReceiveInputActive(true),
                })}
                className="w-full rounded-xl border-b border-transparent bg-transparent py-2 text-2xl text-neutral-900 outline-none transition-all placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed dark:bg-neutral-900 dark:text-white/80 dark:placeholder:text-white/30"
                placeholder="0"
                title="Enter amount to receive"
              />

              <FormDropdown
                defaultTitle="Select currency"
                data={currencies}
                defaultSelectedItem="KES"
                onSelect={(selectedCurrency) =>
                  setValue("currency", selectedCurrency)
                }
                className="min-w-52"
              />
            </div>
            {/* {errors.amountReceived && (
              <InputError message={errors.amountReceived.message} />
            )} */}
          </div>
        </div>

        {/* Recipient and memo */}
        <div className="space-y-2 rounded-2xl bg-gray-50 p-2 dark:bg-neutral-800">
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
                required: { value: true, message: "Add description" },
              })}
              className="w-full rounded-xl border border-gray-300 bg-transparent py-2 pl-8 pr-4 text-sm text-neutral-900 transition-all placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-50 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed dark:border-white/20 dark:bg-neutral-900 dark:text-white/80 dark:placeholder:text-white/30 dark:focus-visible:ring-offset-neutral-900"
              placeholder="Add description"
              maxLength={25}
            />
          </div>
          {/* {errors.memo && <InputError message={errors.memo.message} />} */}
        </div>

        {ready && authenticated && !isUserVerified && (
          <KycModal setIsUserVerified={setIsUserVerified} />
        )}

        {ready && !authenticated && (
          <button type="button" className={primaryBtnClasses} onClick={login}>
            Get Started
          </button>
        )}

        {isUserVerified && (
          <button
            type="submit"
            className={primaryBtnClasses}
            disabled={!isDirty || !isValid}
          >
            Swap
          </button>
        )}

        <AnimatePresence>
          {rate > 0 && (
            <AnimatedComponent
              variant={slideInOut}
              className="flex w-full flex-col justify-between gap-2 text-xs text-gray-500 transition-all dark:text-white/30 sm:flex-row sm:items-center"
            >
              <div className="min-w-fit">
                1 {token} ~ {isFetchingRate ? "..." : rate} {currency}
              </div>
              <div className="ml-auto flex w-full flex-col justify-end gap-2 sm:flex-row sm:items-center">
                <div className="h-px w-1/2 flex-shrink bg-gradient-to-tr from-white to-gray-300 dark:bg-gradient-to-tr dark:from-neutral-900 dark:to-neutral-700 sm:w-full" />
                <p className="min-w-fit">
                  Swap usually completes in 15s or less
                </p>
              </div>
            </AnimatedComponent>
          )}
        </AnimatePresence>
      </form>
    </>
  );
};
