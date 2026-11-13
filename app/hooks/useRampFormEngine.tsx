"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { toast } from "sonner";

// Import the four v1 step components directly from their source files —
// never through the `@/app/components` barrel, which also re-exports heavy
// v1-only chrome (Navbar/WalletDetails/FundWalletForm) that pulls in
// `@privy-io/react-auth/smart-wallets`, an ESM-only module Jest can't parse.
// The v2 wallet drawer (RampDrawerFlow) must stay decoupled from that barrel.
import { TransactionForm } from "@/app/pages/TransactionForm";
import { TransactionPreview } from "@/app/pages/TransactionPreview";
import { MakePayment } from "@/app/pages/MakePayment";
import { TransactionStatus } from "@/app/pages/TransactionStatus";
import { fetchRate, fetchSupportedInstitutions } from "@/app/api/aggregator";
import {
  normalizeNetworkForRateFetch,
  clearFormState,
  networkSupportsOnramp,
  isOnrampFiatCurrencyCode,
  isStarknetChain,
  isTronChain,
} from "@/app/utils";
import { useMarketLiquidity } from "@/app/hooks/useMarketLiquidity";
import {
  fillableQuoteAmount,
  isSendAmountOutsideLiquidityBand,
  shouldSuppressNoProviderForLiquidity,
} from "@/app/lib/marketLiquidity";
import { toAggregatorToken, tokensEqual } from "@/app/lib/token-symbol";
import { mapReportAndAct } from "@/app/lib/toastMappedError";
import { reportClientError } from "@/app/lib/sentry.client";
import { isNoProviderError } from "@/app/lib/errorMessages";
import {
  trackAnalyticsEvent,
  ANALYTICS_EVENTS,
  ANALYTICS_PROPERTIES,
} from "@/app/hooks/analytics/analytics-utils";
import {
  STEPS,
  type FormData,
  type InstitutionProps,
  type RecipientDetails,
  type StateProps,
  type SwapMode,
  type TransactionStatusType,
  type V2FiatProviderAccountDTO,
} from "@/app/types";
import { useForm } from "react-hook-form";
import { useStep } from "@/app/context/StepContext";
import { useNetwork } from "@/app/context/NetworksContext";
import { useInjectedWallet, useBalance, useKYC } from "@/app/context";
import { useShouldUseEOA } from "@/app/hooks/useEIP7702Account";
import { useWalletAddress } from "@/app/hooks/useWalletAddress";

/**
 * Calculates the token amount to use for on-ramp rate queries.
 *
 * v2 `/rates/.../{token}/{amount}/{fiat}` expects `amount` in token units. On-ramp, the receive
 * (token) field is often 0 until a rate exists — use a peg-aware fiat-sized probe instead of `1`
 * so provider min/max match the user's order (e.g. CNGN ↔ NGN).
 *
 * @param token - The token symbol (e.g., "CNGN").
 * @param currency - The fiat currency (e.g., "NGN").
 * @param sentN - The amount sent in fiat units.
 * @param recvN - The amount received in token units.
 * @returns The calculated token amount for the rate query.
 */
function onrampRateQueryTokenAmount(
  token: string,
  currency: string,
  sentN: number,
  recvN: number,
): number {
  if (recvN > 0) return recvN;
  const t = (token || "").trim().toUpperCase();
  const c = (currency || "").trim().toUpperCase();
  if (t === "CNGN" && c === "NGN" && sentN > 0) {
    return sentN;
  }
  return 1;
}

/** Round amount to nearest significant figure for stable dedup keys. */
function bucketAmount(amount: number): number {
  if (amount <= 0) return 0;
  const digits = Math.floor(Math.log10(amount));
  const magnitude = 10 ** digits;
  return Math.round(amount / magnitude) * magnitude;
}

export type RampFormEngineOptions = {
  /** Initial `swapMode` for the form's `useForm` defaults. */
  initialSwapMode: SwapMode;
  /**
   * True when the caller fixes the swap direction for the whole session
   * (the v2 wallet Buy/Sell drawer, KAN-971, where the drawer title already
   * says "Buy" or "Sell") — threaded into `TransactionForm` so it hides its
   * side-toggle affordances the same way embed's `isSideLocked` already does.
   */
  lockSwapMode?: boolean;
};

/**
 * The transaction step engine shared by the legacy full-page `/widget` host
 * (`MainPageContent`) and the v2 wallet Buy/Sell drawer (`RampDrawerFlow`).
 *
 * Moved verbatim out of `MainPageContent` (KAN-971) so both hosts call one
 * implementation instead of each owning a copy of rate/institution fetching,
 * form state, and the FORM/PREVIEW/MAKE_PAYMENT/STATUS step switch. Page-only
 * concerns (referral modal gating, network auto-select, cookie/disclaimer
 * chrome, recipient migration, the embed `?side=`/host-config sync effects,
 * and the `useHomeTransactionFormMode` global-UI mirror, which nothing in
 * the v2 wallet reads) stay in `MainPageContent` — they are not part of the
 * transaction engine.
 */
export function useRampFormEngine({
  initialSwapMode,
  lockSwapMode = false,
}: RampFormEngineOptions) {
  const searchParams = useSearchParams();
  const { authenticated } = usePrivy();

  const { currentStep, setCurrentStep, setIsOnrampProviderDetailsOpen } =
    useStep();
  const { isInjectedWallet, injectedReady } = useInjectedWallet();
  const {
    smartWalletBalance,
    externalWalletBalance,
    injectedWalletBalance,
    starknetWalletBalance,
    tronWalletBalance,
    isLoading: isBalanceLoading,
  } = useBalance();
  const shouldUseEOA = useShouldUseEOA();
  const { selectedNetwork } = useNetwork();

  const [isFetchingRate, setIsFetchingRate] = useState(false);
  const [isFetchingInstitutions, setIsFetchingInstitutions] = useState(false);

  const [rate, setRate] = useState<number>(0);
  const [formValues, setFormValues] = useState<FormData>({} as FormData);
  const [institutions, setInstitutions] = useState<InstitutionProps[]>([]);

  const [selectedRecipient, setSelectedRecipient] =
    useState<RecipientDetails | null>(null);

  const [transactionStatus, setTransactionStatus] =
    useState<TransactionStatusType>("idle");
  const [createdAt, setCreatedAt] = useState<string>("");
  const [orderId, setOrderId] = useState<string>("");
  const [onrampPaymentAccount, setOnrampPaymentAccount] =
    useState<V2FiatProviderAccountDTO | null>(null);
  /** Snapshotted at order create — status fetch/save must not follow live swapMode. */
  const [activeOrderIsOnramp, setActiveOrderIsOnramp] = useState(false);

  const providerErrorShown = useRef(false);
  const failedProviders = useRef<Set<string>>(new Set());
  const noProviderEventGuard = useRef<Set<string>>(new Set());

  const [isUserVerified, setIsUserVerified] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);

  const formMethods = useForm<FormData, any, undefined>({
    mode: "onChange",
    defaultValues: {
      token: "",
      amountSent: 0,
      amountReceived: 0,
      // Tab default: valid `side` overrides; else Starknet first paint → off-ramp (see initialSwapModeForHomeForm).
      currency: "NGN",
      recipientName: "",
      memo: "",
      institution: "",
      accountIdentifier: "",
      accountType: "bank",
      walletAddress: "",
      kesChannel: "",
      businessNumber: "",
      swapMode: initialSwapMode,
      /** Must match `swapMode` or tabs vs recipient/rates disagree (e.g. Base defaults on-ramp). */
      isSwapped: initialSwapMode === "onramp",
      // Off-ramp defaults already include receive fiat (NGN); without this flag the UI
      // shows NGN but useSwapButton stays disabled until the user re-opens Receive.
      receiveDestinationExplicitlySelected: initialSwapMode === "offramp",
    },
  });
  const { watch, setValue } = formMethods;
  const {
    currency,
    amountSent,
    amountReceived,
    token,
    swapMode,
    receiveDestinationExplicitlySelected,
  } = watch();
  /** On-ramp (fiat→crypto): rates API `buy` side */
  const isOnrampRate = swapMode === "onramp";

  // Off-ramp: when send already exceeds the connected wallet balance, skip the
  // market book — max-liquidity limits are not actionable until the amount is fundable.
  const isWalletConnected =
    authenticated || (isInjectedWallet && injectedReady);
  /**
   * Mirrors the exact condition `TransactionForm` uses to reveal its own
   * recipient card (Figma b13/b14: the FORM step's content is vertically
   * centred only once this card is showing; b01/b02/b12 stay top-aligned).
   * Exposed here — not a "centered" flag — so a host that cares about layout
   * can derive its own alignment from real state instead of this engine
   * knowing anything about that host's presentation.
   */
  const isRecipientSectionVisible = Boolean(
    receiveDestinationExplicitlySelected &&
      currency &&
      isWalletConnected &&
      isUserVerified,
  );
  const spendableTokenBalance = useMemo(() => {
    const activeBalance = isInjectedWallet
      ? injectedWalletBalance
      : isStarknetChain(selectedNetwork.chain)
        ? starknetWalletBalance
        : isTronChain(selectedNetwork.chain)
          ? tronWalletBalance
          : shouldUseEOA
            ? externalWalletBalance
            : smartWalletBalance;
    if (!activeBalance || !token) return 0;
    if (tokensEqual(token, "cNGN")) {
      return (
        activeBalance.rawBalances?.[token] ??
        activeBalance.rawBalances?.cNGN ??
        activeBalance.rawBalances?.CNGN ??
        activeBalance.balances[token] ??
        0
      );
    }
    return activeBalance.balances[token] ?? 0;
  }, [
    isInjectedWallet,
    injectedWalletBalance,
    selectedNetwork.chain,
    starknetWalletBalance,
    tronWalletBalance,
    shouldUseEOA,
    externalWalletBalance,
    smartWalletBalance,
    token,
  ]);
  const amountSentN = Number(amountSent) || 0;
  const skipMarketForInsufficientBalance =
    !isOnrampRate &&
    isWalletConnected &&
    !isBalanceLoading &&
    amountSentN > 0 &&
    amountSentN > spendableTokenBalance;

  // Live provider capacity for the current corridor. Owned here rather than in
  // the form because the rate request below also has to know it: quoting an
  // amount no provider can fill only earns a "no provider" error that the form
  // already states more usefully. Passed down through `stateProps` so both
  // read one poll. Paused while off-ramp send exceeds balance.
  const { envelope: liquidity, isLoading: isLoadingLiquidity } =
    useMarketLiquidity({
      enabled:
        Boolean(token) &&
        Boolean(currency) &&
        !skipMarketForInsufficientBalance &&
        (!isOnrampRate ||
          (isOnrampFiatCurrencyCode(currency) &&
            networkSupportsOnramp(selectedNetwork.chain))),
      side: isOnrampRate ? "buy" : "sell",
      token,
      currency,
      networkName: selectedNetwork.chain.name,
    });

  const { refreshStatus } = useKYC();
  const prevStepForKycRefreshRef = useRef<string | null>(null);

  useEffect(() => {
    const prev = prevStepForKycRefreshRef.current;
    prevStepForKycRefreshRef.current = currentStep;
    if (currentStep !== STEPS.FORM) return;
    if (prev === null || prev === STEPS.FORM) return;
    void refreshStatus(true);
  }, [currentStep, refreshStatus]);

  const walletAddress = useWalletAddress();

  // State props for child components
  const stateProps: StateProps = {
    formValues,
    setFormValues,

    rate,
    setRate,
    isFetchingRate,
    setIsFetchingRate,
    rateError,
    setRateError,

    liquidity,

    institutions,
    setInstitutions,
    isFetchingInstitutions,
    setIsFetchingInstitutions,

    selectedRecipient,
    setSelectedRecipient,

    orderId,
    setOrderId,
    setCreatedAt,
    setTransactionStatus,

    onrampPaymentAccount,
    setOnrampPaymentAccount,
    setActiveOrderIsOnramp,
  };

  useEffect(() => {
    const show =
      currentStep === STEPS.MAKE_PAYMENT &&
      Boolean(orderId) &&
      Boolean(onrampPaymentAccount);
    setIsOnrampProviderDetailsOpen(show);
  }, [
    currentStep,
    orderId,
    onrampPaymentAccount,
    setIsOnrampProviderDetailsOpen,
  ]);

  useEffect(function setPageLoadingState() {
    setOrderId("");
    setOnrampPaymentAccount(null);
    setActiveOrderIsOnramp(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    function resetOnLogout() {
      // Reset form when user logs out (but not for injected wallets)
      if (!authenticated && !isInjectedWallet) {
        setCurrentStep(STEPS.FORM);
        setFormValues({} as FormData);
        setOnrampPaymentAccount(null);
        setActiveOrderIsOnramp(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [authenticated, isInjectedWallet],
  );

  useEffect(function ensureDefaultToken() {
    // Off-ramp: default token to USDC. On-ramp: keep empty so Receive shows "Select token".
    if (formMethods.getValues("token")) return;
    if (formMethods.getValues("swapMode") === "offramp") {
      formMethods.setValue("token", "USDC", { shouldDirty: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    function resetProviderErrorOnChange() {
      // Reset error flag when switching providers
      const newProvider =
        searchParams.get("provider") || searchParams.get("PROVIDER");
      if (!failedProviders.current.has(newProvider || "")) {
        providerErrorShown.current = false;
      }
    },
    [searchParams],
  );

  useEffect(
    function resetNoProviderEventGuard() {
      noProviderEventGuard.current.clear();
    },
    [token, currency, selectedNetwork, isOnrampRate],
  );

  useEffect(
    function fetchInstitutionData() {
      async function getInstitutions(currencyValue: string) {
        if (!currencyValue) return;

        setIsFetchingInstitutions(true);

        const institutions = await fetchSupportedInstitutions(currencyValue);
        setInstitutions(institutions);

        setIsFetchingInstitutions(false);
      }

      getInstitutions(currency);
    },
    [currency],
  );

  useEffect(
    function handleRateFetch() {
      // Debounce rate fetching
      let timeoutId: NodeJS.Timeout;
      let active = true;

      const invalidate = () => {
        active = false;
        clearTimeout(timeoutId);
      };

      if (!currency) return invalidate;

      if (isOnrampRate && !token) return invalidate;

      // Only fetch rate if at least one amount is greater than 0
      if (!amountSent && !amountReceived) return invalidate;

      // Off-ramp amount exceeds spendable balance: form shows insufficient funds
      // and markets are paused — skip quoting so we don't surface liquidity /
      // no-provider noise for an amount the user cannot fund.
      if (skipMarketForInsufficientBalance) {
        setRateError(null);
        setIsFetchingRate(false);
        return invalidate;
      }

      // Nothing in this corridor is quotable. The form already says so
      // ("No liquidity available for X on Y right now"), and a request would
      // only add the aggregator's own no-provider error on top. An unknown
      // book leaves this false, so an outage still quotes as before.
      if (liquidity && !liquidity.viable) {
        setRateError(null);
        setIsFetchingRate(false);
        return invalidate;
      }

      // The corridor's first book is still in flight — true only until it
      // lands or fails, never on later polls. Quoting now would skip the
      // clamp below and ask for whatever amount carried over from the
      // previous corridor, which is how a tab switch used to produce a
      // no-provider toast.
      if (isLoadingLiquidity) return invalidate;

      const sentForLiquidity = Number(amountSent) || 0;

      // Above max or below min: the field already states the limit; a rate
      // request (especially on-ramp with a token probe) often returns the
      // aggregator's legacy no-provider string on top of that.
      if (isSendAmountOutsideLiquidityBand(liquidity, sentForLiquidity)) {
        setRateError(null);
        setIsFetchingRate(false);
        return invalidate;
      }

      const getRate = async (shouldUseProvider = true) => {
        if (!active) return;
        setIsFetchingRate(true);

        const lpParam =
          searchParams.get("provider") || searchParams.get("PROVIDER");

        // Skip using provider if it's already failed
        const shouldSkipProvider =
          lpParam && failedProviders.current.has(lpParam);

        // Aggregator GET /v2/rates/.../{token}/{amount}/{fiat} always expects `amount` in **token**
        // units (ValidateRate / provider min-max). Off-ramp: Send = token → amountSent. On-ramp:
        // Send = fiat → use computed token (amountReceived), else peg-aware probe, else 1.
        const sentN = Number(amountSent) || 0;
        const recvN = Number(amountReceived) || 0;
        const baseQueryAmount = isOnrampRate
          ? onrampRateQueryTokenAmount(token, currency, sentN, recvN)
          : sentN > 0
            ? sentN
            : 100;

        // Ask about an amount a provider will actually take: quoting one the
        // book has already ruled out returns the aggregator's no-provider
        // error, which toasts the same fact the field states better ("Up to X
        // available right now"). The form still rejects what was typed.
        const rateQueryAmount = fillableQuoteAmount(
          liquidity,
          sentN,
          baseQueryAmount,
        );

        const providerId =
          shouldUseProvider && lpParam && !shouldSkipProvider
            ? lpParam
            : undefined;
        const attemptedProviderRequest = Boolean(providerId);

        try {
          const rate = await fetchRate({
            token: toAggregatorToken(token),
            amount: rateQueryAmount,
            currency,
            providerId,
            network: normalizeNetworkForRateFetch(selectedNetwork.chain.name),
            side: isOnrampRate ? "buy" : "sell",
          });
          if (!active) return;
          setRate(rate.data);
          setRateError(null); // Clear error on success
        } catch (error) {
          if (!active) return;

          const suppressLiquidityNoProvider =
            isNoProviderError(error) &&
            shouldSuppressNoProviderForLiquidity(liquidity, sentN);

          if (error instanceof Error) {
            if (
              shouldUseProvider &&
              lpParam &&
              !failedProviders.current.has(lpParam)
            ) {
              reportClientError(error, {
                feature: "cngn-rate",
                phase: "provider-fallback",
                provider: lpParam,
              });
              if (!suppressLiquidityNoProvider) {
                toast.error(`${error.message} - defaulting to public rate`);
              }
              // Track failed provider
              if (lpParam) {
                failedProviders.current.add(lpParam);
              }
              providerErrorShown.current = true;
            }
            // Retry without provider ID if one was previously used
            if (attemptedProviderRequest) {
              await getRate(false);
              return;
            }

            // Emit "No Provider Found" event for terminal (public-rate) attempts
            if (isNoProviderError(error)) {
              const isTerminal = !lpParam || !shouldUseProvider;
              const side = isOnrampRate ? "buy" : "sell";
              const attemptKey = `${side}:${token}:${currency}:${normalizeNetworkForRateFetch(selectedNetwork.chain.name)}:${bucketAmount(rateQueryAmount)}`;

              if (isTerminal && !noProviderEventGuard.current.has(attemptKey)) {
                noProviderEventGuard.current.add(attemptKey);

                const props = {
                  [ANALYTICS_PROPERTIES.TOKEN_SYMBOL]: token,
                  [ANALYTICS_PROPERTIES.TRANSACTION_CURRENCY]: currency,
                  [ANALYTICS_PROPERTIES.NETWORK]: normalizeNetworkForRateFetch(
                    selectedNetwork.chain.name,
                  ),
                  [ANALYTICS_PROPERTIES.CHAIN_ID]: selectedNetwork.chain.id,
                  [ANALYTICS_PROPERTIES.ORDER_SIDE]: side,
                  [ANALYTICS_PROPERTIES.ORDER_TYPE]: isOnrampRate
                    ? "onramp"
                    : "offramp",
                  [ANALYTICS_PROPERTIES.AMOUNT_SENT]: sentN,
                  [ANALYTICS_PROPERTIES.AMOUNT_RECEIVED]: recvN,
                  query_amount: rateQueryAmount,
                  [ANALYTICS_PROPERTIES.PROVIDER_ID]: lpParam ?? null,
                  had_provider_param: !!lpParam,
                  is_fallback_attempt: !shouldUseProvider,
                  [ANALYTICS_PROPERTIES.WALLET_ADDRESS]: walletAddress ?? null,
                  error_message: error.message.slice(0, 200),
                  source: "rate_quote",
                };

                trackAnalyticsEvent(ANALYTICS_EVENTS.NO_PROVIDER_FOUND, props);

                reportClientError(error, {
                  feature: "no-provider-found",
                  ...props,
                });
              }
            }
          }

          if (suppressLiquidityNoProvider) {
            setRateError(null);
            return;
          }

          mapReportAndAct(error, {
            feature: "cngn-rate",
            onUserMessage: (userMsg) => {
              setRateError(userMsg);
              toast.error(userMsg);
            },
          });
        } finally {
          if (active) setIsFetchingRate(false);
        }
      };

      const debounceFetchRate = () => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => getRate(), 1000);
      };

      debounceFetchRate();

      return invalidate;
    },
    [
      amountSent,
      amountReceived,
      currency,
      token,
      isOnrampRate,
      searchParams,
      selectedNetwork,
      // Envelope identity is stable while the numbers hold (envelopesEqual),
      // so this re-runs when capacity actually moves, not on every poll.
      liquidity,
      isLoadingLiquidity,
      skipMarketForInsufficientBalance,
    ],
  );

  const handleFormSubmit = useCallback(
    (data: FormData) => {
      setFormValues(data);
      setCurrentStep(STEPS.PREVIEW);
    },
    [setFormValues, setCurrentStep],
  );

  const handleBackToForm = useCallback(() => {
    Object.entries(formValues).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        formMethods.setValue(key as keyof FormData, value);
      }
    });
    formMethods.setValue("institution", formValues.institution, {
      shouldTouch: true,
    });
    formMethods.setValue("recipientName", formValues.recipientName, {
      shouldTouch: true,
    });
    formMethods.setValue("accountIdentifier", formValues.accountIdentifier, {
      shouldTouch: true,
    });
    setCurrentStep(STEPS.FORM);
  }, [formValues, formMethods, setCurrentStep]);

  const renderStep = useCallback(() => {
    switch (currentStep) {
      case STEPS.FORM:
        return (
          <TransactionForm
            onSubmit={handleFormSubmit}
            formMethods={formMethods}
            stateProps={stateProps}
            isUserVerified={isUserVerified}
            setIsUserVerified={setIsUserVerified}
            lockSwapMode={lockSwapMode}
          />
        );
      case STEPS.PREVIEW:
        return (
          <TransactionPreview
            handleBackButtonClick={handleBackToForm}
            stateProps={stateProps}
            createdAt={createdAt}
          />
        );
      case STEPS.MAKE_PAYMENT:
        return (
          <MakePayment
            handleBackButtonClick={handleBackToForm}
            stateProps={stateProps}
          />
        );
      case STEPS.STATUS:
        return (
          <TransactionStatus
            formMethods={formMethods}
            transactionStatus={transactionStatus}
            createdAt={createdAt}
            orderId={orderId}
            isOnramp={activeOrderIsOnramp}
            clearForm={() => {
              clearFormState(formMethods);
              setSelectedRecipient(null);
              setActiveOrderIsOnramp(false);
              // Starting a new payment must not inherit the finished order's virtual
              // account, which would otherwise resurface the "Make payment" step.
              setOnrampPaymentAccount(null);
            }}
            clearTransactionStatus={() => {
              setTransactionStatus("idle");
            }}
            setTransactionStatus={setTransactionStatus}
            setCurrentStep={setCurrentStep}
            supportedInstitutions={institutions}
            setOrderId={setOrderId}
          />
        );
      default:
        return null;
    }
  }, [
    currentStep,
    handleFormSubmit,
    formMethods,
    stateProps,
    isUserVerified,
    lockSwapMode,
    handleBackToForm,
    createdAt,
    transactionStatus,
    orderId,
    institutions,
    setCurrentStep,
    activeOrderIsOnramp,
  ]);

  return {
    formMethods,
    stateProps,
    isUserVerified,
    setIsUserVerified,
    currentStep,
    setCurrentStep,
    renderStep,
    swapMode,
    transactionStatus,
    orderId,
    onrampPaymentAccount,
    isRecipientSectionVisible,
  };
}
