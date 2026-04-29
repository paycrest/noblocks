"use client";

import { useForm } from "react-hook-form";
import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";

import {
  AnimatedPage,
  Preloader,
  TransactionForm,
  TransactionPreview,
  MakePayment,
  TransactionStatus,
  NetworkSelectionModal,
  CookieConsent,
  Disclaimer,
} from "./";
import BlockFestCashbackModal from "./blockfest/BlockFestCashbackModal";
import { useBlockFestClaim } from "../context/BlockFestClaimContext";
import { BlockFestClaimGate } from "./blockfest/BlockFestClaimGate";
import { useBlockFestReferral } from "../hooks/useBlockFestReferral";
import {
  fetchRate,
  fetchSupportedInstitutions,
  migrateLocalStorageRecipients,
} from "../api/aggregator";
import { normalizeNetworkForRateFetch } from "../utils";
import { mapReportAndAct } from "../lib/toastMappedError";
import { reportClientError } from "../lib/sentry.client";
import {
  STEPS,
  type FormData,
  type InstitutionProps,
  type RecipientDetails,
  type StateProps,
  type TransactionStatusType,
  type V2FiatProviderAccountDTO,
} from "../types";
import { usePrivy } from "@privy-io/react-auth";
import { useStep } from "../context/StepContext";
import { clearFormState, getBannerPadding } from "../utils";
import { useSearchParams } from "next/navigation";
import { HomePage } from "./HomePage";
import { useNetwork } from "../context/NetworksContext";
import { useBlockFestModal } from "../context/BlockFestModalContext";
import { useBalance, useInjectedWallet } from "../context";
import { getPreferredNetworkForBalances } from "../lib/getPreferredNetworkForBalances";
import { useWalletAddress } from "../hooks/useWalletAddress";
import { networks } from "../mocks";
const PageLayout = ({
  authenticated,
  ready,
  currentStep,
  transactionFormComponent,
  isRecipientFormOpen,
  isOnramp,
  isBlockFestReferral,
}: {
  authenticated: boolean;
  ready: boolean;
  currentStep: string;
  transactionFormComponent: React.ReactNode;
  isRecipientFormOpen: boolean;
  isOnramp: boolean;
  isBlockFestReferral: boolean;
}) => {
  const { claimed, resetClaim } = useBlockFestClaim();
  const { user } = usePrivy();
  const { isOpen, openModal, closeModal } = useBlockFestModal();
  const { isInjectedWallet } = useInjectedWallet();
  const walletAddress = useWalletAddress();

  useEffect(() => {
    if (!authenticated && !isInjectedWallet) {
      resetClaim();
    }
  }, [authenticated, isInjectedWallet, resetClaim]);

  return (
    <>
      <BlockFestClaimGate
        isReferred={isBlockFestReferral}
        authenticated={authenticated}
        ready={ready}
        userAddress={walletAddress ?? ""}
        onShowModal={openModal}
      />

      <Disclaimer />
      <CookieConsent />
      {!isInjectedWallet && <NetworkSelectionModal />}

      <BlockFestCashbackModal isOpen={isOpen} onClose={closeModal} />

      {currentStep === STEPS.FORM ? (
        <HomePage
          transactionFormComponent={transactionFormComponent}
          isRecipientFormOpen={isRecipientFormOpen}
          isOnramp={isOnramp}
          showBlockFestBanner={claimed === true}
        />
      ) : (
        <div className={`px-5 py-28 ${getBannerPadding()}`}>
          {transactionFormComponent}
        </div>
      )}
    </>
  );
};

/**
 * v2 `/rates/.../{token}/{amount}/{fiat}` expects `amount` in token units. On-ramp, the receive
 * (token) field is often 0 until a rate exists — use a peg-aware fiat-sized probe instead of `1`
 * so provider min/max match the user's order (e.g. CNGN ↔ NGN).
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

export function MainPageContent() {
  const searchParams = useSearchParams();
  const { authenticated, ready, getAccessToken, user } = usePrivy();
  const {
    currentStep,
    setCurrentStep,
    setIsOnrampProviderDetailsOpen,
  } = useStep();
  const { isInjectedWallet, injectedAddress, injectedReady } = useInjectedWallet();
  const { crossChainBalances, isLoading: isBalanceLoading } = useBalance();
  const { selectedNetwork, setDisplayedNetwork, setSelectedNetwork } =
    useNetwork();
  const { isBlockFestReferral } = useBlockFestReferral();
  const [isPageLoading, setIsPageLoading] = useState(true);
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

  const providerErrorShown = useRef(false);
  const failedProviders = useRef<Set<string>>(new Set());
  const autoSelectedNetworkSessionRef = useRef<string | null>(null);

  const [isUserVerified, setIsUserVerified] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);
  const [rateRefetchTrigger, setRateRefetchTrigger] = useState(0);

  const refetchRate = useCallback(() => {
    setRateRefetchTrigger((prev) => prev + 1);
  }, []);

  const formMethods = useForm<FormData, any, undefined>({
    mode: "onChange",
    defaultValues: {
      token: "",
      amountSent: 0,
      amountReceived: 0,
      // On-ramp is default: Send = fiat (NGN-only in UI); Receive = token (user picks — empty until select).
      currency: "NGN",
      recipientName: "",
      memo: "",
      institution: "",
      accountIdentifier: "",
      accountType: "bank",
      isSwapped: true,
      receiveDestinationExplicitlySelected: false,
    },
  });
  const { watch } = formMethods;
  const {
    currency,
    amountSent,
    amountReceived,
    token,
    isSwapped,
    receiveDestinationExplicitlySelected,
  } = watch();
  /** On-ramp (fiat→crypto): same as TransactionForm `isSwapped` / v2 `buy` side. */
  const isOnrampRate = Boolean(isSwapped);

  /**
   * On-ramp is not supported on Starknet. Switch to an EVM network and notify the user.
   */
  useEffect(
    function leaveStarknetForOnramp() {
      if (!isSwapped || selectedNetwork.chain.name !== "Starknet") return;
      const fallback = networks.find((n) => n.chain.name !== "Starknet");
      if (!fallback) return;

      if (isInjectedWallet) {
        toast.warning("Starknet isn’t supported for on-ramp.", {
          id: "onramp-starknet-injected",
          description: "Pick an EVM network in the network dropdown to continue.",
        });
        return;
      }

      setSelectedNetwork(fallback);
      toast.info("Starknet isn’t supported for on-ramp.", {
        description: `Switched network to ${fallback.chain.name}.`,
      });
    },
    [isSwapped, selectedNetwork.chain.name, setSelectedNetwork, isInjectedWallet],
  );

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
    setIsPageLoading(false);
  }, []);

  useEffect(
    function resetOnLogout() {
      // Reset form when user logs out (but not for injected wallets)
      if (!authenticated && !isInjectedWallet) {
        setCurrentStep(STEPS.FORM);
        setFormValues({} as FormData);
        setOnrampPaymentAccount(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [authenticated, isInjectedWallet],
  );

  useEffect(function ensureDefaultToken() {
    // Off-ramp: default token to USDC. On-ramp: keep empty so Receive shows "Select token".
    // Use === false so a transient undefined `isSwapped` is not treated as off-ramp.
    if (formMethods.getValues("token")) return;
    if (formMethods.getValues("isSwapped") === false) {
      formMethods.setValue("token", "USDC", { shouldDirty: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    function autoSelectLargestBalanceNetwork() {
      const sessionKey = isInjectedWallet
        ? injectedAddress
          ? `injected:${injectedAddress}`
          : null
        : authenticated && user?.id
          ? `privy:${user.id}`
          : null;

      if (!sessionKey) {
        autoSelectedNetworkSessionRef.current = null;
        return;
      }

      if (!ready || (isInjectedWallet && !injectedReady) || isBalanceLoading) {
        return;
      }

      if (autoSelectedNetworkSessionRef.current === sessionKey) {
        return;
      }

      const preferredNetwork = getPreferredNetworkForBalances(
        crossChainBalances,
        selectedNetwork.chain.name,
      );

      if (
        preferredNetwork &&
        preferredNetwork.chain.name !== selectedNetwork.chain.name
      ) {
        setDisplayedNetwork(preferredNetwork);
      }

      autoSelectedNetworkSessionRef.current = sessionKey;
    },
    [
      authenticated,
      crossChainBalances,
      injectedAddress,
      injectedReady,
      isBalanceLoading,
      isInjectedWallet,
      ready,
      selectedNetwork.chain.name,
      setDisplayedNetwork,
      user?.id,
    ],
  );

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

  const prevRateRefetchTriggerRef = useRef(rateRefetchTrigger);

  useEffect(
    function handleRateFetch() {
      // Debounce rate fetching
      let timeoutId: NodeJS.Timeout;
      const isExplicitRefetch = prevRateRefetchTriggerRef.current !== rateRefetchTrigger;
      prevRateRefetchTriggerRef.current = rateRefetchTrigger;

      if (!currency) return;

      if (isOnrampRate && !token) return;

      // Only fetch rate if at least one amount is greater than 0
      if (!amountSent && !amountReceived) return;

      const getRate = async (shouldUseProvider = true) => {
        setIsFetchingRate(true);
        try {
          const lpParam =
            searchParams.get("provider") || searchParams.get("PROVIDER");

          // Skip using provider if it's already failed
          const shouldSkipProvider =
            lpParam && failedProviders.current.has(lpParam);
          const providerId =
            shouldUseProvider && lpParam && !shouldSkipProvider
              ? lpParam
              : undefined;

          // Aggregator GET /v2/rates/.../{token}/{amount}/{fiat} always expects `amount` in **token**
          // units (ValidateRate / provider min-max). Off-ramp: Send = token → amountSent. On-ramp:
          // Send = fiat → use computed token (amountReceived), else peg-aware probe, else 1.
          const sentN = Number(amountSent) || 0;
          const recvN = Number(amountReceived) || 0;
          const rateQueryAmount = isOnrampRate
            ? onrampRateQueryTokenAmount(token, currency, sentN, recvN)
            : sentN > 0
              ? sentN
              : 100;

          const rate = await fetchRate({
            token,
            amount: rateQueryAmount,
            currency,
            providerId,
            network: normalizeNetworkForRateFetch(selectedNetwork.chain.name),
            side: isOnrampRate ? "buy" : "sell",
          });
          setRate(rate.data);
          setRateError(null); // Clear error on success
        } catch (error) {
          if (error instanceof Error) {
            const lpParam =
              searchParams.get("provider") || searchParams.get("PROVIDER");
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
              toast.error(`${error.message} - defaulting to public rate`);
              // Track failed provider
              if (lpParam) {
                failedProviders.current.add(lpParam);
              }
              providerErrorShown.current = true;
            }
            // Retry without provider ID if one was previously used
            if (shouldUseProvider) {
              await getRate(false);
              return;
            }
          }
          mapReportAndAct(error, {
            feature: "cngn-rate",
            onUserMessage: (userMsg) => {
              setRateError(userMsg);
              toast.error(userMsg);
            },
          });
        } finally {
          setIsFetchingRate(false);
        }
      };

      const debounceFetchRate = () => {
        clearTimeout(timeoutId);
        if (isExplicitRefetch) {
          getRate();
        } else {
          timeoutId = setTimeout(() => getRate(), 1000);
        }
      };

      debounceFetchRate();

      return () => {
        clearTimeout(timeoutId);
      };
    },
    [
      amountSent,
      amountReceived,
      currency,
      token,
      isSwapped,
      searchParams,
      selectedNetwork,
      rateRefetchTrigger,
    ],
  );

  // Migrate localStorage recipients to Supabase on app load
  useEffect(
    function migrateRecipients() {
      async function runMigration() {
        if (!authenticated || !ready || isInjectedWallet) {
          return;
        }

        try {
          const accessToken = await getAccessToken();
          if (accessToken) {
            await migrateLocalStorageRecipients(accessToken);
          }
        } catch (error) {
          console.error("Recipients migration failed:", error);
          // Don't show error to user - migration is silent
        }
      }

      runMigration();
    },
    [authenticated, ready, isInjectedWallet, getAccessToken],
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

  const showLoading =
    isPageLoading ||
    (!ready && !isInjectedWallet) ||
    (isInjectedWallet && !injectedReady);

  const isRecipientFormOpen =
    receiveDestinationExplicitlySelected &&
    (authenticated || isInjectedWallet) &&
    isUserVerified;

  const renderTransactionStep = useCallback(() => {
    switch (currentStep) {
      case STEPS.FORM:
        return (
          <TransactionForm
            onSubmit={handleFormSubmit}
            formMethods={formMethods}
            stateProps={stateProps}
            isUserVerified={isUserVerified}
            setIsUserVerified={setIsUserVerified}
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
            isOnramp={!!onrampPaymentAccount}
            clearForm={() => {
              clearFormState(formMethods);
              setSelectedRecipient(null);
            }}
            clearTransactionStatus={() => {
              setTransactionStatus("idle");
            }}
            setTransactionStatus={setTransactionStatus}
            setCurrentStep={setCurrentStep}
            supportedInstitutions={institutions}
            setOrderId={setOrderId}
            refetchRate={refetchRate}
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
    setIsUserVerified,
    handleBackToForm,
    createdAt,
    transactionStatus,
    orderId,
    institutions,
    setSelectedRecipient,
    setTransactionStatus,
    setCurrentStep,
    setOrderId,
    refetchRate,
  ]);

  const transactionFormComponent = useMemo(
    () => (
      <motion.div id="swap" layout>
        <AnimatePresence mode="wait">
          <AnimatedPage componentKey={currentStep}>
            {renderTransactionStep()}
          </AnimatedPage>
        </AnimatePresence>
      </motion.div>
    ),
    [currentStep, renderTransactionStep],
  );

  return (
    <div className="flex w-full flex-col">
      {showLoading ? (
        <Preloader isLoading={true} />
      ) : (
        <PageLayout
          authenticated={authenticated}
          ready={ready}
          currentStep={currentStep}
          transactionFormComponent={transactionFormComponent}
          isRecipientFormOpen={isRecipientFormOpen}
          isOnramp={isSwapped}
          isBlockFestReferral={isBlockFestReferral}
        />
      )}
    </div>
  );
}
