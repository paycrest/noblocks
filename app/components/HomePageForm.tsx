"use client";

import { useState, useMemo } from "react";
import { ArrowDown02Icon } from "hugeicons-react";
import { useRouter } from "next/navigation";

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
    // Allow empty input
    if (input === "") {
      setAmountSent("");
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
  };

  // Handle input change for amountReceived (raw, no formatting)
  const handleAmountReceivedChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    let input = e.target.value.replace(/,/g, "");
    if (input === "") {
      setAmountReceived("");
      return;
    }
    if (!/^\d*(\.\d*)?$/.test(input)) return;
    if (input.includes(".")) {
      const decimals = input.split(".")[1];
      if (decimals && decimals.length > 4) return;
    }
    setAmountReceived(input);
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
              <ArrowDown02Icon className="text-xl text-outline-gray dark:text-white/80" />
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
    </form>
  );
}
