"use client";
import { Checkbox, DialogTitle, Field, Label } from "@headlessui/react";
import { toast } from "sonner";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef } from "react";
// smart-camera-web JSX types are declared in app/types/smart-camera-web.d.ts
declare global {
  interface Window {
    tf?: {
      load: () => void;
      reload: () => void;
    };
  }
}

import {
  CheckIcon,
  SadFaceIcon,
  UserDetailsIcon,
  VerificationPendingIcon,
} from "./ImageAssets";
import { DropdownItem, FlexibleDropdown } from "./FlexibleDropdown";
import {
  ArrowDown01Icon,
  ArrowLeft01Icon,
  FileAddIcon,
  Folder02Icon,
  MapPinpoint01Icon,
  PencilEdit01Icon,
  PencilEdit02Icon,
  Tick01Icon,
} from "hugeicons-react";
import { classNames } from "../utils";
import { fadeInOut } from "./AnimatedComponents";
import { submitSmileIDData } from "../api/aggregator";
import { primaryBtnClasses, secondaryBtnClasses } from "./Styles";
import { trackEvent } from "../hooks/analytics/client";
import { CheckmarkCircle01Icon, Clock05Icon, StarIcon } from "hugeicons-react";
import { useInjectedWallet } from "../context";
import { KYC_TIERS, useKYC } from "../context/KYCContext";
import { formatNumberWithCommas } from "../utils";
import { DocumentRequirementsModal } from "./kyc/DocumentRequirementsModal";

import idTypesData from "../api/kyc/smile-id/id_types.json";

const TIER3_DOCUMENT_TYPES = [
  { value: "utility_bill", label: "Utility bill" },
  { value: "bank_statement", label: "Bank statement" },
] as const;

export const STEPS = {
  TERMS: "terms",
  ID_INFO: "id_info",
  CAPTURE: "capture",
  STATUS: {
    PENDING: "pending",
    SUCCESS: "success",
    FAILED: "failed",
  },
  LOADING: "loading",
  EXPIRED: "expired",
  REFRESH: "refresh",
  // Tier 3 (address verification) flow
  TIER3_PROMPT: "tier3_prompt",
  TIER3_COUNTRY: "tier3_country",
  TIER3_UPLOAD: "tier3_upload",
} as const;

type Step =
  | typeof STEPS.TERMS
  | typeof STEPS.ID_INFO
  | typeof STEPS.CAPTURE
  | typeof STEPS.LOADING
  | typeof STEPS.REFRESH
  | (typeof STEPS.STATUS)[keyof typeof STEPS.STATUS]
  | typeof STEPS.TIER3_PROMPT
  | typeof STEPS.TIER3_COUNTRY
  | typeof STEPS.TIER3_UPLOAD

// Types for ID types JSON
type IdType = {
  type: string;
  verification_method: string;
};

type Country = {
  name: string;
  code: string;
  id_types: IdType[];
};

const getAllCountries = (): Country[] => {
  return idTypesData.continents
    .flatMap((continent) => continent.countries)
    .sort((a, b) => a.name.localeCompare(b.name));
};

const requiresDocumentCapture = (
  country: Country | null,
  idType: string,
): boolean => {
  if (!country || !idType) return true;
  const selectedIdType = country.id_types.find((t) => t.type === idType);
  return selectedIdType?.verification_method === "doc_verification";
};

export const KycModal = ({
  setIsUserVerified,
  setIsKycModalOpen,
  targetTier,
}: {
  setIsUserVerified: (value: boolean) => void;
  setIsKycModalOpen: (value: boolean) => void;
  targetTier?: 2 | 3;
}) => {
  const { getAccessToken, user } = usePrivy();
  const { wallets } = useWallets();
  const { isInjectedWallet, injectedAddress } = useInjectedWallet();

  const embeddedWallet = wallets.find(
    (wallet) => wallet.walletClientType === "privy",
  );
  const walletAddress = isInjectedWallet
    ? injectedAddress
    : embeddedWallet?.address;

  const [step, setStep] = useState<Step>(() =>
    targetTier === 3 ? STEPS.TIER3_PROMPT : STEPS.LOADING,
  );
  // Tracks where the retry button in renderFailedStatus should navigate back to.
  // Tier 3 failures retry at TIER3_UPLOAD; SmileID (Tier 2) failures retry at TERMS.
  const [failedRetryStep, setFailedRetryStep] = useState<Step>(STEPS.TERMS);
  const [termsAccepted, setTermsAccepted] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cameraElement, setCameraElement] = useState<HTMLElement | null>(null);
  const [smileIdLoaded, setSmileIdLoaded] = useState(false);

  // ID info state for Job Type 1
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [selectedIdType, setSelectedIdType] = useState<string>("");
  const [idNumber, setIdNumber] = useState<string>("");

  // Tier 3 (address verification) state
  const [tier3CountryCode, setTier3CountryCode] = useState<string>("");
  const [tier3HouseNumber, setTier3HouseNumber] = useState("");
  const [tier3StreetAddress, setTier3StreetAddress] = useState("");
  const [tier3County, setTier3County] = useState("");
  const [tier3PostalCode, setTier3PostalCode] = useState("");
  const [tier3DocumentType, setTier3DocumentType] = useState<string>(
    TIER3_DOCUMENT_TYPES[0].value,
  );
  const [tier3UploadedFile, setTier3UploadedFile] = useState<File | null>(null);
  const [tier3RequirementsOpen, setTier3RequirementsOpen] = useState(false);
  const [tier3Submitting, setTier3Submitting] = useState(false);
  const [tier3ErrorMessage, setTier3ErrorMessage] = useState<string | null>(
    null,
  );
  /** True while Tier 2 Smile payload is posting after capture — avoid fetchStatus resetting LOADING → TERMS. */
  const smileIdSubmitInFlightRef = useRef(false);
  const { refreshStatus } = useKYC();
  const countries = getAllCountries();
  const tier3CountryOptions = countries.map((c) => ({
    name: c.code,
    label: c.name,
    imageUrl: `https://flagcdn.com/h24/${c.code.toLowerCase()}.webp`,
  }));
  const tier3SelectedCountryLabel =
    tier3CountryOptions.find((c) => c.name === tier3CountryCode)?.label ?? "";
  const tier3AddressDisplay =
    [
      tier3HouseNumber,
      tier3StreetAddress,
      tier3County,
      tier3PostalCode,
      tier3SelectedCountryLabel,
    ]
      .filter(Boolean)
      .join(", ") || "—";

  // Check if current selection requires document capture or just ID number
  const needsDocCapture = requiresDocumentCapture(
    selectedCountry,
    selectedIdType,
  );

  useEffect(() => {
    // Only load SmileID components for Tier 2 verification flow
    if (targetTier === 3) return;
    if (typeof window !== "undefined" && !smileIdLoaded) {
      import("@smileid/web-components/smart-camera-web")
        .then(() => {
          setSmileIdLoaded(true);
        })
        .catch(() => {
          toast.error("Failed to load verification component");
        });
    }
  }, [smileIdLoaded, targetTier]);

  const handleAcceptTerms = () => {
    setIsKycModalOpen(true);
    setStep(STEPS.ID_INFO);
  };

  const renderTerms = () => (
    <motion.div key="terms" {...fadeInOut} className="space-y-4">
      <div className="space-y-3">
        <UserDetailsIcon />
        <div>
          <h2 className="text-lg font-medium dark:text-white">
            Verify your identity in just{" "}
            <span className="bg-gradient-to-br from-green-400 via-orange-400 to-orange-600 bg-clip-text text-transparent">
              2 minutes
            </span>
          </h2>
        </div>
      </div>

      <div className="space-y-6 rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/5">
        <h4 className="text-base font-medium text-neutral-800 dark:text-white/80">
          Accept terms to get started
        </h4>

        <Field className="flex gap-6">
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-2">
              <CheckIcon
                className="mx-1 mt-1 size-7 flex-shrink-0 cursor-pointer"
                isActive={termsAccepted}
              />
              <Label className="cursor-pointer text-gray-500 dark:text-white/50">
                <p>
                  I agree to the Paycrest Terms of Service and acknowledge the Privacy Policy.
                </p>
              </Label>
            </div>

            <div className="flex items-start gap-2">
              <CheckIcon
                className="mx-1 mt-1 size-7 flex-shrink-0 cursor-pointer"
                isActive={termsAccepted}
              />
              <Label className="cursor-pointer text-gray-500 dark:text-white/50">
                <p>
                  I confirm that the information I provide is accurate and that I will use Paycrest in compliance with applicable laws and regulations.
                </p>
              </Label>
            </div>

            <div className="flex items-start gap-2">
              <CheckIcon
                className="mx-1 mt-1 size-7 flex-shrink-0 cursor-pointer"
                isActive={termsAccepted}
              />
              <Label className="cursor-pointer text-gray-500 dark:text-white/50">
                <p>
                  I understand that Paycrest facilitates fiat and digital asset transactions and that transactions may be irreversible once completed.
                </p>
              </Label>
            </div>

            <div className="flex items-start gap-2">
              <div className="mx-1 mt-1 size-7 flex-shrink-0"></div>
              <Label className="cursor-pointer text-gray-500 dark:text-white/50">
                <a
                  href={
                    "https://paycrest.notion.site/KYC-Policy-10e2482d45a280e191b8d47d76a8d242"
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-lavender-500 hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    window.open(
                      "https://paycrest.notion.site/KYC-Policy-10e2482d45a280e191b8d47d76a8d242",
                      "_blank",
                    );
                  }}
                >
                  Read full KYC Policy
                </a>
              </Label>
            </div>
          </div>
        </Field>
      </div>

      <div className="rounded-2xl border border-gray-100 p-4 dark:border-white/10">
        <div className="flex items-start gap-2">
          <Checkbox
            checked={termsAccepted}
            onChange={(checked) => setTermsAccepted(checked)}
            className="group mr-1 mt-1 block size-5 flex-shrink-0 cursor-pointer rounded border-2 border-gray-300 bg-transparent data-[checked]:border-lavender-500 data-[checked]:bg-lavender-500 dark:border-white/30 dark:data-[checked]:border-lavender-500"
          >
            <svg
              className="stroke-neutral-800 opacity-0 group-data-[checked]:opacity-100"
              viewBox="0 0 14 14"
              fill="none"
            >
              <path
                d="M3 8L6 11L11 3.5"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Checkbox>
          <p className="text-xs text-gray-500 dark:text-white/50">
            By clicking &ldquo;Sign and continue&rdquo; below, you are agreeing to the terms and policies above.
          </p>
        </div>
      </div>

      <div className="flex gap-4">
        <button
          type="button"
          onClick={() => setIsKycModalOpen(false)}
          className={secondaryBtnClasses}
        >
          No, thanks
        </button>
        <button
          type="button"
          className={`${primaryBtnClasses} w-full`}
          disabled={!termsAccepted}
          onClick={handleAcceptTerms}
        >
          Accept and continue
        </button>
      </div>
    </motion.div>
  );

  const renderIdInfo = () => (
    <motion.div key="id_info" {...fadeInOut} className="space-y-4">
      <div className="space-y-3">
        <UserDetailsIcon />
        <div>
          <h2 className="text-lg font-medium dark:text-white">
            Select your ID document
          </h2>
          <p className="text-sm text-gray-500 dark:text-white/50">
            Choose your country and the type of ID you&apos;ll use for
            verification.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Country Selection */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-white/70">
            Country
          </label>
          <FlexibleDropdown
            data={countries.map((c) => ({ name: c.code, label: c.name }))}
            selectedItem={selectedCountry?.code}
            onSelect={(code) => {
              const country = countries.find((c) => c.code === code);
              setSelectedCountry(country || null);
              setSelectedIdType("");
              setIdNumber("");
            }}
            mobileTitle="Select Country"
            dropdownWidth={350}
          >
            {({ selectedItem, isOpen, toggleDropdown }) => (
              <button
                type="button"
                onClick={toggleDropdown}
                className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-left text-gray-900 focus:outline-none focus:ring-2 focus:ring-lavender-500 dark:border-white/10 dark:bg-white/5 dark:text-white"
              >
                <span className={selectedItem ? "" : "text-gray-400"}>
                  {selectedItem?.label || "Select a country"}
                </span>
                <ArrowDown01Icon
                  className={classNames(
                    "size-5 text-gray-400 transition-transform",
                    isOpen ? "rotate-180" : "",
                  )}
                />
              </button>
            )}
          </FlexibleDropdown>
        </div>

        {/* ID Type Selection */}
        {selectedCountry && (
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-white/70">
              ID Type
            </label>
            <FlexibleDropdown
              data={selectedCountry.id_types.map((t) => ({
                name: t.type,
                label: t.type.replace(/_/g, " "),
              }))}
              selectedItem={selectedIdType}
              onSelect={(type) => {
                setSelectedIdType(type);
                setIdNumber("");
              }}
              mobileTitle="Select ID Type"
              dropdownWidth={350}
            >
              {({ selectedItem, isOpen, toggleDropdown }) => (
                <button
                  type="button"
                  onClick={toggleDropdown}
                  className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-left text-gray-900 focus:outline-none focus:ring-2 focus:ring-lavender-500 dark:border-white/10 dark:bg-white/5 dark:text-white"
                >
                  <span className={selectedItem ? "" : "text-gray-400"}>
                    {selectedItem?.label || "Select ID type"}
                  </span>
                  <ArrowDown01Icon
                    className={classNames(
                      "size-5 text-gray-400 transition-transform",
                      isOpen ? "rotate-180" : "",
                    )}
                  />
                </button>
              )}
            </FlexibleDropdown>
          </div>
        )}

        {/* ID Number Input - only for biometric_kyc verification (BVN, NIN, etc.) */}
        {selectedIdType && !needsDocCapture && (
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-white/70">
              {selectedIdType.replace(/_/g, " ")} Number
            </label>
            <input
              type="text"
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
              placeholder={`Enter your ${selectedIdType.replace(/_/g, " ")} number`}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-lavender-500 dark:border-white/10 dark:bg-white/5 dark:text-white"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-white/50">
              Your ID will be verified against the government database
            </p>
          </div>
        )}
      </div>

      <div className="flex gap-4">
        <button
          type="button"
          onClick={() => setStep(STEPS.TERMS)}
          className={secondaryBtnClasses}
        >
          Back
        </button>
        <button
          type="button"
          className={`${primaryBtnClasses} w-full`}
          disabled={
            !selectedCountry ||
            !selectedIdType ||
            (!needsDocCapture && !idNumber) ||
            !smileIdLoaded
          }
          onClick={() => {
            if (!smileIdLoaded) {
              toast.error("Verification component is still loading. Please wait.");
              return;
            }
            setStep(STEPS.CAPTURE);
          }}
        >
          Continue
        </button>
      </div>
    </motion.div>
  );

  const renderCapture = () => (
    <motion.div key="capture" {...fadeInOut} className="space-y-4">
      <div className="space-y-3">
        <UserDetailsIcon />
        <div>
          <h2 className="text-lg font-medium dark:text-white">
            {needsDocCapture ? "Capture your documents" : "Take a selfie"}
          </h2>
          <p className="text-sm text-gray-500 dark:text-white/50">
            {needsDocCapture
              ? "Please take a selfie and capture your ID document for verification."
              : "Please take a selfie to verify your identity against your ID."}
          </p>
        </div>
      </div>

      <div className="flex justify-center">
        {needsDocCapture ? (
          <smart-camera-web
            ref={(el: HTMLElement | null) => setCameraElement(el)}
            theme-color="#8B85F4"
            capture-id
          />
        ) : (
          <smart-camera-web
            ref={(el: HTMLElement | null) => setCameraElement(el)}
            theme-color="#8B85F4"
          />
        )}
      </div>

      <button
        type="button"
        onClick={() => setStep(STEPS.ID_INFO)}
        className={secondaryBtnClasses}
      >
        Back
      </button>
    </motion.div>
  );

  const renderPendingStatus = () => (
    <motion.div key="pending" {...fadeInOut} className="space-y-4 pt-4">
      <Clock05Icon className="mx-auto dark:text-yellow-primary" size={40} />

      <div className="space-y-3 px-6 pb-2 text-center">
        <DialogTitle className="text-lg font-semibold">
          Tier 2 Upgrade in progress
        </DialogTitle>

        <p className="text-gray-500 dark:text-white/50">
          We are currently verifying your identity. You will get feedback within
          24 hours. Kindly check back soon
        </p>
      </div>

      <div className="flex w-full items-center gap-2">
        <button
          type="button"
          className={`${primaryBtnClasses} w-full`}
          onClick={() => {
            setIsKycModalOpen(false);
            void refreshStatus(true);
          }}
        >
          Got it
        </button>
      </div>
    </motion.div>
  );

  const renderSuccessStatus = () => (
    <motion.div key="success" {...fadeInOut} className="space-y-4 pt-4">
      <CheckmarkCircle01Icon className="mx-auto size-12" color="#39C65D" />

      <div className="space-y-3 px-6 pb-2 text-center">
        <DialogTitle className="text-lg font-semibold">
          Verification successful
        </DialogTitle>

        <p className="text-gray-500 dark:text-white/50">
          You can now start converting your stablecoin to fiat at zero fees on
          Noblocks
        </p>
      </div>

      <button
        type="button"
        className={`${primaryBtnClasses} w-full`}
        onClick={() => {
          setIsUserVerified(true);
          setIsKycModalOpen(false);
          void refreshStatus(true);
        }}
      >
        Let&apos;s go!
      </button>
    </motion.div>
  );

  const renderFailedStatus = () => (
    <motion.div key="failed" {...fadeInOut} className="space-y-4 pt-4">
      <SadFaceIcon className="mx-auto" />

      <div className="space-y-3 px-6 pb-2 text-center">
        <DialogTitle className="text-lg font-semibold">
          Verification failed
        </DialogTitle>

        <p className="text-gray-500 dark:text-white/50">
          Some documents you uploaded couldn’t be verified. Please check all
          requirements and upload again
        </p>
      </div>

      <button
        type="button"
        className={`${primaryBtnClasses} w-full`}
        onClick={() => setStep(failedRetryStep)}
      >
        Retry verification
      </button>
    </motion.div>
  );

  const renderLoadingStatus = () => (
    <motion.div
      key="loading"
      {...fadeInOut}
      className="flex h-full items-center justify-center py-40"
    >
      <div className="h-24 w-24 animate-spin rounded-full border-4 border-t-4 border-lavender-500 border-t-white"></div>
    </motion.div>
  );

  const renderRefresh = () => (
    <motion.div key="refresh" {...fadeInOut} className="space-y-4 pt-4">
      <VerificationPendingIcon className="mx-auto" />

      <div className="space-y-3 px-6 pb-2 text-center">
        <DialogTitle className="text-lg font-semibold">
          Refresh to Update KYC
        </DialogTitle>

        <p className="text-gray-500 dark:text-white/50">
          If you have completed your KYC, click Refresh to update your KYC
          status.
        </p>
      </div>

      <button
        type="button"
        className={`${primaryBtnClasses} w-full`}
        onClick={handleRefresh}
      >
        {isRefreshing ? "Refreshing..." : "Refresh"}
      </button>
    </motion.div>
  );

  // Tier 3: Address verification card (reused in Tier 3 steps)
  const Tier3AddressCard = ({ className }: { className?: string }) => (
    <div
      className={classNames(
        "flex items-center gap-3 rounded-2xl p-3",
        className || "",
      )}
    >
      <div className="flex size-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#FF7D52]">
        <MapPinpoint01Icon className="size-5 text-white" />
      </div>
      <div className="space-y-0.5">
        <p className="text-xs font-normal text-neutral-800 dark:text-white/80">
          Address verification
        </p>
        <p className="text-xs font-light text-gray-500 dark:text-white/50">
          Utility bill, Bank statement.
        </p>
      </div>
    </div>
  );

  const renderTier3Prompt = () => {
    const tier3Limits = KYC_TIERS[3];
    return (
      <motion.div key="tier3_prompt" {...fadeInOut} className="space-y-4 pt-4">
        <div className="space-y-3">
          <UserDetailsIcon />
          <div className="flex items-center gap-1">
            <h2 className="text-md font-normal dark:text-white">
              Upgrade KYC to Tier 3
            </h2>
            <p className="text-md bg-[linear-gradient(119.63deg,_#04FF44_45.08%,_#EAAB12_70.6%,_rgba(255,107,144,0.6)_105.17%,_#FF0087_122.94%,_#5189F9_161.1%)] bg-clip-text text-transparent">
              in 2 minutes
            </p>
          </div>
        </div>
        <div className="space-y-2 rounded-lg bg-gray-50 p-4 dark:bg-white/5">
          <div className="space-y-2">
            <p className="text-sm font-normal text-neutral-800 dark:text-white/80">
              Account limit
            </p>
            <div className="flex flex-col items-start gap-2 rounded-3xl border border-gray-200 p-4 dark:border-white/10">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-[#39C65D] px-2.5 py-1 text-xs font-medium text-black dark:bg-[#39C65D]">
                <StarIcon className="size-4" />
                Tier 3
              </span>
              <p className="text-xs font-normal text-gray-500 dark:text-white/80">
                Monthly limit{" "}
              </p>
              <span className="text-xl font-normal text-neutral-900 dark:text-white">
                ${formatNumberWithCommas(tier3Limits.limits.monthly)}
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-normal text-neutral-800 dark:text-white/80">
              Key requirements
            </p>
            <Tier3AddressCard className="border border-gray-100 bg-gray-50 dark:border-white/10 dark:bg-white/5" />
          </div>
        </div>
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => setIsKycModalOpen(false)}
            className={secondaryBtnClasses}
          >
            No, thanks
          </button>
          <button
            type="button"
            onClick={() => setStep(STEPS.TIER3_COUNTRY)}
            className={`${primaryBtnClasses} w-full`}
          >
            Upgrade to Tier 3
          </button>
        </div>
      </motion.div>
    );
  };

  const renderTier3Country = () => (
    <motion.div key="tier3_country" {...fadeInOut} className="space-y-4">
      <div className="space-y-3">
        <UserDetailsIcon />
        <div className="space-y-1">
          <h2 className="text-md font-normal dark:text-white">
            Get started with Tier 3 KYC Upgrade
          </h2>
          <p className="text-xs font-light text-gray-500 dark:text-white/50">
            Fill the details below to start upgrade
          </p>
        </div>
      </div>
      <div className="rounded-2xl bg-gray-50 p-2 dark:bg-[#141414]">
        <Tier3AddressCard className="border-none bg-transparent" />
        <div className="p-2">
          <label className="mb-1.5 block text-xs font-normal text-gray-700 dark:text-white/80">
            Country of Residence
          </label>
          <FlexibleDropdown
            data={tier3CountryOptions}
            selectedItem={tier3CountryCode}
            onSelect={(code) => setTier3CountryCode(code)}
            mobileTitle="Select Country"
            dropdownWidth={350}
          >
            {({ selectedItem, isOpen, toggleDropdown }) => (
              <button
                type="button"
                onClick={toggleDropdown}
                className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-left font-light text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#A9A9BC] dark:border-white/10 dark:bg-transparent dark:text-white/50 dark:placeholder:text-white/50"
              >
                <span className={selectedItem ? "" : "text-gray-400"}>
                  {selectedItem?.label || "Enter country of residence"}
                </span>
                <ArrowDown01Icon
                  className={classNames(
                    "size-5 text-gray-400 transition-transform",
                    isOpen ? "rotate-180" : "",
                  )}
                />
              </button>
            )}
          </FlexibleDropdown>
        </div>
        {tier3CountryCode != "" && (
          <div className="space-y-4 p-2">
            <div>
              <label className="mb-1.5 block text-xs font-normal text-gray-700 dark:text-white/80">
                House Number
              </label>
              <input
                type="text"
                value={tier3HouseNumber}
                onChange={(e) => setTier3HouseNumber(e.target.value)}
                placeholder="Enter house number"
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-left font-light text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#A9A9BC] dark:border-white/10 dark:bg-transparent dark:text-white/50 dark:placeholder:text-white/50"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-normal text-gray-700 dark:text-white/80">
                Street Address
              </label>
              <input
                type="text"
                value={tier3StreetAddress}
                onChange={(e) => setTier3StreetAddress(e.target.value)}
                placeholder="Enter street address"
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-left font-light text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#A9A9BC] dark:border-white/10 dark:bg-transparent dark:text-white/50 dark:placeholder:text-white/50"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-normal text-gray-700 dark:text-white/80">
                County / State
              </label>
              <input
                type="text"
                value={tier3County}
                onChange={(e) => setTier3County(e.target.value)}
                placeholder="Select county"
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-left font-light text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#A9A9BC] dark:border-white/10 dark:bg-transparent dark:text-white/50 dark:placeholder:text-white/50"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-normal text-gray-700 dark:text-white/80">
                Postal code
              </label>
              <input
                type="text"
                value={tier3PostalCode}
                onChange={(e) => setTier3PostalCode(e.target.value)}
                placeholder="Enter postal code"
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-left font-light text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#A9A9BC] dark:border-white/10 dark:bg-transparent dark:text-white/50 dark:placeholder:text-white/50"
              />
            </div>
          </div>
        )}
      </div>
      <div className="flex gap-4">
        <button
          type="button"
          onClick={() => setIsKycModalOpen(false)}
          className={secondaryBtnClasses}
        >
          Cancel
        </button>
        <button
          type="button"
          className={`${primaryBtnClasses} w-full`}
          disabled={
            !tier3CountryCode ||
            !tier3HouseNumber.trim() ||
            !tier3StreetAddress.trim() ||
            !tier3County.trim() ||
            !tier3PostalCode.trim()
          }
          onClick={() => setStep(STEPS.TIER3_UPLOAD)}
        >
          Continue
        </button>
      </div>
    </motion.div>
  );

  const ALLOWED_TIER3_EXTENSIONS = ["JPG", "JPEG", "PNG", "PDF"];
  const TIER3_MAX_BYTES = 5 * 1024 * 1024;

  const renderTier3Upload = () => {
    const handleTier3FileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const ext = file.name.split(".").pop()?.toUpperCase();
      if (!ext || !ALLOWED_TIER3_EXTENSIONS.includes(ext)) {
        setTier3ErrorMessage(
          "Invalid file type; allowed: JPG, JPEG, PNG, PDF",
        );
        return;
      }
      if (file.size > TIER3_MAX_BYTES) {
        setTier3ErrorMessage("File too large; maximum 5 MB");
        return;
      }
      setTier3ErrorMessage(null);
      setTier3UploadedFile(file);
    };
    const handleTier3Drop = (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (!file) return;
      const ext = file.name.split(".").pop()?.toUpperCase();
      if (!ext || !ALLOWED_TIER3_EXTENSIONS.includes(ext)) {
        setTier3ErrorMessage(
          "Invalid file type; allowed: JPG, JPEG, PNG, PDF",
        );
        return;
      }
      if (file.size > TIER3_MAX_BYTES) {
        setTier3ErrorMessage("File too large; maximum 5 MB");
        return;
      }
      setTier3ErrorMessage(null);
      setTier3UploadedFile(file);
    };
    const docLabel =
      TIER3_DOCUMENT_TYPES.find(
        (d) => d.value === tier3DocumentType,
      )?.label?.toLowerCase() ?? "document";
    return (
      <motion.div key="tier3_upload" {...fadeInOut} className="space-y-4">
        <button
          type="button"
          onClick={() => setStep(STEPS.TIER3_COUNTRY)}
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-white/50 dark:hover:text-white/70"
        >
          <ArrowLeft01Icon className="size-5 text-gray-500 hover:text-gray-700 dark:text-white/50 dark:hover:text-white/70" />
        </button>
        <div className="space-y-1">
          <h2 className="text-sm font-normal dark:text-white">
            Upload proof of address
          </h2>
          <p className="text-xs font-light text-gray-500 dark:text-white/50">
            Provide any of the document below as proof of your residential
            address
          </p>
        </div>
        <div className="rounded-2xl bg-gray-50 p-2 dark:bg-[#141414]">
          <Tier3AddressCard className="border-none bg-transparent" />
          <div className="p-2">
            <p className="mb-1.5 flex items-center gap-1 text-xs font-light text-gray-500 dark:text-white/50">
              Current address{" "}
              <PencilEdit01Icon className="size-4 text-gray-500 hover:text-gray-700 dark:text-white/50 dark:hover:text-white/70" />
            </p>
            <p className="text-xs font-extralight text-gray-500 dark:text-white/80">
              {tier3AddressDisplay !== "—" ? tier3AddressDisplay : "—"}
            </p>
          </div>
          <div className="space-y-2 p-2">
            <label className="mb-1.5 text-xs font-normal text-gray-800 dark:text-white/80">
              Document type
            </label>
            <FlexibleDropdown
              data={
                TIER3_DOCUMENT_TYPES.map((d) => ({
                  name: d.value,
                  label: d.label,
                })) as DropdownItem[]
              }
              selectedItem={
                TIER3_DOCUMENT_TYPES.find((d) => d.value === tier3DocumentType)
                  ?.value ?? undefined
              }
              mobileTitle="Select Document Type"
              dropdownWidth={350}
              onSelect={(value) =>
                setTier3DocumentType(value as typeof tier3DocumentType)
              }
            >
              {({ selectedItem, isOpen, toggleDropdown }) => (
                <button
                  type="button"
                  onClick={toggleDropdown}
                  className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-left font-light text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#A9A9BC] dark:border-white/10 dark:bg-transparent dark:text-white/50 dark:placeholder:text-white/50"
                >
                  <span className={selectedItem ? "" : "text-gray-400"}>
                    {selectedItem?.label || "Select document type"}
                  </span>
                  <ArrowDown01Icon
                    className={classNames(
                      "size-5 text-gray-400 transition-transform",
                      isOpen ? "rotate-180" : "",
                    )}
                  />
                </button>
              )}
            </FlexibleDropdown>
          </div>
        </div>
        {tier3DocumentType && (
          <div className="rounded-2xl bg-gray-50 p-4 dark:bg-[#141414]">
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-normal text-gray-700 dark:text-white/70">
                Upload {docLabel}
              </label>
              <button
                type="button"
                onClick={() => setTier3RequirementsOpen(true)}
                className="text-xs text-lavender-500 hover:underline"
              >
                See requirements
              </button>
            </div>
            <div
              onDrop={handleTier3Drop}
              onDragOver={(e) => e.preventDefault()}
              className={classNames(
                "flex flex-col items-start justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-white/5 bg-transparent px-4 py-3",
                tier3UploadedFile ? "border-lavender-500/50" : "",
              )}
            >
              <div className="shadow-xs rounded-xl border border-white/5 bg-transparent p-2 shadow-[0_1px_2px_rgba(0,0,0,0.5)] dark:border-white/10 dark:shadow-[#A9A9BC]">
                {tier3UploadedFile ? (
                  <Tick01Icon className="size-4 text-green-500" />
                ) : (
                  <FileAddIcon className="size-4 text-black dark:text-white/50" />
                )}
              </div>
              {tier3UploadedFile ? (
                <>
                  <p className="flex items-center gap-1 text-xs font-light text-gray-600 dark:text-white/70">
                    {tier3UploadedFile.name}{" "}
                    <PencilEdit02Icon className="size-3.5 text-lavender-500" />{" "}
                    <span className="text-lavender-500 hover:underline">
                      change
                    </span>
                  </p>
                  <p className="text-xs font-extralight text-gray-500 dark:text-white/50">
                    Size: {(tier3UploadedFile.size / 1024 / 1024).toFixed(2)} MB
                    Format:{" "}
                    {String(
                      tier3UploadedFile.type?.split("/")[1] ??
                        tier3UploadedFile.name?.split(".").pop() ??
                        "UNKNOWN",
                    ).toUpperCase()}
                  </p>
                </>
              ) : (
                <>
                  <p className="flex items-center gap-1 text-xs font-light text-gray-600 dark:text-white/70">
                    Drag and drop or{" "}
                    <label className="flex cursor-pointer items-center gap-1 text-lavender-500 hover:underline">
                      <Folder02Icon className="size-3.5" /> browse file
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,.pdf"
                        className="sr-only"
                        onChange={handleTier3FileChange}
                      />
                    </label>
                  </p>
                  <p className="text-xs font-extralight text-gray-500 dark:text-white/50">
                    JPG, JPEG, PNG, PDF allowed. 5MB Max.
                  </p>
                </>
              )}
              {tier3ErrorMessage && (
                <p className="mt-1 text-xs text-red-500 dark:text-red-400">
                  {tier3ErrorMessage}
                </p>
              )}
            </div>
          </div>
        )}
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => setStep(STEPS.TIER3_COUNTRY)}
            className={secondaryBtnClasses}
          >
            Back
          </button>
          <button
            type="button"
            className={`${primaryBtnClasses} w-full`}
            disabled={!tier3UploadedFile || tier3Submitting}
            onClick={async () => {
              if (!tier3UploadedFile || tier3Submitting) return;
              setTier3Submitting(true);
              try {
                const accessToken = await getAccessToken();
                if (!accessToken) {
                  setTier3Submitting(false);
                  toast.error("Session expired. Please sign in again.");
                  return;
                }

                const formData = new FormData();
                formData.append("file", tier3UploadedFile);
                formData.append("countryCode", tier3CountryCode);
                formData.append("documentType", tier3DocumentType);
                formData.append("houseNumber", tier3HouseNumber);
                formData.append("streetAddress", tier3StreetAddress);
                formData.append("county", tier3County);
                formData.append("postalCode", tier3PostalCode);

                const res = await fetch("/api/kyc/tier3-verify", {
                  method: "POST",
                  headers: { Authorization: `Bearer ${accessToken}` },
                  body: formData,
                });

                if (!res.ok) {
                  let errorDetail = "Unable to submit Tier 3 verification.";
                  try {
                    const errJson = await res.json();
                    errorDetail =
                      errJson?.error || errJson?.message || errJson?.details || errorDetail;
                  } catch {
                    try {
                      const errText = await res.text();
                      if (errText) errorDetail = errText;
                    } catch {
                      // keep default
                    }
                  }

                  console.error("Tier 3 verification request failed:", errorDetail);
                  toast.error("Tier 3 verification failed", { description: errorDetail });
                  setFailedRetryStep(STEPS.TIER3_UPLOAD);
                  setStep(STEPS.STATUS.FAILED);
                  setTier3Submitting(false);
                  return;
                }

                const data = await res.json();
                if (data?.success) {
                  setIsUserVerified(true);
                  setStep(STEPS.STATUS.SUCCESS);
                  void refreshStatus(true);
                } else {
                  const errorDetail =
                    data?.error || data?.message || "Tier 3 verification failed.";
                  toast.error("Tier 3 verification failed", { description: errorDetail });
                  setFailedRetryStep(STEPS.TIER3_UPLOAD);
                  setStep(STEPS.STATUS.FAILED);
                }
              } catch (e) {
                console.error("Tier 3 verification error:", e);
                toast.error("Tier 3 verification failed. Please try again.");
                setFailedRetryStep(STEPS.TIER3_UPLOAD);
                setStep(STEPS.STATUS.FAILED);
              } finally {
                setTier3Submitting(false);
              }
            }}
          >
            {tier3Submitting ? "Verifying…" : "Complete upgrade"}
          </button>
        </div>
      </motion.div>
    );
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchStatus();
    setIsRefreshing(false);
  };

  const fetchStatus = async () => {
    if (!walletAddress || targetTier === 3) return;

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) return;

      const res = await fetch("/api/kyc/status", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        if (res.status === 404) {
          setStep(STEPS.TERMS);
          return;
        }
        throw new Error(`KYC status check failed: ${res.status}`);
      }

      const data = await res.json();
      const tier: number = data.tier ?? 0;

      // Map Supabase tier to modal step. When tier < 2, do not reset steps the
      // user is already in — a useEffect was calling fetchStatus on every `step`
      // change and forcing TERMS, which bounced users out of ID_INFO / capture.
      if (tier >= 2) {
        setStep(STEPS.STATUS.SUCCESS);
        trackEvent("Account verification", {
          "Verification status": "Success",
        });
      } else {
        setStep((current) => {
          // Initial Tier 2 step is LOADING until status hydrates — must land on TERMS.
          if (current === STEPS.LOADING) {
            if (smileIdSubmitInFlightRef.current) {
              return current;
            }
            return STEPS.TERMS;
          }
          const midFlowSteps: Step[] = [
            STEPS.ID_INFO,
            STEPS.CAPTURE,
            STEPS.STATUS.PENDING,
            STEPS.STATUS.FAILED,
            STEPS.REFRESH,
          ];
          if (midFlowSteps.includes(current)) {
            return current;
          }
          if (current === STEPS.TERMS) {
            return STEPS.TERMS;
          }
          return STEPS.TERMS;
        });
      }

      setIsKycModalOpen(true);
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error(String(error));
      }
      setIsKycModalOpen(false);
    }
  };

  // Tier 2: hydrate LOADING → TERMS (or SUCCESS) when wallet is ready only.
  // Do not tie this to `step` or accepting terms will refetch and reset the modal.
  useEffect(() => {
    if (targetTier === 3 || !walletAddress) return;
    const timeoutId = setTimeout(() => {
      void fetchStatus();
    }, 500);
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress, targetTier]);

  // Poll KYC while SmileID result is pending — separate from step transitions.
  useEffect(() => {
    if (step !== STEPS.STATUS.PENDING) return;

    const startTime = Date.now();

    void fetchStatus();

    const intervalId = setInterval(() => {
      const elapsedSeconds = (Date.now() - startTime) / 1000;
      if (elapsedSeconds >= 600) {
        clearInterval(intervalId);
        setStep(STEPS.REFRESH);
      } else {
        void fetchStatus();
      }
    }, 10000);

    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Handle Smile ID publish event
  useEffect(() => {
    if (step !== STEPS.CAPTURE) {
      return;
    }

    if (!cameraElement) {
      return;
    }

    const handlePublish = async (event: any) => {
      smileIdSubmitInFlightRef.current = true;
      setStep(STEPS.LOADING);

      try {
        const { images, partner_params } = event.detail;

        // Validate data structure
        if (!images || !Array.isArray(images) || images.length === 0) {
          throw new Error("Invalid image data received");
        }

        if (!walletAddress) {
          throw new Error("Missing wallet address");
        }

        // Get access token for JWT authentication
        const accessToken = await getAccessToken();
        if (!accessToken) {
          throw new Error("No access token available");
        }

        // Validate ID info is selected
        if (!selectedCountry || !selectedIdType) {
          throw new Error("Please select country and ID type");
        }

        // For biometric_kyc (BVN, NIN, etc.), ID number is required
        if (!needsDocCapture && !idNumber) {
          throw new Error("Please enter your ID number");
        }

        const payload = {
          images,
          partner_params: {
            ...partner_params,
            user_id: `user-${walletAddress}`,
          },
          id_info: {
            country: selectedCountry.code,
            id_type: selectedIdType,
            ...(idNumber && { id_number: idNumber }),
          },
          email: user?.email?.address,
        };

        const response = await submitSmileIDData(payload, accessToken);

        if (response.status === "success") {
          setStep(STEPS.STATUS.PENDING);
          trackEvent("Account verification", {
            "Verification status": "Submitted",
          });
        } else {
          setFailedRetryStep(STEPS.TERMS);
          setStep(STEPS.STATUS.FAILED);
        }
      } catch (error) {
        toast.error("Failed to submit verification data");
        setFailedRetryStep(STEPS.TERMS);
        setStep(STEPS.STATUS.FAILED);
      } finally {
        smileIdSubmitInFlightRef.current = false;
      }
    };

    const handleCancel = () => {
      toast.info("Verification cancelled");
      setStep(STEPS.TERMS);
    };

    const handleBack = () => {
      // Handle back navigation if needed
    };

    cameraElement.addEventListener("smart-camera-web.publish", handlePublish);
    cameraElement.addEventListener("smart-camera-web.cancelled", handleCancel);
    cameraElement.addEventListener("smart-camera-web.back", handleBack);

    return () => {
      cameraElement.removeEventListener(
        "smart-camera-web.publish",
        handlePublish,
      );
      cameraElement.removeEventListener(
        "smart-camera-web.cancelled",
        handleCancel,
      );
      cameraElement.removeEventListener("smart-camera-web.back", handleBack);
    };
  }, [
    step,
    cameraElement,
    walletAddress,
    selectedCountry,
    selectedIdType,
    idNumber,
    needsDocCapture,
    getAccessToken,
    user,
  ]);

  return (
    <>
      <AnimatePresence mode="wait">
        {
          {
            [STEPS.TERMS]: renderTerms(),
            [STEPS.ID_INFO]: renderIdInfo(),
            [STEPS.CAPTURE]: renderCapture(),
            [STEPS.STATUS.PENDING]: renderPendingStatus(),
            [STEPS.STATUS.SUCCESS]: renderSuccessStatus(),
            [STEPS.STATUS.FAILED]: renderFailedStatus(),
            [STEPS.LOADING]: renderLoadingStatus(),
            [STEPS.REFRESH]: renderRefresh(),
            [STEPS.TIER3_PROMPT]: renderTier3Prompt(),
            [STEPS.TIER3_COUNTRY]: renderTier3Country(),
            [STEPS.TIER3_UPLOAD]: renderTier3Upload(),
          }[step]
        }
      </AnimatePresence>
      <DocumentRequirementsModal
        isOpen={tier3RequirementsOpen}
        onClose={() => setTier3RequirementsOpen(false)}
        addressDisplay={
          tier3AddressDisplay !== "—" ? tier3AddressDisplay : undefined
        }
      />
    </>
  );
};
