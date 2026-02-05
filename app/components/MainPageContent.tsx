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
import {
  STEPS,
  type FormData,
  type InstitutionProps,
  type RecipientDetails,
  type StateProps,
  type TransactionStatusType,
} from "../types";
import { usePrivy } from "@privy-io/react-auth";
import { useStep } from "../context/StepContext";
import { clearFormState, getBannerPadding } from "../utils";
import { useSearchParams } from "next/navigation";
import { HomePage } from "./HomePage";
import { useNetwork } from "../context/NetworksContext";
import { useBlockFestModal } from "../context/BlockFestModalContext";
import { useInjectedWallet } from "../context";
import { useWalletAddress } from "../hooks/useWalletAddress";

const PageLayout = ({
  authenticated,
  ready,
  currentStep,
  transactionFormComponent,
  isRecipientFormOpen,
  isBlockFestReferral,
}: {
  authenticated: boolean;
  ready: boolean;
  currentStep: string;
  transactionFormComponent: React.ReactNode;
  isRecipientFormOpen: boolean;
  isBlockFestReferral: boolean;
}) => {
  const { claimed, resetClaim } = useBlockFestClaim();
  const { user } = usePrivy();
  const { isOpen, openModal, closeModal } = useBlockFestModal();
  const { isInjectedWallet } = useInjectedWallet();
  const walletAddress = useWalletAddress();

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

export function MainPageContent() {
  const searchParams = useSearchParams();
  const { authenticated, ready, getAccessToken } = usePrivy();
  const { currentStep, setCurrentStep } = useStep();
  const { isInjectedWallet, injectedReady } = useInjectedWallet();
  const { selectedNetwork } = useNetwork();
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

  const providerErrorShown = useRef(false);
  const failedProviders = useRef<Set<string>>(new Set());

  const [isUserVerified, setIsUserVerified] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);

  const formMethods = useForm<FormData, any, undefined>({
    mode: "onChange",
    defaultValues: {
      token: "USDC",
      amountSent: 0,
      amountReceived: 0,
      currency: "",
      recipientName: "",
      memo: "",
      institution: "",
      accountIdentifier: "",
      accountType: "bank",
    },
  });
  const { watch } = formMethods;
  const { currency, amountSent, amountReceived, token } = watch();

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
  };

  useEffect(function setPageLoadingState() {
    setOrderId("");
    setIsPageLoading(false);
  }, []);

  useEffect(
    function resetOnLogout() {
      // Reset form when user logs out (but not for injected wallets)
      if (!authenticated && !isInjectedWallet) {
        setCurrentStep(STEPS.FORM);
        setFormValues({} as FormData);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [authenticated, isInjectedWallet],
  );

  useEffect(function ensureDefaultToken() {
    // Make sure we always have USDC as default
    if (!formMethods.getValues("token")) {
      formMethods.reset({ token: "USDC" });
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

      if (!currency) return;

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

          const rate = await fetchRate({
            token,
            amount: amountSent || 100,
            currency,
            providerId,
            network: normalizeNetworkForRateFetch(selectedNetwork.chain.name),
          });
          setRate(rate.data);
          setRateError(null); // Clear error on success
        } catch (error) {
          let errorMsg = "Unknown error";
          if (error instanceof Error) {
            errorMsg = error.message;
            const lpParam =
              searchParams.get("provider") || searchParams.get("PROVIDER");
            if (
              shouldUseProvider &&
              lpParam &&
              !failedProviders.current.has(lpParam)
            ) {
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
          setRateError(errorMsg);
          toast.error("No available quote", { description: errorMsg });
        } finally {
          setIsFetchingRate(false);
        }
      };

      const debounceFetchRate = () => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => getRate(), 1000);
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
      searchParams,
      selectedNetwork,
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
    !!currency && (authenticated || isInjectedWallet) && isUserVerified;

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
      case STEPS.STATUS:
        return (
          <TransactionStatus
            formMethods={formMethods}
            transactionStatus={transactionStatus}
            createdAt={createdAt}
            orderId={orderId}
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
          isBlockFestReferral={isBlockFestReferral}
        />
      )}
    </div>
  );
}
