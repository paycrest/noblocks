"use client";

import { useState, useMemo, useEffect } from "react";
import { ArrowDown02Icon } from "hugeicons-react";
import { useRouter } from "next/navigation";
import { ImSpinner3 } from "react-icons/im";

import { FormDropdown } from "../components";
import { acceptedCurrencies } from "../mocks";
import { fetchSupportedTokens, currencyToCountryCode } from "../utils";

export function HomePageForm() {
  // Use a default network for demo (Polygon)
  const defaultNetwork = "Arbitrum One";
  const fetchedTokens = fetchSupportedTokens(defaultNetwork) || [];
  const tokens = fetchedTokens.map((token) => ({
    name: token.symbol,
    imageUrl: token.imageUrl,
  }));

  const router = useRouter();

  // UI state only
  const [selectedToken, setSelectedToken] = useState<string>(
    tokens[0]?.name || "",
  );
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
  const [selectedCurrency, setSelectedCurrency] = useState<string>(
    currencies[0]?.name || "",
  );
  const [amountSent, setAmountSent] = useState("");
  const [amountReceived, setAmountReceived] = useState("");

  // Mock or fetch a rate (replace with real fetch if available)
  const [rate, setRate] = useState<number>(0);
  const [isFetchingRate, setIsFetchingRate] = useState(false);

  // Simulate fetching rate (replace with real fetch logic if needed)
  useEffect(() => {
    setIsFetchingRate(true);
    // Simulate async fetch
    const timeout = setTimeout(() => {
      setRate(1200); // 1 Token = 1200 Currency (mock)
      setIsFetchingRate(false);
    }, 700); // Simulate network delay
    return () => clearTimeout(timeout);
  }, [selectedToken, selectedCurrency]);

  // Track which input is active for direction of calculation
  const [activeInput, setActiveInput] = useState<"send" | "receive">("send");

  // Auto-calculate receive or send amount based on active input
  useEffect(() => {
    if (isFetchingRate) return;
    if (
      activeInput === "send" &&
      amountSent &&
      !isNaN(Number(amountSent)) &&
      rate > 0
    ) {
      const calculated = (parseFloat(amountSent) * rate).toFixed(2);
      setAmountReceived(calculated);
    } else if (
      activeInput === "receive" &&
      amountReceived &&
      !isNaN(Number(amountReceived)) &&
      rate > 0
    ) {
      const calculated = (parseFloat(amountReceived) / rate).toFixed(4);
      setAmountSent(calculated);
    }
  }, [amountSent, amountReceived, rate, activeInput, isFetchingRate]);

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

  // Track if input is focused for formatting
  const [isAmountSentFocused, setIsAmountSentFocused] = useState(false);
  const [isAmountReceivedFocused, setIsAmountReceivedFocused] = useState(false);

  // Handle input change for amountSent (raw, no formatting)
  const handleAmountSentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let input = e.target.value.replace(/,/g, "");
    if (input === "") {
      setAmountSent("");
      setActiveInput("send");
      return;
    }
    // Allow only numbers and decimal point
    if (!/^\d*(\.\d*)?$/.test(input)) return;
    // Only allow up to 4 decimal places
    if (input.includes(".")) {
      const decimals = input.split(".")[1];
      if (decimals && decimals.length > 4) return;
    }
    setAmountSent(input);
    setActiveInput("send");
  };

  // Handle input change for amountReceived (raw, no formatting)
  const handleAmountReceivedChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    let input = e.target.value.replace(/,/g, "");
    if (input === "") {
      setAmountReceived("");
      setActiveInput("receive");
      return;
    }
    if (!/^\d*(\.\d*)?$/.test(input)) return;
    if (input.includes(".")) {
      const decimals = input.split(".")[1];
      if (decimals && decimals.length > 4) return;
    }
    setAmountReceived(input);
    setActiveInput("receive");
  };

  // Format for display only when not focused
  const displayAmountSent = isAmountSentFocused
    ? amountSent
    : formatNumberWithCommasForDisplay(amountSent);
  const displayAmountReceived = isAmountReceivedFocused
    ? amountReceived
    : formatNumberWithCommasForDisplay(amountReceived);

  // Only require amountSent to be filled for enabling the button
  const isFormFilled = amountSent.trim() !== "";

  const handleGetStarted = () => {
    if (!isFormFilled) return;
    const params = new URLSearchParams({
      tokenAmount: amountSent.replace(/,/g, ""),
      currency: selectedCurrency,
      token: selectedToken,
    });
    router.push(`/swap/?${params.toString()}`);
  };

  return (
    <form
      className="z-50 mx-auto grid max-w-[27.3125rem] gap-4 pb-4 text-sm text-text-body transition-all dark:text-white sm:gap-2"
      noValidate
    >
      <div className="grid gap-2 rounded-[20px] bg-background-neutral p-2 dark:bg-white/5">
        <h3 className="px-2 py-1 text-base font-medium">Swap</h3>
        {/* Send section */}
        <div className="relative space-y-3.5 rounded-2xl bg-white px-4 py-3 dark:bg-surface-canvas">
          <div className="flex items-center justify-between">
            <label
              htmlFor="amount-sent"
              className="text-text-secondary dark:text-white/50"
            >
              Send
            </label>
          </div>
          <div className="flex items-center justify-between gap-2">
            <input
              id="amount-sent"
              type="text"
              inputMode="decimal"
              value={displayAmountSent}
              onChange={handleAmountSentChange}
              onFocus={() => setIsAmountSentFocused(true)}
              onBlur={() => setIsAmountSentFocused(false)}
              className="w-full rounded-xl border-b border-transparent bg-transparent py-2 text-2xl text-neutral-900 outline-none transition-all placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed dark:text-white/80 dark:placeholder:text-white/30"
              placeholder="0"
              title="Enter amount to send"
            />
            <FormDropdown
              defaultTitle={tokens[0]?.name || "Token"}
              data={tokens}
              defaultSelectedItem={selectedToken}
              onSelect={setSelectedToken}
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
        {/* Receive section */}
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
              type="text"
              inputMode="decimal"
              value={displayAmountReceived}
              onChange={handleAmountReceivedChange}
              onFocus={() => setIsAmountReceivedFocused(true)}
              onBlur={() => setIsAmountReceivedFocused(false)}
              className="w-full rounded-xl border-b border-transparent bg-transparent py-2 text-2xl text-neutral-900 outline-none transition-all placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed dark:text-white/80 dark:placeholder:text-white/30"
              placeholder="0"
              title="Enter amount to receive"
            />
            <FormDropdown
              defaultTitle={currencies[0]?.name || "Currency"}
              data={currencies}
              defaultSelectedItem={selectedCurrency}
              onSelect={setSelectedCurrency}
              className="min-w-64"
              isCTA={!selectedCurrency}
            />
          </div>
        </div>
      </div>

      {/* Get started button */}
      <button
        type="button"
        className={`w-full rounded-lg p-3 text-sm font-medium hover:opacity-90 dark:text-white ${
          isFormFilled
            ? "cursor-pointer bg-[#8B85F4] text-white"
            : "cursor-not-allowed bg-gray-300 text-gray-400 dark:bg-gray-700 dark:text-gray-500"
        }`}
        disabled={!isFormFilled}
        onClick={handleGetStarted}
      >
        Get started
      </button>
      {/* Show rate info if available and user has started typing */}
      <div className="relative">
        {rate > 0 &&
          (amountSent.trim() !== "" || amountReceived.trim() !== "") && (
            <div className="flex w-full flex-col justify-between gap-2 py-3 text-xs text-text-disabled transition-all dark:text-white/30 xsm:flex-row xsm:items-center">
              {selectedCurrency && (
                <div className="min-w-fit">
                  1 {selectedToken} ~{" "}
                  {isFetchingRate
                    ? "..."
                    : formatNumberWithCommasForDisplay(rate)}{" "}
                  {selectedCurrency}
                </div>
              )}
              <div className="ml-auto flex w-full flex-col justify-end gap-2 xsm:flex-row xsm:items-center">
                <div className="h-px w-1/2 flex-shrink bg-gradient-to-tr from-white to-gray-300 dark:bg-gradient-to-tr dark:from-neutral-900 dark:to-neutral-700 sm:w-full" />
                <p className="min-w-fit">Swap usually completes in 30s</p>
              </div>
            </div>
          )}
      </div>
    </form>
  );
}
