"use client"

import { useSearchParams } from "next/navigation";
import { useState, useEffect, useRef, useMemo } from "react";
import { ImSpinner, ImSpinner3 } from "react-icons/im";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { AnimatePresence } from "framer-motion";
import { toast } from "sonner";

import {
  AnimatedComponent,
  primaryBtnClasses,
  slideInOut,
  FormDropdown,
  RecipientDetailsForm,
  KycModal,
  FundWalletModal,
  AnimatedModal,
} from "../components";
import { BalanceSkeleton } from "../components/BalanceSkeleton";
import type { TransactionFormProps, Token } from "../types";
import { acceptedCurrencies } from "../mocks";
import {
  classNames,
  fetchSupportedTokens,
  formatNumberWithCommas,
  currencyToCountryCode,
  reorderCurrenciesByLocation,
} from "../utils";
import { ArrowDown02Icon, NoteEditIcon, Wallet01Icon } from "hugeicons-react";
import { useSwapButton } from "../hooks/useSwapButton";
import { fetchKYCStatus, fetchRate } from "../api/aggregator";
import { useFundWalletHandler } from "../hooks/useFundWalletHandler";
import { useBalance, useInjectedWallet, useNetwork } from "../context";

export function HomePageForm() {
  const [isFundModalOpen, setIsFundModalOpen] = useState(false);
    const [formattedSentAmount, setFormattedSentAmount] = useState("");
    const [formattedReceivedAmount, setFormattedReceivedAmount] = useState("");
    const isFirstRender = useRef(true);
    // const { amountSent, amountReceived, token, currency } = watch();
  
    const currencies = useMemo(
      () =>
        acceptedCurrencies.map((item) => {
          const countryCode = currencyToCountryCode(item.name);
          return {
            ...item,
            imageUrl: `https://flagcdn.com/h24/${countryCode}.webp`,
          };
        }),
      [],
    );
  
    // state for reordered currencies
    const [orderedCurrencies, setOrderedCurrencies] = useState(currencies);
  
    // Improved function to format number with commas while preserving decimal places
    const formatNumberWithCommasForDisplay = (value: number | string): string => {
      if (value === undefined || value === null || value === "") return "";
  
      const valueStr = value.toString();
      if (valueStr === "0") return "0";
  
      // Handle case when input is just a decimal point
      if (valueStr === ".") return "0.";
  
      const parts = valueStr.split(".");
      // Add commas to the integer part
      const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  
      // Preserve the decimal part if it exists, ensuring max 4 decimal places
      if (parts.length > 1) {
        const decimalPart = parts[1].slice(0, 4); // Limit to 4 decimal places
        return `${integerPart}.${decimalPart}`;
      }
  
      return integerPart;
    };
  
    // Remove commas for calculation and validation
    const removeCommas = (value: string): string => {
      return value.replace(/,/g, "");
    };
  
    // useEffect(
    //   function updateFormattedAmounts() {
    //     if (amountSent !== undefined) {
    //       setFormattedSentAmount(formatNumberWithCommasForDisplay(amountSent));
    //     }
  
    //     if (amountReceived !== undefined) {
    //       setFormattedReceivedAmount(
    //         formatNumberWithCommasForDisplay(amountReceived),
    //       );
    //     }
    //   },
    //   [amountSent, amountReceived],
    // );
  return (
    <div className="mx-auto max-w-[27.3125rem]">
      <form
        action=""
        className="z-50 grid gap-4 pb-4 text-sm text-text-body transition-all dark:text-white sm:gap-2"
      >
        <div className="grid gap-2 rounded-[20px] bg-background-neutral p-2 dark:bg-white/5">
          <h3 className="px-2 py-1 text-base font-medium">Swap</h3>

          <div className="relative space-y-3.5 rounded-2xl bg-white px-4 py-3 dark:bg-surface-canvas">
            <div className="flex items-center justify-between">
              <label
                htmlFor="amount-sent"
                className="text-text-secondary dark:text-white/50"
              >
                Send
              </label>
              {/* <AnimatePresence>
                  {token && activeBalance && (
                    <AnimatedComponent
                      variant={slideInOut}
                      className="flex items-center gap-2"
                    >
                      <Wallet01Icon className="size-4 text-icon-outline-secondary dark:text-white/50" />
                      {isLoading ? (
                        <BalanceSkeleton className="w-24" />
                      ) : (
                        <>
                          <span
                            className={
                              amountSent > balance ? "text-red-500" : ""
                            }
                          >
                            {formatNumberWithCommasForDisplay(balance)} {token}
                          </span>
                          {balance > 0 && (
                            <button
                              type="button"
                              onClick={handleBalanceMaxClick}
                              className={classNames(
                                "font-medium text-lavender-500 dark:text-lavender-500",
                                balance === 0 ? "hidden" : "",
                              )}
                            >
                              Max
                            </button>
                          )}
                        </>
                      )}
                    </AnimatedComponent>
                  )}
                </AnimatePresence> */}
            </div>

            <div className="flex items-center justify-between gap-2">
              <input
                id="amount-sent"
                type="text"
                inputMode="decimal"
                className={`w-full rounded-xl border-b border-transparent bg-transparent py-2 text-2xl outline-none transition-all placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed dark:placeholder:text-white/30`}
                placeholder="0"
                title="Enter amount to send"
              />
            </div>
          </div>

          {/* Arrow showing swap direction */}
          <div className="absolute -bottom-5 left-1/2 z-10 w-fit -translate-x-1/2 rounded-xl border-4 border-background-neutral bg-background-neutral dark:border-white/5 dark:bg-surface-canvas">
            <div className="rounded-lg bg-white p-0.5 dark:bg-surface-canvas">
              <ArrowDown02Icon className="text-xl text-outline-gray dark:text-white/80" />
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
