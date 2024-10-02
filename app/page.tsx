"use client";
import { formatUnits } from "viem";
import { toast } from "react-toastify";
import { useForm } from "react-hook-form";
import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useSmartAccount } from "@biconomy/use-aa";
import { useAccount, useReadContract, useSwitchChain } from "wagmi";

import {
  AnimatedPage,
  Preloader,
  TransactionForm,
  TransactionPreview,
} from "./components";
import { erc20Abi } from "./api/abi";
import { fetchSupportedTokens } from "./utils";
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
  // State variables
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [isFetchingInstitutions, setIsFetchingInstitutions] = useState(false);
  const [isFetchingRate, setIsFetchingRate] = useState(false);

  const [rate, setRate] = useState<number>(0);
  const [formValues, setFormValues] = useState<FormData>({} as FormData);
  const [institutions, setInstitutions] = useState<InstitutionProps[]>([]);

  const [currentStep, setCurrentStep] = useState(STEPS.FORM);

  const [selectedRecipient, setSelectedRecipient] =
    useState<RecipientDetails | null>(null);

  const [transactionStatus, setTransactionStatus] = useState<
    | "idle"
    | "pending"
    | "processing"
    | "fulfilled"
    | "validated"
    | "settled"
    | "refunded"
  >("idle");
  const [createdAt, setCreatedAt] = useState<string>("");
  const [orderId, setOrderId] = useState<string>("");

  const { authenticated } = usePrivy();

  // Form methods and watch
  const formMethods = useForm<FormData>({ mode: "onChange" });
  const { watch, setValue } = formMethods;
  const { currency, token, amountSent } = watch();

  // Get account information using custom hook
  const account = useAccount();
  const { smartAccountAddress } = useSmartAccount();

  // State for tokens
  const [smartTokenBalance, setSmartTokenBalance] = useState<number>(0);
  const [tokenBalance, setTokenBalance] = useState<number>(0);

  // Get token balances using custom hook and Ethereum contract interaction
  const { data: smartTokenBalanceInWei } = useReadContract({
    abi: erc20Abi,
    address: fetchSupportedTokens(account.chain?.name)?.find(
      (t) => t.symbol.toUpperCase() === token,
    )?.address as `0x${string}`,
    functionName: "balanceOf",
    args: [smartAccountAddress!],
  });

  const { data: tokenBalanceInWei } = useReadContract({
    abi: erc20Abi,
    address: fetchSupportedTokens(account.chain?.name)?.find(
      (t) => t.symbol.toUpperCase() === token,
    )?.address as `0x${string}`,
    functionName: "balanceOf",
    args: [account.address!],
  });

  const { switchChain } = useSwitchChain();

  // State props for child components
  const stateProps: StateProps = {
    formValues,
    setCreatedAt,
    setOrderId,
    setTransactionStatus,

    tokenBalance,
    smartTokenBalance,

    rate,
    isFetchingRate,

    institutions,
    isFetchingInstitutions,

    selectedRecipient,
    setSelectedRecipient,
  };

  // * START: USE EFFECTS * //

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
      console.log(currencyValue);
      setIsFetchingInstitutions(true);

      const institutions = await fetchSupportedInstitutions(currencyValue);
      setInstitutions(
        institutions.filter((institution) => institution.type === "bank"),
      );

      setIsFetchingInstitutions(false);
    };

    if (!currency) {
      setValue("currency", "KES");
      getInstitutions("KES");
    } else {
      getInstitutions(currency);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency]);

  // Fetch rate based on currency, amount, and token
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const getRate = async () => {
      if (!currency || !amountSent || !token || !authenticated) return;
      setIsFetchingRate(true);
      const rate = await fetchRate({
        token: "USDT",
        amount: amountSent,
        currency: currency,
      });
      setRate(rate.data);
      setIsFetchingRate(false);
    };

    getRate();

    const debounceFetchRate = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(getRate, 1000);
    };

    debounceFetchRate();

    return () => {
      clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency]);

  const tokenDecimals = fetchSupportedTokens(account.chain?.name)?.find(
    (t) => t.symbol.toUpperCase() === token,
  )?.decimals;

  // Update token balance when token balance is available
  useEffect(() => {
    if (tokenBalanceInWei && tokenDecimals) {
      setTokenBalance(Number(formatUnits(tokenBalanceInWei, tokenDecimals)));
    }

    if (smartTokenBalanceInWei && tokenDecimals) {
      setSmartTokenBalance(
        Number(formatUnits(smartTokenBalanceInWei, tokenDecimals)),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenBalanceInWei, smartTokenBalanceInWei]);

  // * END: USE EFFECTS * //

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
