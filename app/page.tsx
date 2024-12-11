"use client";
import { useForm } from "react-hook-form";
import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";

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

const INITIAL_FORM_STATE: FormData = {
  network: "",
  token: "",
  amountSent: 0,
  amountReceived: 0,
  currency: "",
  institution: "",
  accountIdentifier: "",
  recipientName: "",
  memo: "",
  accountType: "bank",
};

/**
 * Represents the Home component.
 * This component handles the logic and rendering of the home page.
 */
export default function Home() {
  const { authenticated } = usePrivy();
  const { currentStep, setCurrentStep } = useStep();

  const [isPageLoading, setIsPageLoading] = useState(true);
  const [isFetchingRate, setIsFetchingRate] = useState(false);
  const [isFetchingInstitutions, setIsFetchingInstitutions] = useState(false);

  const [rate, setRate] = useState<number>(0);
  const [recipientName, setRecipientName] = useState<string>("");
  const [formValues, setFormValues] = useState<FormData>({} as FormData);
  const [institutions, setInstitutions] = useState<InstitutionProps[]>([]);

  const [selectedRecipient, setSelectedRecipient] =
    useState<RecipientDetails | null>(null);

  const [transactionStatus, setTransactionStatus] =
    useState<TransactionStatusType>("idle");
  const [createdAt, setCreatedAt] = useState<string>("");
  const [orderId, setOrderId] = useState<string>("");

  // Form methods and watch
  const formMethods = useForm<FormData>({ mode: "onChange" });
  const { watch } = formMethods;
  const { currency, amountSent, token } = watch();

  // State props for child components
  const stateProps: StateProps = {
    formValues,

    rate,
    isFetchingRate,

    institutions,
    isFetchingInstitutions,

    recipientName,
    setRecipientName,

    selectedRecipient,
    setSelectedRecipient,

    setOrderId,
    setCreatedAt,
    setTransactionStatus,
  };

  useEffect(() => {
    setIsPageLoading(false);
  }, []);

  useEffect(() => {
    if (!authenticated) {
      setCurrentStep(STEPS.FORM);
      setFormValues({} as FormData);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]);

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
  };

  const handleBackToForm = () => {
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
            recipientName={stateProps.recipientName}
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
