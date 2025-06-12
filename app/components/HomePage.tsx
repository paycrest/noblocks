import { useForm } from "react-hook-form";
import { useEffect, useState, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Crimson_Pro } from "next/font/google";
import Image from "next/image";
import { ArrowRight01Icon } from "hugeicons-react";
const crimsonPro = Crimson_Pro({
  subsets: ["latin"],
  weight: ["400", "600"], // adjust weights as needed
  variable: "--font-crimson",
});

import {
  AnimatedPage,
  Preloader,
  TransactionForm,
  TransactionPreview,
  TransactionStatus,
  NetworkSelectionModal,
  CookieConsent,
  Disclaimer,
} from "./index";
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
import FAQs from "./FAQs";

// HomePage component with hero section and transaction flow
export function HomePage({ searchParams }: { searchParams: URLSearchParams }) {
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
      let timeoutId: NodeJS.Timeout;
      if (!currency) return;
      const getRate = async (shouldUseProvider = true) => {
        setIsFetchingRate(true);
        try {
          const lpParam =
            searchParams.get("provider") || searchParams.get("PROVIDER");
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
            const lpParam =
              searchParams.get("provider") || searchParams.get("PROVIDER");
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
      {/* Hero Section */}
      <section className="w-full lg:mb-20">
        <h1 className="flex flex-col items-center text-center text-3xl font-semibold lg:gap-4 lg:text-[50px]">
          <span>Change stablecoins</span>
          <span className={`${crimsonPro.className}`}>to cash in seconds</span>
        </h1>
      </section>

      {/* Main Transaction Flow */}
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

      <p className="my-20 text-center text-white opacity-50">
        Learn how to use Noblocks
      </p>

      <div className="mx-auto flex w-full max-w-[1004px] cursor-pointer justify-center rounded-[20px] bg-[#FD76B3] p-3 hover:opacity-70">
        <Image
          src="/images/walkthrough-video.svg"
          width={100}
          height={100}
          alt="Walkthrough Video"
          className="w-full"
        />
      </div>

      <section className="w-full flex flex-col gap-8 items-center justify-center my-8">
        <h3 className="font-semibold text-2xl lg:text-3xl">Ways you can use Noblocks</h3>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-8 border rounded-[28px] p-4 border-[#FFFFFF1A]">
          <div className="bg-[#202020] flex flex-col gap-6 rounded-[24px] px-4 py-8">
            <h4 className="font-medium text-lg">No Crypto Experience</h4>
            <p className="flex flex-col gap-4 bg-[#FFFFFF0D] rounded-[20px] p-3">
              <span>
                {/* Icon here */}
                <Image src="/images/transfer-stable-coin.svg" alt="Icon" width={60} height={60}/>
              </span>
              <span className="font-normal text-sm">Transfer stablecoins to cash in any bank account</span>
            </p>
            <p className="flex flex-col gap-4 bg-[#FFFFFF0D] rounded-[20px] p-3">
              <span>
               {/* Icon here */}
                <Image src="/images/pay-for-groceries.svg" alt="Icon" width={60} height={30}/>
              </span>
              <span className="font-normal text-sm">Pay for your groceries and expenses swiftly</span>
            </p>
             <p className="flex flex-col gap-4 bg-[#FFFFFF0D] rounded-[20px] p-3">
              <span>
                {/* Icon here */}
                <Image src="/images/spend-usdc.svg" alt="Icon" width={60} height={30}/>
              </span>
              <span className="font-normal text-sm">Spend USDC/USDT comfortably with no exchange </span>
            </p>
          </div>
          <div className="bg-[#202020] flex flex-col gap-6 rounded-[24px] px-4 py-8">
            <h4 className="font-medium text-lg">Web3 Native & Degen</h4>
            <p className="flex flex-col gap-4 bg-[#FFFFFF0D] rounded-[20px] p-3">
              <span>
                 {/* Icon here */}
                <Image src="/images/turn-defi-tocash.svg" alt="Icon" width={60} height={30}/>
              </span>
              <span className="font-normal text-sm">Turn your DEFI yields into cash easily</span>
            </p>
            <p className="flex flex-col gap-4 bg-[#FFFFFF0D] rounded-[20px] p-3">
              <span>
                {/* Icon here */}
                <Image src="/images/escape-p2p.svg" alt="Icon" width={60} height={30}/>
              </span>
              <span className="font-normal text-sm">Escape P2P and liquidate your cash in no time</span>
            </p>
             <p className="flex flex-col gap-4 bg-[#FFFFFF0D] rounded-[20px] p-3">
              <span>
                 {/* Icon here */}
                <Image src="/images/no-issue-dex.svg" alt="Icon" width={60} height={30}/>
              </span>
              <span className="font-normal text-sm">No issues of losses or security concerns like DEXes </span>
            </p>
          </div>
        </div>
      </section>

      <section className="flex w-full flex-col items-center justify-center gap-4">
        <h3 className="text-2xl font-semibold lg:text-[48px]">
          Rates like no other
        </h3>
        <p className="max-w-[712px] text-center font-normal">
          You have no cause for worry when it comes to rates, Noblocks offers
          the best rates that beat the speed and amount for P2Ps and other
          stablecoin exchange options
        </p>
        <button className="flex items-center gap-2 hover:cursor-pointer hover:opacity-80">
          Get started <ArrowRight01Icon />
        </button>
        <div className="hidden w-full max-w-[834px] md:block">
          <Image
            src="/images/rates-graph.svg"
            width={100}
            height={100}
            className="my-8 w-full"
            alt="Rates Graph"
          />
        </div>
        <div className="w-full md:hidden">
          <Image
            src="/images/rates-graph-mobile.svg"
            width={100}
            height={100}
            className="my-8 w-full"
            alt="Rates Graph"
          />
        </div>
      </section>

      {/* Accordion FAQ here */}
      <FAQs />

      <section className="relative mx-auto flex w-full flex-col gap-8 max-w-[1440px] h-[708px] my-20 ">
        <div className="flex flex-col max-w-[616px] gap-5 lg:ml-20 lg:mt-8 z-10">
          <p className="flex flex-col text-2xl font-semibold lg:text-[48px] lg:gap-4">
            <span>Power the Liquidity</span>
            <span className={`${crimsonPro.className}`}>
              Engine on Noblocks
            </span>
          </p>
          <p className="text-base font-normal lg:text-xl">
            Maximize your earnings while enabling fast and seamless stablecoin
            exchanges. Specify your rate, serve urgent customers and lead the
            charge to operate in a truly decentralised world.
          </p>
          <button className="bg-[#8B85F4] font-medium text-sm rounded-lg p-3 w-full max-w-[219px] hover:opacity-90 cursor-pointer">Become a Liquidity Provider</button>
        </div>
        <div className="w-full">
          <Image
            src="/images/power-liquidity-desktop-illustration.svg"
            alt="Power the Liquidity Engine Illustration"
            width={100}
            height={100}
            className="absolute bottom-0 left-0 w-full hidden md:block"
          />
          <Image
            src="/images/power-liquidity-mobile-illustration.svg"
            alt="Power the Liquidity Engine Illustration"
            width={100}
            height={100}
            className="absolute bottom-0 left-0 w-full max-h-[838px] md:hidden"
          />

        </div>
      </section>
    </div>
  );
}
