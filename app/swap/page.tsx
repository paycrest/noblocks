"use client"

import { useForm } from "react-hook-form";
import { useEffect, useState, useRef } from "react";
import { AnimatePresence } from "framer-motion";
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
} from "../components";
import { fetchRate, fetchSupportedInstitutions } from "../api/aggregator";
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
import { clearFormState } from "../utils";
import { useInjectedWallet } from "../context/InjectedWalletContext";
import FAQs from "../components/FAQs";
import { useSearchParams } from "next/navigation";

export default function SwapPage() {
  const searchParams = useSearchParams();
  const { authenticated, ready } = usePrivy();
  const { currentStep, setCurrentStep } = useStep();
  const { isInjectedWallet, injectedReady } = useInjectedWallet();

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
  const { currency, amountSent, token } = watch();

  // State props for child components
  const stateProps: StateProps = {
    formValues,
    rate,
    isFetchingRate,
    institutions,
    isFetchingInstitutions,
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
      if (!authenticated && !isInjectedWallet) {
        setCurrentStep(STEPS.FORM);
        setFormValues({} as FormData);
      }
    },
    [authenticated, isInjectedWallet],
  );

  useEffect(function ensureDefaultToken() {
    if (!formMethods.getValues("token")) {
      formMethods.reset({ token: "USDC" });
    }
  }, []);

  useEffect(
    function resetProviderErrorOnChange() {
      const sp = searchParams;
      const newProvider =
        sp.get("provider") || sp.get("PROVIDER");
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
      let timeoutId: NodeJS.Timeout;
      if (!currency) return;
      const getRate = async (shouldUseProvider = true) => {
        setIsFetchingRate(true);
        try {
          const sp = searchParams;
          const lpParam =
            sp.get("provider") || sp.get("PROVIDER");
          const shouldSkipProvider =
            lpParam && failedProviders.current.has(lpParam);
          const providerId =
            shouldUseProvider && lpParam && !shouldSkipProvider
              ? lpParam
              : undefined;
          const rate = await fetchRate({
            token,
            amount: amountSent || 1,
            currency,
            providerId,
          });
          setRate(rate.data);
        } catch (error) {
          if (error instanceof Error) {
            const sp = searchParams;
            const lpParam =
              sp.get("provider") || sp.get("PROVIDER");
            if (
              shouldUseProvider &&
              lpParam &&
              !failedProviders.current.has(lpParam)
            ) {
              toast.error(`${error.message} - defaulting to public rate`);
              if (lpParam) {
                failedProviders.current.add(lpParam);
              }
              providerErrorShown.current = true;
            }
            if (shouldUseProvider) {
              await getRate(false);
            }
          }
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
    [amountSent, currency, token, searchParams],
  );

  const handleFormSubmit = (data: FormData) => {
    setFormValues(data);
    setCurrentStep(STEPS.PREVIEW);
  };

  const handleBackToForm = () => {
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
  };

  const showLoading =
    isPageLoading ||
    (!ready && !isInjectedWallet) ||
    (isInjectedWallet && !injectedReady);

  const renderStep = () => {
    switch (currentStep) {
      case STEPS.FORM:
        return (
          <TransactionForm
            onSubmit={handleFormSubmit}
            formMethods={formMethods}
            stateProps={stateProps}
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
  };

  return (
    <div className="flex min-h-screen w-full flex-col gap-8">
      {showLoading ? (
        <Preloader isLoading={true} />
      ) : (
        <>
          <Disclaimer />
          <CookieConsent />
          {!isInjectedWallet && <NetworkSelectionModal />}

          <div id="swap">
            <AnimatePresence mode="wait">
              <AnimatedPage componentKey={currentStep}>
                {renderStep()}
              </AnimatedPage>
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  );
}