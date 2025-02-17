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
// import { usePrivy } from "@privy-io/react-auth";
import { useStep } from "./context/StepContext";
// import { clearFormState } from "./utils";
import { trackEvent } from "./hooks/analytics";
// import { useNetwork } from "./context/NetworksContext";
import { useAppKitAccount, useAppKitNetwork } from "@reown/appkit/react";
import { connected } from "process";

/**
 * Represents the Home component.
 * This component handles the logic and rendering of the home page.
 */

function HomeImpl({ searchParams }: { searchParams: URLSearchParams }) {
//   const { authenticated } = usePrivy();
  const { currentStep, setCurrentStep } = useStep();
//   const { selectedNetwork } = useNetwork();
  const { isConnected, embeddedWalletInfo, address } = useAppKitAccount();
  const { caipNetwork, caipNetworkId, chainId, switchNetwork } =
        useAppKitNetwork();

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

  useEffect(() => {
    if (!isPageLoading) {
      trackEvent("app_opened");
      trackEvent("page_viewed", { page: "Swap Interface" });

      const cookieConsent = Cookies.get("cookieConsent");
      if (cookieConsent) {
        try {
          const consent = JSON.parse(cookieConsent);
          if (consent && consent.essential) {
            trackEvent("return_user");
          }
        } catch (error) {
          console.error("Invalid cookie consent format", error);
        }
      }
    }
    setIsPageLoading(false);
  }, []);

  useEffect(() => {
    if (!isConnected) {
      setCurrentStep(STEPS.FORM);
      setFormValues({} as FormData);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  // Fetch supported institutions based on currency
  useEffect(() => {
    const getInstitutions = async (currencyValue: string) => {
      if (!currencyValue) return;

      setIsFetchingInstitutions(true);

      const institutions = await fetchSupportedInstitutions(currencyValue);
      setInstitutions(
        institutions.filter((institution) => institution.type === "bank"),
      );

      setIsFetchingInstitutions(false);
    };

    getInstitutions(currency);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency]);

  // Fetch rate based on currency, amount, and token
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    if (!currency) return;

    const getRate = async (shouldUseProvider = true) => {
      setIsFetchingRate(true);
      try {
        const lpParam = searchParams.get("LP");

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
          const lpParam = searchParams.get("LP");
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

            trackEvent("provider_error", {
              provider: lpParam,
              currency,
              token,
            });
          }

          // Retry without provider ID if we were using one
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
  }, [amountSent, currency, token, searchParams]);

  const handleFormSubmit = (data: FormData) => {
    setFormValues(data);
    setCurrentStep(STEPS.PREVIEW);
    trackEvent("form_submitted", {
      token: data.token,
      network: caipNetwork?.name,
      recipient: data.recipientName,
    });
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
    //   case STEPS.PREVIEW:
    //     return (
    //       <TransactionPreview
    //         handleBackButtonClick={handleBackToForm}
    //         stateProps={stateProps}
    //       />
    //     );
    //   case STEPS.STATUS:
    //     return (
    //       <TransactionStatus
    //         formMethods={formMethods}
    //         transactionStatus={transactionStatus}
    //         createdAt={createdAt}
    //         orderId={orderId}
    //         clearForm={() => {
    //           clearFormState(formMethods);
    //           setSelectedRecipient(null);
    //         }}
    //         clearTransactionStatus={() => {
    //           setTransactionStatus("idle");
    //         }}
    //         setTransactionStatus={setTransactionStatus}
    //         setCurrentStep={setCurrentStep}
    //         supportedInstitutions={institutions}
    //       />
    //     );
      default:
        return null;
    }
  };

  console.log(caipNetwork?.name);
  return (
    <>
      <Preloader isLoading={isPageLoading} />
      <AnimatePresence mode="wait">
        <AnimatedPage componentKey={currentStep}>{renderStep()}</AnimatedPage>
      </AnimatePresence>
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
