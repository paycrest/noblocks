"use client";
import { useForm } from "react-hook-form";
import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";

import {
  AnimatedPage,
  Preloader,
  TransactionForm,
  TransactionPreview,
} from "./components";
import { fetchRate, fetchSupportedInstitutions } from "./api/aggregator";
import type {
  FormData,
  InstitutionProps,
  RecipientDetails,
  StateProps,
} from "./types";
import { usePrivy } from "@privy-io/react-auth";

const STEPS = {
  FORM: "form",
  PREVIEW: "preview",
  STATUS: "status",
};

/**
 * Represents the Home component.
 * This component handles the logic and rendering of the home page.
 */
export default function Home() {
  const { authenticated } = usePrivy();

  const [isPageLoading, setIsPageLoading] = useState(true);
  const [isFetchingRate, setIsFetchingRate] = useState(false);
  const [isFetchingInstitutions, setIsFetchingInstitutions] = useState(false);

  const [rate, setRate] = useState<number>(0);
  const [formValues, setFormValues] = useState<FormData>({} as FormData);
  const [institutions, setInstitutions] = useState<InstitutionProps[]>([]);

  const [currentStep, setCurrentStep] = useState(STEPS.FORM);

  const [selectedRecipient, setSelectedRecipient] =
    useState<RecipientDetails | null>(null);

  // Form methods and watch
  const formMethods = useForm<FormData>({ mode: "onChange" });
  const { watch, setValue } = formMethods;
  const { currency, amountSent } = watch();

  // State props for child components
  const stateProps: StateProps = {
    formValues,

    rate,
    isFetchingRate,

    institutions,
    isFetchingInstitutions,

    selectedRecipient,
    setSelectedRecipient,
  };

  useEffect(() => {
    setIsPageLoading(false);
  }, []);

  useEffect(() => {
    if (!authenticated) {
      setCurrentStep(STEPS.FORM);
      setFormValues({} as FormData);
    }
  }, [authenticated]);

  // Fetch supported institutions based on currency
  useEffect(() => {
    const getInstitutions = async (currencyValue: string) => {
      setIsFetchingInstitutions(true);

      const institutions = await fetchSupportedInstitutions(
        currencyValue || "KES",
      );
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

    const getRate = async () => {
      setIsFetchingRate(true);
      const rate = await fetchRate({
        token: "usdt", // only USDT is supported
        amount: amountSent || 1,
        currency: currency || "KES",
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
  }, [amountSent, currency]);

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
