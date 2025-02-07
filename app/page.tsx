"use client";
import { useForm } from "react-hook-form";
import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import Cookies from "js-cookie";

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
import { usePrivy } from "@privy-io/react-auth";
import { useStep } from "./context/StepContext";
import { clearFormState } from "./utils";
import { trackEvent } from "./hooks/analytics";
import { useNetwork } from "./context/NetworksContext";

/**
 * Represents the Home component.
 * This component handles the logic and rendering of the home page.
 */
export default function Home() {
  const { authenticated } = usePrivy();
  const { currentStep, setCurrentStep } = useStep();
  const { selectedNetwork } = useNetwork();

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

  // Form methods and watch
  const formMethods = useForm<FormData>({
    mode: "onChange",
    defaultValues: {
      token: "USDC",
      amountSent: 0, // Changed from "" to 0
      amountReceived: 0, // Changed from "" to 0
      currency: "",
      recipientName: "",
      memo: "",
      institution: "",
      accountIdentifier: "",
      accountType: "bank", // Changed from "" to "bank"
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
    if (!authenticated) {
      setCurrentStep(STEPS.FORM);
      setFormValues({} as FormData);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]);

  // Add this effect to handle form initialization
  useEffect(() => {
    if (!formMethods.getValues("token")) {
      formMethods.reset({ token: "USDC" });
    }
  }, []);

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

    const getRate = async () => {
      setIsFetchingRate(true);
      const rate = await fetchRate({
        token,
        amount: amountSent || 1,
        currency,
      });
      setRate(rate.data);
      setIsFetchingRate(false);
    };

    const debounceFetchRate = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(getRate, 1000);
    };

    debounceFetchRate();

    return () => {
      clearTimeout(timeoutId);
    };
  }, [amountSent, currency, token]);

  const handleFormSubmit = (data: FormData) => {
    setFormValues(data);
    setCurrentStep(STEPS.PREVIEW);
    trackEvent("form_submitted", {
      token: data.token,
      network: selectedNetwork.chain.name,
      recipient: data.recipientName,
    });
  };

  const handleBackToForm = () => {
    Object.entries(formValues).forEach(([key, value]) => {
      formMethods.setValue(key as keyof FormData, value);
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
      <Preloader isLoading={isPageLoading} />
      <AnimatePresence mode="wait">
        <AnimatedPage componentKey={currentStep}>{renderStep()}</AnimatedPage>
      </AnimatePresence>
    </>
  );
}
