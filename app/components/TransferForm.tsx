"use client";
import React, { useEffect, useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { usePrivy } from "@privy-io/react-auth";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { useNetwork } from "../context/NetworksContext";
import { useBalance, useTokens } from "../context";
import { classNames, formatDecimalPrecision } from "../utils";
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
  ArrowDown01Icon,
} from "hugeicons-react";
import { Token } from "../types";
import { networks } from "../mocks";
import { getNetworkImageUrl } from "../utils";
import { useActualTheme } from "../hooks/useActualTheme";
import Image from "next/image";

type MobileView = "wallet" | "settings" | "transfer" | "fund" | "history";

export const TransferForm: React.FC<{
  onClose: () => void;
  onSuccess?: () => void;
  showBackButton?: boolean;
  setCurrentView?: React.Dispatch<React.SetStateAction<MobileView>>;
}> = ({ onClose, onSuccess, showBackButton = false, setCurrentView }) => {
  const { selectedNetwork } = useNetwork();
  const { client } = useSmartWallets();
  const { user, getAccessToken } = usePrivy();
  const { smartWalletBalance, refreshBalance, isLoading } = useBalance();
  const { allTokens } = useTokens();
  const isDark = useActualTheme();

  // State for network dropdown
  const [isNetworkDropdownOpen, setIsNetworkDropdownOpen] = useState(false);
  const networkDropdownRef = useRef<HTMLDivElement>(null);

  // State for currency dropdown
  const [isCurrencyDropdownOpen, setIsCurrencyDropdownOpen] = useState(false);
  const currencyDropdownRef = useRef<HTMLDivElement>(null);

  const formMethods = useForm<{
    amount: number;
    token: string;
    recipientAddress: string;
    recipientNetwork: string;
  }>({ mode: "onChange" });
  const {
    handleSubmit,
    register,
    setValue,
    watch,
    reset,
    formState: { errors, isValid, isDirty },
  } = formMethods;
  const { token, amount, recipientNetwork } = watch();

  const fetchedTokens: Token[] = allTokens[selectedNetwork.chain.name] || [];
  const tokens = fetchedTokens.map((token) => ({
    name: token.symbol,
    imageUrl: token.imageUrl,
  }));
  const tokenBalance = Number(smartWalletBalance?.balances?.[token]) || 0;

  // Networks for recipient network selection
  const recipientNetworks = networks.map((network) => ({
    name: network.chain.name,
    imageUrl: getNetworkImageUrl(network, isDark),
  }));

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
    supportedTokens: fetchedTokens,
    getAccessToken,
  });

  useEffect(() => {
    if (!token) {
      setValue("token", "USDC");
    }
    if (!recipientNetwork) {
      setValue("recipientNetwork", selectedNetwork.chain.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Close dropdown when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        networkDropdownRef.current &&
        !networkDropdownRef.current.contains(event.target as Node)
      ) {
        setIsNetworkDropdownOpen(false);
      }
      if (
        currencyDropdownRef.current &&
        !currencyDropdownRef.current.contains(event.target as Node)
      ) {
        setIsCurrencyDropdownOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (isNetworkDropdownOpen) {
          setIsNetworkDropdownOpen(false);
        }
        if (isCurrencyDropdownOpen) {
          setIsCurrencyDropdownOpen(false);
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isNetworkDropdownOpen, isCurrencyDropdownOpen]);

  const handleBalanceMaxClick = () => {
    const formattedBalance = formatDecimalPrecision(tokenBalance, 4);
    setValue("amount", formattedBalance, {
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
        {isLoading || smartWalletBalance === null ? (
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
          {isLoading || smartWalletBalance === null ? (
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

  // Check if networks match for warning
  const networksMatch = selectedNetwork.chain.name === recipientNetwork;
  const showNetworkWarning = recipientNetwork && !networksMatch;

  return (
    <form
      onSubmit={handleSubmit((data) => transfer({ ...data, resetForm: reset }))}
      className="z-50 w-full max-w-full space-y-4 overflow-x-hidden text-neutral-900 transition-all dark:text-white"
      noValidate
    >
      {/* Header */}
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
        <h2 className="text-xl font-semibold text-text-body dark:text-white sm:flex-1">
          Transfer funds
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

      {/* Recipient wallet field */}
      <div className="w-full max-w-full space-y-2">
        <label
          htmlFor="recipient-address"
          className="text-sm font-medium text-text-secondary dark:text-white/70"
        >
          Recipient wallet
        </label>
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
              "min-h-12 w-full rounded-xl border border-border-input bg-transparent py-3 pl-10 pr-4 text-sm transition-all placeholder:text-text-placeholder focus-within:border-gray-400 focus:outline-none disabled:cursor-not-allowed dark:border-white/20 dark:placeholder:text-white/30 dark:focus-within:border-white/40",
              errors.recipientAddress
                ? "text-red-500 dark:text-red-500"
                : "text-neutral-900 dark:text-white/80",
            )}
            placeholder="Enter recipient wallet address"
            maxLength={42}
          />
        </div>
        {errors.recipientAddress && (
          <AnimatedComponent
            variant={slideInOut}
            className="text-xs text-red-500"
          >
            {errors.recipientAddress.message}
          </AnimatedComponent>
        )}
      </div>

      {/* Recipient network field */}
      <div className="w-full max-w-full space-y-2">
        <label
          htmlFor="recipient-network"
          className="text-sm font-medium text-text-secondary dark:text-white/70"
        >
          Recipient network
        </label>
        <div className="relative w-full" ref={networkDropdownRef}>
          <button
            type="button"
            onClick={() => setIsNetworkDropdownOpen(!isNetworkDropdownOpen)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setIsNetworkDropdownOpen(!isNetworkDropdownOpen);
              }
            }}
            className="min-h-12 w-full rounded-xl border border-border-input bg-transparent px-4 py-3 text-left text-sm transition-all focus-within:border-gray-400 focus:outline-none disabled:cursor-not-allowed dark:border-white/20 dark:focus-within:border-white/40"
            aria-haspopup="listbox"
            aria-expanded={isNetworkDropdownOpen}
            aria-controls="recipient-network-listbox"
          >
            <span
              className={
                recipientNetwork
                  ? "text-neutral-900 dark:text-white"
                  : "text-gray-400 dark:text-white/30"
              }
            >
              {recipientNetwork || "Select network"}
            </span>
            <ArrowDown01Icon
              className={`absolute right-3 top-1/2 size-4 -translate-y-1/2 text-outline-gray transition-transform dark:text-white/50 ${
                isNetworkDropdownOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {/* Dropdown Menu */}
          {isNetworkDropdownOpen && (
            <div 
              id="recipient-network-listbox"
              role="listbox"
              className="scrollbar-hide absolute left-0 right-0 top-full z-50 mt-1 max-h-60 w-full overflow-y-auto overflow-x-hidden rounded-xl border border-border-input bg-white shadow-lg dark:border-white/20 dark:bg-neutral-800"
            >
              {recipientNetworks.map((network) => (
                <button
                  key={network.name}
                  type="button"
                  role="option"
                  aria-selected={recipientNetwork === network.name}
                  onClick={() => {
                    setValue("recipientNetwork", network.name);
                    setIsNetworkDropdownOpen(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setValue("recipientNetwork", network.name);
                      setIsNetworkDropdownOpen(false);
                    }
                  }}
                  className="flex w-full min-w-0 items-center gap-3 px-4 py-3 text-left transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-gray-50 dark:hover:bg-white/5 focus:bg-gray-50 dark:focus:bg-white/5"
                >
                  <img
                    src={network.imageUrl}
                    alt={network.name}
                    className="h-6 w-6 rounded-full"
                  />
                  <span className="truncate text-sm font-medium text-neutral-900 dark:text-white">
                    {network.name}
                  </span>
                  {recipientNetwork === network.name && (
                    <div className="ml-auto h-2 w-2 rounded-full bg-lavender-500"></div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Amount field */}
      <div className="w-full max-w-full space-y-2">
        <div className="relative w-full rounded-lg border border-border-input bg-transparent dark:border-white/20 sm:h-[94px]">
          <label
            htmlFor="amount"
            className="absolute left-4 top-3 text-sm font-medium text-text-secondary dark:text-white/70"
          >
            Amount
          </label>
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
            className={`absolute bottom-3 left-4 right-20 bg-transparent text-3xl font-medium outline-none transition-all placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed dark:placeholder:text-white/30 ${
              errors.amount
                ? "text-red-500 dark:text-red-500"
                : "text-neutral-900 dark:text-white"
            }`}
            placeholder="0"
            title="Enter amount to send"
          />

          {/* Balance section - positioned on the right side */}
          <div className="absolute right-4 top-3 flex items-center gap-2">
            <Wallet01Icon className="size-4 text-icon-outline-secondary dark:text-white/50" />
            <span className="text-sm font-medium text-neutral-900 dark:text-white/80">
              {isLoading || smartWalletBalance === null ? (
                <BalanceSkeleton className="w-12" />
              ) : (
                `${tokenBalance} ${token}`
              )}
            </span>
            <button
              type="button"
              onClick={handleBalanceMaxClick}
              className="text-sm font-medium text-lavender-500 transition-colors hover:text-lavender-600"
            >
              Max
            </button>
          </div>

          <div className="absolute bottom-3 right-4" ref={currencyDropdownRef}>
            <div className="relative">
              <button
                type="button"
                onClick={() =>
                  setIsCurrencyDropdownOpen(!isCurrencyDropdownOpen)
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setIsCurrencyDropdownOpen(!isCurrencyDropdownOpen);
                  }
                }}
                className="flex items-center justify-between gap-0 rounded-3xl bg-lavender-600 text-white transition-all hover:bg-lavender-600 focus:outline-none focus:ring-2 focus:ring-lavender-500 focus:ring-offset-2 dark:focus:ring-offset-neutral-900 w-[145px] h-9 px-2"
                aria-haspopup="listbox"
                aria-expanded={isCurrencyDropdownOpen}
                aria-controls="currency-listbox"
              >
                <span className="text-sm font-medium">
                  {token || "Select currency"}
                </span>
                <ArrowDown01Icon
                  className={`size-4 transition-transform ${
                    isCurrencyDropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {/* Currency Dropdown Menu */}
              {isCurrencyDropdownOpen && (
                <div
                  id="currency-listbox"
                  role="listbox"
                  className="absolute right-0 top-full z-50 mt-2 rounded-lg border border-border-input bg-white shadow-lg dark:border-white/20 dark:bg-neutral-800 w-[230px] min-h-[112px] pt-2 pb-2"
                >
                  {tokens.map((tokenOption) => (
                    <button
                      key={tokenOption.name}
                      type="button"
                      role="option"
                      aria-selected={token === tokenOption.name}
                      onClick={() => {
                        setValue("token", tokenOption.name);
                        setIsCurrencyDropdownOpen(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setValue("token", tokenOption.name);
                          setIsCurrencyDropdownOpen(false);
                        }
                      }}
                      className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-white/5 focus:bg-gray-50 dark:focus:bg-white/5"
                    >
                      <img
                        src={tokenOption.imageUrl}
                        alt={tokenOption.name}
                        className="h-6 w-6 rounded-full"
                      />
                      <span className="text-sm font-medium text-neutral-900 dark:text-white">
                        {tokenOption.name}
                      </span>
                      {token === tokenOption.name && (
                        <div className="ml-auto h-2 w-2 rounded-full bg-lavender-500"></div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
        </div>
        {errors.amount && (
          <AnimatedComponent
            variant={slideInOut}
              className="absolute -bottom-6 left-0 text-xs text-red-500"
          >
            {errors.amount.message}
          </AnimatedComponent>
        )}
      </div>
        {/* {renderBalanceSection()} */}
      </div>

      {/* Network compatibility warning */}
      {showNetworkWarning && (
        <div className="bg-yellow-secondary dark:bg-yellow-secondary/20 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <div className="flex-shrink-0">
              <Image
                src="/images/information-square.png"
                alt="information square"
                width={16}
                height={16}
              />
            </div>
            <p className="text-yellow-primary dark:text-yellow-primary text-sm">
              Ensure that the withdrawal address supports {recipientNetwork}{" "}
              network to avoid loss of funds.
            </p>
          </div>
        </div>
      )}

      {/* Submit button */}
      <button
        type="submit"
        className={classNames(
          "min-h-12 w-full rounded-xl px-4 py-3 text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-lavender-500 focus:ring-offset-2 disabled:cursor-not-allowed dark:focus:ring-offset-neutral-900",
          !isValid || !isDirty || isConfirming
            ? "bg-gray-300 text-gray-500 dark:bg-white/10 dark:text-white/50"
            : "bg-lavender-500 text-white hover:bg-lavender-600 dark:hover:bg-lavender-600",
        )}
        disabled={!isValid || !isDirty || isConfirming}
      >
        {isConfirming ? "Confirming..." : "Continue"}
      </button>
    </form>
  );
};
