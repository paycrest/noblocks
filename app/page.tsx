"use client";
import { useForm } from "react-hook-form";
import { useEffect, useState, useRef, Suspense, JSX } from "react";
import { AnimatePresence } from "framer-motion";
import Cookies from "js-cookie";
import { useSearchParams } from "next/navigation";
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
} from "./components";
import { fetchRate, fetchSupportedInstitutions } from "./api/aggregator";
import {
  STEPS,
  type FormData,
  type InstitutionProps,
  type RecipientDetails,
  type StateProps,
  type TransactionStatusType,
} from "./types";
import { usePrivy } from "@privy-io/react-auth";
import { useStep } from "./context/StepContext";
import { clearFormState } from "./utils";
import { useNetwork } from "./context/NetworksContext";

/**
 * Represents the Home component.
 * This component handles the logic and rendering of the home page.
 */
function HomeImpl({ searchParams }: { searchParams: URLSearchParams }) {
  const { authenticated, ready } = usePrivy();
  const { currentStep, setCurrentStep } = useStep();

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

  // Form methods and watch
  const formMethods = useForm<FormData>({
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
      // Reset form if user logs out
      if (!authenticated) {
        setCurrentStep(STEPS.FORM);
        setFormValues({} as FormData);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [authenticated],
  );

  useEffect(function ensureDefaultToken() {
    // Default token to USDC if missing
    if (!formMethods.getValues("token")) {
      formMethods.reset({ token: "USDC" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    function resetProviderErrorOnChange() {
      // Reset providerErrorShown on query param change
      const newProvider = searchParams.get("lp") || searchParams.get("LP");
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
        setInstitutions(
          institutions.filter((institution) => institution.type === "bank"),
        );

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

      const getRate = async (shouldUseProvider = true) => {
        setIsFetchingRate(true);
        try {
          const lpParam = searchParams.get("lp") || searchParams.get("LP");

          // Skip using provider if it's already failed
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
            const lpParam = searchParams.get("lp") || searchParams.get("LP");
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
    // Preserve all form values when going back
    Object.entries(formValues).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        formMethods.setValue(key as keyof FormData, value);
      }
    });

    // Force the form to recognize we're returning from preview
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
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
      {isPageLoading || !ready ? (
        <Preloader isLoading={true} />
      ) : (
        <>
          <Disclaimer />
          <CookieConsent />
          <NetworkSelectionModal />

          <AnimatePresence mode="wait">
            <AnimatedPage componentKey={currentStep}>
              {renderStep()}
            </AnimatedPage>
          </AnimatePresence>
        </>
      )}
    </>
  );
}

function SearchParamsWrapper(props: {
  children: (sp: URLSearchParams) => JSX.Element;
}) {
  const searchParams = useSearchParams();
  return props.children(searchParams);
}

export default function Page() {
  return (
    <Suspense fallback={<Preloader isLoading={true} />}>
      <SearchParamsWrapper>
        {(sp) => <HomeImpl searchParams={sp} />}
      </SearchParamsWrapper>
    </Suspense>
  );
}
