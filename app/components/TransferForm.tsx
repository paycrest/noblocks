"use client";
import React, { useEffect, useState, useRef, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { useSearchParams } from "next/navigation";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useShouldUseEOA } from "../hooks/useEIP7702Account";
import { useNetwork } from "../context/NetworksContext";
import { useBalance, useTokens } from "../context";
import { useStarknet } from "../context/StarknetContext";
import {
  formatDecimalPrecision,
  fetchBalanceForNetwork,
  shouldUseInjectedWallet,
} from "../utils";
import { validateWalletAddress } from "../lib/validation";
import { useSmartWalletTransfer } from "../hooks/useSmartWalletTransfer";
import { fetchSavedRecipients } from "../api/aggregator";
import { toast } from "sonner";
import { ArrowLeft02Icon } from "hugeicons-react";
import { Token, type MobileSheetView, type RecipientDetailsWithId } from "../types";
import { networks } from "../mocks";
import { getNetworkImageUrl } from "../utils";
import { useActualTheme } from "../hooks/useActualTheme";
import { tokensEqual } from "../lib/token-symbol";
import { TransferFormFields } from "./transfer/TransferFormFields";
import { TransferPickerModal } from "./transfer/TransferPickerModal";
import { TransferConfirmModal } from "./transfer/TransferConfirmModal";
import { TransferConfirmPanel } from "./transfer/TransferConfirmPanel";
import { TransferPendingModal } from "./transfer/TransferPendingModal";
import { TransferSuccessModal } from "./transfer/TransferSuccessModal";
import { TransferSuccessCompactModal } from "./transfer/TransferSuccessCompactModal";
import { SaveRecipientToggle } from "./transfer/SaveRecipientToggle";
import {
  formatTransferAmount,
  formatTransferCtaLabel,
  formatTransferFeeUsd,
  formatTransferShortAddress,
  isAddressAlreadySaved,
  isEvmRecipientNetwork,
  isUsdStablecoin,
  TRANSFER_COPY,
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

type TransferStep = "form" | "confirm" | "pending" | "success";
type TransferPickerKind = "token" | "network" | null;

export const TransferForm: React.FC<{
  onClose: () => void;
  onSuccess?: () => void;
  showBackButton?: boolean;
  setCurrentView?: React.Dispatch<React.SetStateAction<MobileSheetView>>;
  preferredTokenSymbol?: string;
  /**
   * Which host is rendering the form (KAN-973): "drawer" is the existing
   * right-side ActionDrawer (token-detail entry); "page" is the Home full-page
   * widget, where confirm replaces the form inline instead of overlaying it,
   * and success is the compact frame-97 modal instead of the rich receipt.
   */
  chrome?: "drawer" | "page";
  /**
   * Host-owned heading for the form step (Home: "Transfer funds" + subtitle).
   * Rendered only while the form is showing; confirm replaces this whole block.
   */
  formHeader?: ReactNode;
}> = ({
  onClose,
  onSuccess,
  showBackButton = false,
  setCurrentView,
  preferredTokenSymbol,
  chrome = "drawer",
  formHeader,
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

  // Which centred overlay is showing over the drawer form.
  const [transferStep, setTransferStep] = useState<TransferStep>("form");
  const [picker, setPicker] = useState<TransferPickerKind>(null);
  const [submittedValues, setSubmittedValues] =
    useState<TransferFormValues | null>(null);
  const confirmInFlightRef = useRef(false);
  const transferStartedAtRef = useRef<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [frozenElapsedSeconds, setFrozenElapsedSeconds] = useState(0);
  // Saved recipients, fetched once per confirm-step open, to hide the "Save
  // recipient" controls for an address already saved (KAN-973 AC6). A failed
  // fetch leaves this null, which `isAddressAlreadySaved` treats as "not
  // saved" — keep showing the controls rather than inventing an error state.
  const [savedRecipients, setSavedRecipients] = useState<
    RecipientDetailsWithId[] | null
  >(null);
  const [savedThisFlow, setSavedThisFlow] = useState(false);
  const rateLabel = useTransferRate(
    token,
    recipientNetwork || selectedNetwork.chain.name,
    true,
  );

  const showRecipientAddressError =
    Boolean(errors.recipientAddress) && Boolean(dirtyFields.recipientAddress);

  // Get the Network object for the selected recipient network
  const transferNetwork =
    networks.find((n) => n.chain.name === recipientNetwork) || selectedNetwork;

  const fetchedTokens: Token[] = allTokens[transferNetwork.chain.name] || [];
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

  // Refetch saved recipients each time the confirm step opens, so the
  // already-saved check (AC6) reflects any beneficiary saved elsewhere since
  // the form was last opened. No polling — one fetch per confirm open.
  // `getAccessToken` is read via a ref, not a dependency: Privy returns a new
  // closure identity on every render, so depending on it directly re-runs the
  // effect (and its setState) every render — an infinite fetch loop.
  const getAccessTokenRef = useRef(getAccessToken);
  useEffect(() => {
    getAccessTokenRef.current = getAccessToken;
  }, [getAccessToken]);

  useEffect(() => {
    if (transferStep !== "confirm") return;
    let cancelled = false;
    void (async () => {
      try {
        const accessToken = await getAccessTokenRef.current();
        if (!accessToken) return;
        const list = await fetchSavedRecipients(accessToken);
        if (!cancelled) setSavedRecipients(list);
      } catch {
        // Fetch failure: leave savedRecipients as-is, so the Save controls
        // keep showing rather than surfacing a new error state.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [transferStep]);

  useEffect(() => {
    if (isTransferSuccess && onSuccess) {
      onSuccess();
    }
  }, [isTransferSuccess, onSuccess]);

  const wasConfirmingRef = useRef(false);
  useEffect(() => {
    if (isConfirming) {
      wasConfirmingRef.current = true;
      confirmInFlightRef.current = true;
      // Capture the submitted values before the hook resets the form on success.
      setSubmittedValues(getValues());
      setTransferStep("pending");
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
      setTransferStep(isTransferSuccess ? "success" : "confirm");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirming, isTransferSuccess]);

  // Elapsed UI timer, started at the confirm click. Display only.
  useEffect(() => {
    if (!isConfirming) return;
    const tick = () => {
      const startedAt = transferStartedAtRef.current;
      setElapsedSeconds(
        startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0,
      );
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [isConfirming]);

  useEffect(() => {
    if (!isTransferSuccess) return;
    const startedAt = transferStartedAtRef.current;
    setFrozenElapsedSeconds(
      startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0,
    );
    setTransferStep("success");
  }, [isTransferSuccess]);

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

  const handleBalanceMaxClick = () => {
    const formattedBalance = formatDecimalPrecision(tokenBalance, 4);
    setValue("amount", formattedBalance, {
      shouldValidate: true,
      shouldDirty: true,
    });
  };

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
  const canContinue = Boolean(
    recipientNetwork &&
      token &&
      Number(amount) > 0 &&
      isValid &&
      isDirty &&
      !isConfirming,
  );

  const handleQuickAmount = (value: number) => {
    if (!isUsdStablecoin(token)) return;
    setValue("amount", value, {
      shouldValidate: true,
      shouldDirty: true,
    });
  };

  // Continue validates with the existing form rules, then opens the review.
  const submitForConfirm = handleSubmit(() => {
    setTransferStep("confirm");
  });

  // Only this handler calls the existing transfer function, behind the same
  // validation the form submit uses.
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

  const handleConfirmTransfer = () => {
    if (confirmInFlightRef.current || isConfirming) return;
    // Same guards as the form submit button.
    if (!(isValid && isDirty && token && Number(amount) > 0)) return;
    setSubmittedValues(getValues());
    confirmInFlightRef.current = true;
    transferStartedAtRef.current = Date.now();
    setElapsedSeconds(0);
    setFrozenElapsedSeconds(0);
    void submitConfirmedTransfer();
  };

  const handleBackToForm = () => {
    confirmInFlightRef.current = false;
    setTransferStep("form");
  };

  const resetFlowState = () => {
    confirmInFlightRef.current = false;
    transferStartedAtRef.current = null;
    setElapsedSeconds(0);
    setFrozenElapsedSeconds(0);
    setSubmittedValues(null);
    setSavedThisFlow(false);
    setSavedRecipients(null);
  };

  const handleNewPayment = () => {
    reset();
    resetFlowState();
    setTransferStep("form");
  };

  const handleBackHome = () => {
    reset();
    resetFlowState();
    setTransferStep("form");
    onClose();
  };

  const renderForm = () => {
    const amountField = register("amount", {
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
    const addressField = register("recipientAddress", {
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
    const isRecipientAlreadySaved = isAddressAlreadySaved(
      savedRecipients,
      recipientAddress,
    );
    const isCompletedRecipientAlreadySaved = isAddressAlreadySaved(
      savedRecipients,
      submittedValues?.recipientAddress,
    );
    const offerSaveBeneficiaryOnReceipt =
      isEvmRecipientNetwork(submittedValues?.recipientNetwork) &&
      Boolean(submittedValues?.recipientAddress) &&
      !isCompletedRecipientAlreadySaved &&
      !savedThisFlow;

    const showInlineConfirm = chrome === "page" && transferStep !== "form";
    const saveRecipientControl =
      isEvmRecipientNetwork(recipientNetwork) &&
      recipientAddress &&
      !isRecipientAlreadySaved ? (
        <SaveRecipientToggle
          walletAddress={recipientAddress}
          networkName={recipientNetwork ?? ""}
          networkImageUrl={recipientNetworkImageUrl}
          onSaved={() => setSavedThisFlow(true)}
          appearance={chrome === "page" ? "checkbox" : "switch"}
          label={
            chrome === "page"
              ? TRANSFER_COPY.saveRecipients
              : TRANSFER_COPY.saveRecipient
          }
        />
      ) : undefined;

    return (
      <>
        {showBackButton && setCurrentView ? (
          <div className="mb-2 flex items-center">
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
          </div>
        ) : null}
        {showInlineConfirm ? (
          <div className="mx-auto flex w-full max-w-[417px] flex-col gap-6">
            <TransferConfirmPanel
              chrome="page"
              onClose={handleBackToForm}
              onConfirm={handleConfirmTransfer}
              shortAddress={formatTransferShortAddress(recipientAddress)}
              amountLabel={formatTransferAmount(amount)}
              tokenSymbol={confirmTokenSymbol}
              tokenImageUrl={selectedToken?.imageUrl}
              networkName={recipientNetwork ?? ""}
              networkImageUrl={recipientNetworkImageUrl}
              feeLabel={formatTransferFeeUsd(TRANSFER_FEE_USD)}
              ctaLabel={formatTransferCtaLabel(confirmTokenSymbol, amount)}
              isSubmitting={isConfirming}
              saveRecipientControl={saveRecipientControl}
              subtitle={TRANSFER_COPY.confirmSubtitle}
              showCloseButton={false}
            />
          </div>
        ) : formHeader ? (
          <div className="flex w-full flex-col gap-[49px]">
            {formHeader}
            <TransferFormFields
            registerAmount={amountField}
            registerRecipientAddress={addressField}
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
            canContinue={canContinue}
            isConfirming={isConfirming}
            rateLabel={rateLabel}
            balanceError={balanceError}
            onOpenNetwork={() => setPicker("network")}
            onOpenToken={() => setPicker("token")}
            onMax={handleBalanceMaxClick}
            onQuickAmount={handleQuickAmount}
            onContinue={() => void submitForConfirm()}
            onSubmit={submitForConfirm}
          />
          </div>
        ) : (
          <TransferFormFields
            registerAmount={amountField}
            registerRecipientAddress={addressField}
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
            canContinue={canContinue}
            isConfirming={isConfirming}
            rateLabel={rateLabel}
            balanceError={balanceError}
            onOpenNetwork={() => setPicker("network")}
            onOpenToken={() => setPicker("token")}
            onMax={handleBalanceMaxClick}
            onQuickAmount={handleQuickAmount}
            onContinue={() => void submitForConfirm()}
            onSubmit={submitForConfirm}
          />
        )}

        <TransferPickerModal
          kind="network"
          isOpen={picker === "network"}
          onClose={() => setPicker(null)}
          networks={recipientNetworks}
          selectedName={recipientNetwork}
          onSelectNetwork={(name) => {
            const network = networks.find((item) => item.chain.name === name);
            setValue("recipientNetwork", name);
            setValue(
              "recipientNetworkImageUrl",
              network ? getNetworkImageUrl(network, isDark) : "",
            );
            setPicker(null);
          }}
        />

        <TransferPickerModal
          kind="token"
          isOpen={picker === "token"}
          onClose={() => setPicker(null)}
          tokens={fetchedTokens.map((item) => ({
            symbol: item.symbol,
            name: item.name,
            imageUrl: item.imageUrl,
            balance: balanceFor(item.symbol),
          }))}
          selectedSymbol={token}
          onSelectToken={(symbol) => {
            setValue("token", symbol);
            setPicker(null);
          }}
        />

        {chrome === "drawer" ? (
          <TransferConfirmModal
            isOpen={transferStep === "confirm"}
            onClose={handleBackToForm}
            onConfirm={handleConfirmTransfer}
            shortAddress={formatTransferShortAddress(recipientAddress)}
            amountLabel={formatTransferAmount(amount)}
            tokenSymbol={confirmTokenSymbol}
            tokenImageUrl={selectedToken?.imageUrl}
            networkName={recipientNetwork ?? ""}
            networkImageUrl={recipientNetworkImageUrl}
            feeLabel={formatTransferFeeUsd(TRANSFER_FEE_USD)}
            ctaLabel={formatTransferCtaLabel(confirmTokenSymbol, amount)}
            isSubmitting={isConfirming}
            saveRecipientControl={saveRecipientControl}
          />
        ) : null}

        <TransferPendingModal
          isOpen={transferStep === "pending"}
          onClose={() => setTransferStep("form")}
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

        {chrome === "drawer" ? (
          <TransferSuccessModal
            isOpen={transferStep === "success"}
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
            onBackHome={handleBackHome}
            onNewPayment={handleNewPayment}
            offerSaveBeneficiary={offerSaveBeneficiaryOnReceipt}
            recipientAddress={submittedValues?.recipientAddress}
            recipientNetworkName={submittedValues?.recipientNetwork}
            recipientNetworkImageUrl={submittedValues?.recipientNetworkImageUrl}
          />
        ) : (
          <TransferSuccessCompactModal
            isOpen={transferStep === "success"}
            amountLabel={formatTransferAmount(submittedValues?.amount)}
            tokenSymbol={completedTokenSymbol}
            explorerLink={getTxExplorerLink()}
            onClose={handleBackHome}
            offerSaveBeneficiary={offerSaveBeneficiaryOnReceipt}
            recipientAddress={submittedValues?.recipientAddress}
            recipientNetworkName={submittedValues?.recipientNetwork}
            recipientNetworkImageUrl={submittedValues?.recipientNetworkImageUrl}
          />
        )}
      </>
    );
  };

  return renderForm();
};
