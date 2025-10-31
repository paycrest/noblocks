"use client";
import React, { useEffect, useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { usePrivy } from "@privy-io/react-auth";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { useNetwork } from "../context/NetworksContext";
import { useBalance, useTokens } from "../context";
import {
  classNames,
  formatDecimalPrecision,
  shouldUseInjectedWallet,
} from "../utils";
import { useSearchParams } from "next/navigation";
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
  InformationSquareIcon,
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
  const searchParams = useSearchParams();
  const { selectedNetwork } = useNetwork();
  const { client } = useSmartWallets();
  const { user, getAccessToken } = usePrivy();
  const { smartWalletBalance, refreshBalance, isLoading } = useBalance();
  const { allTokens } = useTokens();
  const useInjectedWallet = shouldUseInjectedWallet(searchParams);
  const isDark = useActualTheme();

  // State for network dropdown
  const [isNetworkDropdownOpen, setIsNetworkDropdownOpen] = useState(false);
  const networkDropdownRef = useRef<HTMLDivElement>(null);

  const formMethods = useForm<{
    amount: number;
    token: string;
    recipientAddress: string;
    recipientNetwork: string;
    recipientNetworkImageUrl: string;
  }>({ mode: "onChange" });
  const {
    handleSubmit,
    register,
    setValue,
    watch,
    reset,
    formState: { errors, isValid, isDirty },
  } = formMethods;
  const { token, amount, recipientNetwork, recipientNetworkImageUrl } = watch();

  const fetchedTokens: Token[] = allTokens[selectedNetwork.chain.name] || [];
  const tokens = fetchedTokens.map((token) => ({
    name: token.symbol,
    imageUrl: token.imageUrl,
  }));
  const tokenBalance = Number(smartWalletBalance?.balances?.[token]) || 0;

  // Networks for recipient network selection
  // Filter out Celo and Hedera Mainnet for non-injected wallets (smart wallets)
  const recipientNetworks = networks
    .filter((network) => {
      if (useInjectedWallet) return true;
      return (
        network.chain.name !== "Celo" && network.chain.name !== "Hedera Mainnet"
      );
    })
    .map((network) => ({
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
    if (!recipientNetwork) {
      setValue("recipientNetwork", selectedNetwork.chain.name);
      const networkImageUrl = getNetworkImageUrl(selectedNetwork, isDark);
      setValue("recipientNetworkImageUrl", networkImageUrl);
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
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (isNetworkDropdownOpen) {
          setIsNetworkDropdownOpen(false);
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isNetworkDropdownOpen]);

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
              "min-h-12 w-full rounded-xl border border-border-input py-3 pl-10 pr-4 text-sm transition-all placeholder:text-text-placeholder focus-within:border-gray-400 focus:outline-none disabled:cursor-not-allowed dark:border-white/20 dark:bg-black2 dark:placeholder:text-white/30 dark:focus-within:border-white/40",
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
              className={`flex items-center gap-3 ${
                recipientNetwork
                  ? "text-neutral-900 dark:text-white"
                  : "text-gray-400 dark:text-white/30"
              }`}
            >
              <img
                src={recipientNetworkImageUrl}
                alt={recipientNetwork}
                className="h-6 w-6 rounded-full"
              />
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
              className="scrollbar-hide absolute left-0 right-0 top-full z-50 mt-1 max-h-[144px] w-full overflow-y-auto overflow-x-hidden rounded-xl border border-border-input bg-white shadow-lg dark:border-white/20 dark:bg-neutral-800"
            >
              {recipientNetworks.map((network) => (
                <button
                  key={network.name}
                  type="button"
                  role="option"
                  aria-selected={recipientNetwork === network.name}
                  onClick={() => {
                    setValue("recipientNetwork", network.name);
                    setValue("recipientNetworkImageUrl", network.imageUrl);
                    setIsNetworkDropdownOpen(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setValue("recipientNetwork", network.name);
                      setValue("recipientNetworkImageUrl", network.imageUrl);
                      setIsNetworkDropdownOpen(false);
                    }
                  }}
                  className="flex w-full min-w-0 items-center gap-3 px-4 py-3 text-left transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-gray-50 focus:bg-gray-50 dark:hover:bg-white/5 dark:focus:bg-white/5"
                >
                  <Image
                    src={network.imageUrl}
                    alt={network.name}
                    className="h-6 w-6 rounded-full"
                    width={24}
                    height={24}
                  />
                  <span className="truncate text-sm font-medium text-neutral-900 dark:text-white">
                    {network.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Amount field */}
      <div className="w-full max-w-full space-y-2">
        <div className="flex h-fit min-h-[94px] w-full flex-col gap-3 rounded-2xl border-[0.3px] border-border-input bg-transparent px-4 py-3 dark:border-white/20 dark:bg-black2">
          <div className="flex justify-between gap-1">
            <label
              htmlFor="amount"
              className="text-sm font-medium text-text-secondary dark:text-white/70"
            >
              Amount
            </label>
            {token && (
              <div className="flex items-center gap-2">
                <Wallet01Icon
                  size={16}
                  className="text-icon-outline-secondary dark:text-white/50"
                />
                <span className="text-sm font-normal text-neutral-900 dark:text-white">
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
            )}
          </div>

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
              className={`w-full bg-transparent text-3xl font-medium outline-none transition-all placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed dark:placeholder:text-white/30 ${
                errors.amount
                  ? "text-red-500 dark:text-red-500"
                  : "text-neutral-900 dark:text-white"
              }`}
              placeholder="0"
              title="Enter amount to send"
            />

            <FormDropdown
              defaultTitle="Select currency"
              data={tokens}
              defaultSelectedItem={"Select currency"}
              isCTA={true}
              onSelect={(selectedToken: string) =>
                setValue("token", selectedToken)
              }
              className="min-w-32"
              dropdownWidth={192}
            />
          </div>
        </div>
        {errors.amount && (
          <AnimatedComponent
            variant={slideInOut}
            className="relative left-2 top-1 text-xs text-red-500"
          >
            {errors.amount.message}
          </AnimatedComponent>
        )}
      </div>

      {/* Network compatibility warning */}
      {showNetworkWarning && (
        <div className="mb-4 flex h-[48px] w-full items-start justify-start gap-0.5 rounded-xl bg-warning-background/[8%] px-3 py-2 dark:bg-warning-background/[8%]">
          <InformationSquareIcon className="-mt-0.5 mr-2 h-[24px] w-[24px] text-warning-foreground dark:text-warning-text" />
          <p className="text-wrap text-xs font-light leading-tight text-warning-foreground dark:text-warning-text">
            Ensure that the withdrawal address supports {recipientNetwork}{" "}
            network to avoid loss of funds.
          </p>
        </div>
      )}

      {/* Submit button */}
      <button
        type="submit"
        className={classNames(
          "min-h-12 w-full rounded-xl px-4 py-3 text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-lavender-500 focus:ring-offset-2 disabled:cursor-not-allowed dark:focus:ring-offset-neutral-900",
          !isValid || !isDirty || isConfirming || !token || !(amount > 0)
            ? "bg-gray-300 text-gray-500 dark:bg-white/10 dark:text-white/50"
            : "bg-lavender-500 text-white hover:bg-lavender-600 dark:hover:bg-lavender-600",
        )}
        disabled={
          !isValid || !isDirty || isConfirming || !token || !(amount > 0)
        }
      >
        {isConfirming ? "Confirming..." : "Continue"}
      </button>
    </form>
  );
};
