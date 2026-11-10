"use client";
import React, { useEffect, useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { useSearchParams } from "next/navigation";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useShouldUseEOA } from "../hooks/useEIP7702Account";
import { useNetwork } from "../context/NetworksContext";
import { useBalance, useTokens } from "../context";
import { useStarknet } from "../context/StarknetContext";
import {
  classNames,
  formatDecimalPrecision,
  fetchBalanceForNetwork,
  shouldUseInjectedWallet,
} from "../utils";
import { validateWalletAddress } from "../lib/validation";
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
import { Token, type MobileSheetView } from "../types";
import { networks } from "../mocks";
import { getNetworkImageUrl } from "../utils";
import { useActualTheme } from "../hooks/useActualTheme";
import { tokensEqual } from "../lib/token-symbol";
import Image from "next/image";
import { TransferV2Form } from "./transfer/TransferV2Form";
import { TransferPickerModal } from "./transfer/TransferPickerModal";
import { TransferConfirmModal } from "./transfer/TransferConfirmModal";
import { TransferPendingModal } from "./transfer/TransferPendingModal";
import { TransferSuccessModal } from "./transfer/TransferSuccessModal";
import { SaveRecipientToggle } from "./transfer/SaveRecipientToggle";
import {
  formatTransferAmount,
  formatTransferCtaLabel,
  formatTransferFeeUsd,
  formatTransferShortAddress,
  isEvmRecipientNetwork,
  isUsdStablecoin,
  TRANSFER_FEE_USD,
  useTransferRate,
} from "./transfer/transferConfig";

type TransferFormValues = {
  amount: number;
  token: string;
  recipientAddress: string;
  recipientNetwork: string;
  recipientNetworkImageUrl: string;
};

type TransferV2View = "form" | "confirm" | "pending" | "success";
type TransferV2Picker = "token" | "network" | null;

export const TransferForm: React.FC<{
  onClose: () => void;
  onSuccess?: () => void;
  showBackButton?: boolean;
  setCurrentView?: React.Dispatch<React.SetStateAction<MobileSheetView>>;
  preferredTokenSymbol?: string;
  variant?: "v1" | "v2";
}> = ({
  onClose,
  onSuccess,
  showBackButton = false,
  setCurrentView,
  preferredTokenSymbol,
  variant = "v1",
}) => {
  const searchParams = useSearchParams();
  const useInjectedWallet = shouldUseInjectedWallet(searchParams);
  const { selectedNetwork } = useNetwork();
  const { user, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const shouldUseEOA = useShouldUseEOA();
  const { refreshBalance, starknetWalletBalance } = useBalance();
  const { allTokens } = useTokens();
  const { walletId, publicKey, address, deployed } = useStarknet();
  const isDark = useActualTheme();

  // State for network dropdown
  const [isNetworkDropdownOpen, setIsNetworkDropdownOpen] = useState(false);
  const networkDropdownRef = useRef<HTMLDivElement>(null);

  // State for transfer network balance (fetched based on selected recipient network)
  const [transferNetworkBalance, setTransferNetworkBalance] = useState<{
    total: number;
    balances: Record<string, number>;
  } | null>(null);
  const [isBalanceLoading, setIsBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  const formMethods = useForm<TransferFormValues>({ mode: "onChange" });
  const {
    handleSubmit,
    register,
    setValue,
    watch,
    reset,
    trigger,
    getValues,
    formState: { errors, isValid, isDirty, dirtyFields },
  } = formMethods;
  const {
    token,
    amount,
    recipientAddress,
    recipientNetwork,
    recipientNetworkImageUrl,
  } = watch();

  // v2 flow state: which centred overlay is showing over the drawer form.
  const [v2View, setV2View] = useState<TransferV2View>("form");
  const [v2Picker, setV2Picker] = useState<TransferV2Picker>(null);
  const [submittedValues, setSubmittedValues] =
    useState<TransferFormValues | null>(null);
  const confirmInFlightRef = useRef(false);
  const transferStartedAtRef = useRef<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [frozenElapsedSeconds, setFrozenElapsedSeconds] = useState(0);
  const rateLabel = useTransferRate(
    variant === "v2" ? token : undefined,
    recipientNetwork || selectedNetwork.chain.name,
    variant === "v2",
  );

  const showRecipientAddressError =
    Boolean(errors.recipientAddress) && Boolean(dirtyFields.recipientAddress);

  // Get the Network object for the selected recipient network
  const transferNetwork =
    networks.find((n) => n.chain.name === recipientNetwork) || selectedNetwork;

  const fetchedTokens: Token[] = allTokens[transferNetwork.chain.name] || [];
  const tokens = fetchedTokens.map((token) => ({
    name: token.symbol,
    imageUrl: token.imageUrl,
  }));
  const tokenBalance = Number(transferNetworkBalance?.balances?.[token]) || 0;

  const recipientNetworks = networks
    .filter((network) => {
      if (useInjectedWallet) return true;
      return network.chain.name !== "Celo";
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
    selectedNetwork: transferNetwork,
    user,
    supportedTokens: fetchedTokens,
    getAccessToken,
    refreshBalance,
    starknetWallet: {
      walletId,
      publicKey,
      address,
      deployed,
    },
  });

  useEffect(() => {
    if (!preferredTokenSymbol) return;
    const match = fetchedTokens.find((t) =>
      tokensEqual(t.symbol, preferredTokenSymbol),
    );
    if (match) {
      setValue("token", match.symbol, { shouldDirty: false });
    }
  }, [preferredTokenSymbol, fetchedTokens, setValue]);

  useEffect(() => {
    // v2 starts with no network picked, matching the Figma "Select network" field.
    if (variant === "v2") return;
    if (!recipientNetwork) {
      setValue("recipientNetwork", selectedNetwork.chain.name);
      const networkImageUrl = getNetworkImageUrl(selectedNetwork, isDark);
      setValue("recipientNetworkImageUrl", networkImageUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const address = getValues("recipientAddress")?.trim();
    if (address) {
      void trigger("recipientAddress");
    }
  }, [recipientNetwork, trigger, getValues]);

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

  const wasConfirmingRef = useRef(false);
  useEffect(() => {
    if (variant !== "v2") return;
    if (isConfirming) {
      wasConfirmingRef.current = true;
      confirmInFlightRef.current = true;
      // Capture the submitted values before the hook resets the form on success.
      setSubmittedValues(getValues());
      setV2View("pending");
      return;
    }
    if (wasConfirmingRef.current) {
      wasConfirmingRef.current = false;
      confirmInFlightRef.current = false;
      if (isTransferSuccess) {
        const startedAt = transferStartedAtRef.current;
        setFrozenElapsedSeconds(
          startedAt
            ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
            : 0,
        );
      }
      // Success opens the receipt; a failure returns to the review step so the
      // user can retry (the existing hook owns the error toast).
      setV2View(isTransferSuccess ? "success" : "confirm");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirming, isTransferSuccess, variant]);

  // Elapsed UI timer, started at the confirm click. Display only.
  useEffect(() => {
    if (variant !== "v2" || !isConfirming) return;
    const tick = () => {
      const startedAt = transferStartedAtRef.current;
      setElapsedSeconds(
        startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0,
      );
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [isConfirming, variant]);

  useEffect(() => {
    if (variant !== "v2") return;
    if (!isTransferSuccess) return;
    const startedAt = transferStartedAtRef.current;
    setFrozenElapsedSeconds(
      startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0,
    );
    setV2View("success");
  }, [isTransferSuccess, variant]);

  // Fetch balance for the selected transfer network
  // After migration: use EOA; before: use SCW. Wait for wallet selection to settle so we don't show SCW (0) while loading.
  useEffect(() => {
    const fetchBalance = async () => {
      const smartWalletAccount = user?.linkedAccounts.find(
        (account) => account.type === "smart_wallet",
      );
      const embeddedWallet = wallets.find(
        (w) => w.walletClientType === "privy",
      );

      if (shouldUseEOA && !embeddedWallet) {
        setIsBalanceLoading(true);

        const timeout = setTimeout(() => {
          setTransferNetworkBalance({ total: 0, balances: {} });
          setBalanceError("Wallet unavailable");
          setIsBalanceLoading(false);
        }, 10_000);

        return () => clearTimeout(timeout);
      }

      const activeAddress = shouldUseEOA
        ? embeddedWallet?.address
        : smartWalletAccount?.address;

      if (!activeAddress) {
        setTransferNetworkBalance({ total: 0, balances: {} });
        setIsBalanceLoading(false);
        setBalanceError(null);
        return;
      }

      if (!transferNetwork) return;

      setIsBalanceLoading(true);
      setBalanceError(null);
      try {
        if (transferNetwork.chain.name === "Starknet") {
          setTransferNetworkBalance(starknetWalletBalance);
        } else {
          const balance = await fetchBalanceForNetwork(
            transferNetwork,
            activeAddress,
          );
          setTransferNetworkBalance(balance);
        }
        setBalanceError(null);
      } catch (error) {
        console.error("Error fetching transfer network balance:", error);
        // Set empty balance on error so UI doesn't show perpetual skeleton
        setTransferNetworkBalance({ total: 0, balances: {} });
        setBalanceError("Failed to fetch balance");
        toast.error("Failed to fetch balance for selected network");
      } finally {
        setIsBalanceLoading(false);
      }
    };

    fetchBalance();
  }, [
    transferNetwork,
    user?.linkedAccounts,
    wallets,
    shouldUseEOA,
    starknetWalletBalance,
  ]);

  // Close dropdown when clicking outside or pressing Escape
  useEffect(() => {
    if (!isNetworkDropdownOpen) return;

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
        setIsNetworkDropdownOpen(false);
      }
    };

    document.addEventListener("click", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("click", handleClickOutside);
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
            refreshBalance();
            handleFormClose();
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
        {isBalanceLoading || transferNetworkBalance === null ? (
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
          {isBalanceLoading || transferNetworkBalance === null ? (
            <BalanceSkeleton className="w-12" />
          ) : (
            `${tokenBalance} ${token}`
          )}
        </p>
      </div>
    </div>
  );

  if (variant === "v1" && isTransferSuccess) {
    return renderSuccessView();
  }

  // Check if networks match for warning
  const networksMatch = selectedNetwork.chain.name === recipientNetwork;
  const showNetworkWarning = recipientNetwork && !networksMatch;

  const onFormSubmit = (data: any) => {
    transfer({ ...data, resetForm: reset });
  };

  const balanceFor = (symbol: string): number => {
    const balances = transferNetworkBalance?.balances ?? {};
    const key = Object.keys(balances).find((item) => tokensEqual(item, symbol));
    return key ? Number(balances[key]) || 0 : 0;
  };

  const selectedToken = fetchedTokens.find((item) =>
    tokensEqual(item.symbol, token),
  );
  const v2CanContinue = Boolean(
    recipientNetwork &&
      token &&
      Number(amount) > 0 &&
      isValid &&
      isDirty &&
      !isConfirming,
  );

  const handleV2QuickAmount = (value: number) => {
    if (!isUsdStablecoin(token)) return;
    setValue("amount", value, {
      shouldValidate: true,
      shouldDirty: true,
    });
  };

  // Continue validates with the existing form rules, then opens the review.
  const v2SubmitForConfirm = handleSubmit(() => {
    setV2View("confirm");
  });

  // Only this handler calls the existing transfer function, behind the same
  // validation the v1 form submit uses.
  const onConfirmInvalid = () => {
    // Validation failed after the click: release the in-flight lock and the
    // timer, and keep the review modal open so the user can fix the form.
    confirmInFlightRef.current = false;
    transferStartedAtRef.current = null;
  };
  const submitConfirmedTransfer = handleSubmit(
    onFormSubmit,
    onConfirmInvalid,
  );

  const handleV2Confirm = () => {
    if (confirmInFlightRef.current || isConfirming) return;
    // Same guards as the v1 submit button.
    if (!(isValid && isDirty && token && Number(amount) > 0)) return;
    setSubmittedValues(getValues());
    confirmInFlightRef.current = true;
    transferStartedAtRef.current = Date.now();
    setElapsedSeconds(0);
    setFrozenElapsedSeconds(0);
    void submitConfirmedTransfer();
  };

  const handleV2Back = () => {
    confirmInFlightRef.current = false;
    setV2View("form");
  };

  const resetV2FlowState = () => {
    confirmInFlightRef.current = false;
    transferStartedAtRef.current = null;
    setElapsedSeconds(0);
    setFrozenElapsedSeconds(0);
    setSubmittedValues(null);
  };

  const handleV2NewPayment = () => {
    reset();
    resetV2FlowState();
    setV2View("form");
  };

  const handleV2BackHome = () => {
    reset();
    resetV2FlowState();
    setV2View("form");
    onClose();
  };

  const renderV2 = () => {
    const v2AmountField = register("amount", {
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
    });
    const v2AddressField = register("recipientAddress", {
      required: {
        value: true,
        message: "Recipient address is required",
      },
      validate: {
        addressForNetwork: (value) =>
          validateWalletAddress(
            value,
            recipientNetwork || selectedNetwork.chain.name,
          ),
      },
    });

    const confirmTokenSymbol = token ?? "";
    const completedTokenSymbol = submittedValues?.token ?? confirmTokenSymbol;
    const completedShortAddress = formatTransferShortAddress(
      submittedValues?.recipientAddress,
    );

    return (
      <>
        <TransferV2Form
          registerAmount={v2AmountField}
          registerRecipientAddress={v2AddressField}
          errors={errors}
          showRecipientAddressError={showRecipientAddressError}
          token={token}
          amount={amount}
          tokenOptions={fetchedTokens}
          tokenBalance={tokenBalance}
          isBalanceLoading={isBalanceLoading}
          hasBalanceSnapshot={transferNetworkBalance !== null}
          recipientNetwork={recipientNetwork}
          recipientNetworks={recipientNetworks}
          canContinue={v2CanContinue}
          isConfirming={isConfirming}
          rateLabel={rateLabel}
          balanceError={balanceError}
          onOpenNetwork={() => setV2Picker("network")}
          onOpenToken={() => setV2Picker("token")}
          onMax={handleBalanceMaxClick}
          onQuickAmount={handleV2QuickAmount}
          onContinue={() => void v2SubmitForConfirm()}
          onSubmit={v2SubmitForConfirm}
        />

        <TransferPickerModal
          kind="network"
          isOpen={v2Picker === "network"}
          onClose={() => setV2Picker(null)}
          networks={recipientNetworks}
          selectedName={recipientNetwork}
          onSelectNetwork={(name) => {
            const network = networks.find((item) => item.chain.name === name);
            setValue("recipientNetwork", name);
            setValue(
              "recipientNetworkImageUrl",
              network ? getNetworkImageUrl(network, isDark) : "",
            );
            setV2Picker(null);
          }}
        />

        <TransferPickerModal
          kind="token"
          isOpen={v2Picker === "token"}
          onClose={() => setV2Picker(null)}
          tokens={fetchedTokens.map((item) => ({
            symbol: item.symbol,
            name: item.name,
            imageUrl: item.imageUrl,
            balance: balanceFor(item.symbol),
          }))}
          selectedSymbol={token}
          onSelectToken={(symbol) => {
            setValue("token", symbol);
            setV2Picker(null);
          }}
        />

        <TransferConfirmModal
          isOpen={v2View === "confirm"}
          onClose={handleV2Back}
          onConfirm={handleV2Confirm}
          shortAddress={formatTransferShortAddress(recipientAddress)}
          amountLabel={formatTransferAmount(amount)}
          tokenSymbol={confirmTokenSymbol}
          tokenImageUrl={selectedToken?.imageUrl}
          networkName={recipientNetwork ?? ""}
          networkImageUrl={recipientNetworkImageUrl}
          feeLabel={formatTransferFeeUsd(TRANSFER_FEE_USD)}
          ctaLabel={formatTransferCtaLabel(confirmTokenSymbol, amount)}
          isSubmitting={isConfirming}
          saveRecipientControl={
            isEvmRecipientNetwork(recipientNetwork) && recipientAddress ? (
              <SaveRecipientToggle
                walletAddress={recipientAddress}
                networkName={recipientNetwork ?? ""}
                networkImageUrl={recipientNetworkImageUrl}
              />
            ) : undefined
          }
        />

        <TransferPendingModal
          isOpen={v2View === "pending"}
          onClose={() => setV2View("form")}
          amountLabel={formatTransferAmount(submittedValues?.amount)}
          tokenSymbol={completedTokenSymbol}
          tokenImageUrl={
            fetchedTokens.find((item) =>
              tokensEqual(item.symbol, completedTokenSymbol),
            )?.imageUrl
          }
          shortAddress={completedShortAddress}
          elapsedSeconds={elapsedSeconds}
        />

        <TransferSuccessModal
          isOpen={v2View === "success"}
          amountLabel={formatTransferAmount(submittedValues?.amount)}
          tokenSymbol={completedTokenSymbol}
          tokenImageUrl={
            fetchedTokens.find((item) =>
              tokensEqual(item.symbol, completedTokenSymbol),
            )?.imageUrl
          }
          shortAddress={completedShortAddress}
          elapsedSeconds={frozenElapsedSeconds}
          explorerLink={getTxExplorerLink()}
          onBackHome={handleV2BackHome}
          onNewPayment={handleV2NewPayment}
        />
      </>
    );
  };

  if (variant === "v2") {
    return renderV2();
  }

  return (
    <>
      <form
        onSubmit={handleSubmit(onFormSubmit)}
        className="z-50 w-full max-w-full space-y-4 overflow-x-hidden text-neutral-900 transition-all dark:text-white"
        noValidate
        data-testid="transfer-form"
        data-preferred-token={
          preferredTokenSymbol
            ? watch("token") || preferredTokenSymbol
            : undefined
        }
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
                validate: {
                  addressForNetwork: (value) =>
                    validateWalletAddress(
                      value,
                      recipientNetwork || selectedNetwork.chain.name,
                    ),
                },
              })}
              className={classNames(
                "min-h-12 w-full rounded-xl border border-border-input py-3 pl-10 pr-4 text-sm transition-all placeholder:text-text-placeholder focus-within:border-gray-400 focus:outline-none disabled:cursor-not-allowed dark:border-white/20 dark:bg-black2 dark:placeholder:text-white/30 dark:focus-within:border-white/40",
                showRecipientAddressError
                  ? "text-red-500 dark:text-red-500"
                  : "text-neutral-900 dark:text-white/80",
              )}
              placeholder="Enter recipient wallet address"
              maxLength={66}
            />
          </div>
          {showRecipientAddressError && (
            <AnimatedComponent
              variant={slideInOut}
              className="text-xs text-red-500"
            >
              {errors.recipientAddress?.message}
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
                className={`flex items-center gap-3 ${recipientNetwork
                  ? "text-neutral-900 dark:text-white"
                  : "text-gray-400 dark:text-white/30"
                  }`}
              >
                <img
                  src={recipientNetworkImageUrl}
                  alt={recipientNetwork}
                  className="h-6 w-6"
                />
                {recipientNetwork || "Select network"}
              </span>
              <ArrowDown01Icon
                className={`absolute right-3 top-1/2 size-4 -translate-y-1/2 text-outline-gray transition-transform dark:text-white/50 ${isNetworkDropdownOpen ? "rotate-180" : ""
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
                      className="h-6 w-6"
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
                    {isBalanceLoading || transferNetworkBalance === null ? (
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
                className={`w-full bg-transparent text-3xl font-medium outline-none transition-all placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed dark:placeholder:text-white/30 ${errors.amount
                  ? "text-red-500 dark:text-red-500"
                  : "text-neutral-900 dark:text-white"
                  }`}
                placeholder="0"
                title="Enter amount to send"
              />

              <FormDropdown
                defaultTitle="Select token"
                data={tokens}
                defaultSelectedItem={token || undefined}
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
          {balanceError && (
            <AnimatedComponent
              variant={slideInOut}
              className="relative left-2 top-1 text-xs text-red-500"
            >
              {balanceError}
            </AnimatedComponent>
          )}
        </div>

        {/* Network compatibility warning */}
        {showNetworkWarning && (
          <div className="mb-4 flex w-full min-w-0 items-start gap-2 rounded-xl bg-warning-background/[8%] px-3 py-2 dark:bg-warning-background/[8%]">
            <InformationSquareIcon className="mt-0.5 size-5 shrink-0 text-warning-foreground dark:text-warning-text" />
            <p className="min-w-0 flex-1 break-words text-xs font-light leading-snug text-warning-foreground dark:text-warning-text">
              Ensure that the recipient wallet address supports {recipientNetwork}{" "}
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
    </>
  );
};
