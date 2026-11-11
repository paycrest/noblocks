"use client";
import { Checkbox, DialogTitle } from "@headlessui/react";
import { toast } from "sonner";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
// smart-camera-web JSX types are declared in app/types/smart-camera-web.d.ts
declare global {
  interface Window {
    tf?: {
      load: () => void;
      reload: () => void;
    };
  }
}

import { SadFaceIcon, VerificationPendingIcon } from "./ImageAssets";
import { DropdownItem, FlexibleDropdown } from "./FlexibleDropdown";
import {
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowLeft02Icon,
  FileAddIcon,
  Folder02Icon,
  InformationCircleIcon,
  PencilEdit01Icon,
  PencilEdit02Icon,
  Tick01Icon,
  UserAccountIcon,
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
import { validateSmileIdIdInfo } from "../lib/smileIdIdValidation";
import { startSmileCameraAlertStyleFix } from "../lib/smileCameraTheme";
import { mapReportAndAct } from "../lib/toastMappedError";

const TIER3_DOCUMENT_TYPES = [
  { value: "utility_bill", label: "Electricity bill" },
] as const;

const MINUTES_GRADIENT_CLASS =
  "bg-[linear-gradient(171.3deg,_#04FF44_3.65%,_#EAAB12_49.19%,_#FF6B9099_110.87%,_#FF0087_142.57%,_#5189F9_210.67%)] bg-clip-text text-transparent";

// Figma titles are Inter Semi Bold 18/24 / text/primary (#fff in superdark).
const kycTitleClass =
  "font-inter m-0 text-lg font-semibold leading-6 text-black dark:text-white";
const kycSectionClass =
  "m-0 text-base font-medium leading-6 text-text-body dark:text-white/80";
const kycBodyClass =
  "text-sm font-normal leading-5 tracking-[-0.01em] text-text-body dark:text-white/80";
const kycMutedClass =
  "text-sm font-normal font-[400] leading-5 tracking-[-0.01em] text-text-secondary dark:text-white/50";
const kycHeaderIconClass = "size-7 shrink-0 text-text-disabled dark:text-white/40";
const kycLabelClass =
  "mb-2 block text-sm font-medium leading-5 tracking-[-0.01em] text-text-body dark:text-white";
const kycInputClass =
  "h-10 w-full rounded-xl border border-border-input bg-white px-2.5 text-sm tracking-[-0.01em] text-text-body placeholder:text-text-placeholder focus:outline-none focus:ring-2 focus:ring-lavender-500/50 dark:border-white/20 dark:bg-transparent dark:text-white dark:placeholder:text-white/30";
const kycSelectTriggerClass =
  "flex h-10 w-full items-center justify-between rounded-xl border border-border-input bg-white px-2.5 text-left text-sm tracking-[-0.01em] text-text-body focus:outline-none focus:ring-2 focus:ring-lavender-500/50 dark:border-white/20 dark:bg-transparent dark:text-white";
const kycCanvasCardClass = "overflow-hidden rounded-2xl bg-background-neutral dark:bg-surface-canvas";
const kycBtnType = "font-medium leading-5 tracking-[-0.01em]";
const kycSecondary40 = `${secondaryBtnClasses} ${kycBtnType} !h-10 !min-h-10 shrink-0 px-3 dark:bg-white/10`;
const kycPrimary40 = `${primaryBtnClasses} ${kycBtnType} !h-10 !min-h-10 w-full dark:disabled:bg-[#2E2E2E] dark:disabled:text-white/40`;
const kycPrimary44 = `${primaryBtnClasses} ${kycBtnType} h-11 min-h-11 w-full`;
const kycNoThanksClass = `${secondaryBtnClasses} ${kycBtnType} !h-10 !min-h-10 w-[100px] shrink-0 px-3 dark:bg-white/10`;

const TERMS_ITEMS = [
  "I agree to the Paycrest Terms of Service and acknowledge the Privacy Policy.",
  "I confirm that the information I provide is accurate and that I will use Paycrest in compliance with applicable laws and regulations.",
  "I understand that Paycrest facilitates fiat and digital asset transactions and that transactions may be irreversible once completed.",

] as const;

/** Figma checkmark-circle-02: 20px filled #39C65D circle with a cut-out check. */
const KycFilledCheck = ({ className = "size-5" }: { className?: string }) => (
  <svg
    className={className}
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M10 20C4.47715 20 0 15.5229 0 10C0 4.47715 4.47715 0 10 0C15.5229 0 20 4.47715 20 10C20 15.5229 15.5229 20 10 20ZM14.4355 7.80482C14.7645 7.41014 14.7112 6.82357 14.3165 6.49467C13.9218 6.16578 13.3352 6.2191 13.0063 6.61378L9.00726 11.4127L6.93685 9.34223C6.57356 8.97898 5.98458 8.97898 5.62129 9.34223C5.25802 9.70549 5.25802 10.2945 5.62129 10.6578L8.412 13.4485C8.59684 13.6333 8.85079 13.7318 9.11191 13.72C9.37302 13.7081 9.61712 13.587 9.78437 13.3862L14.4355 7.80482Z"
      fill="#39C65D"
    />
  </svg>
);

/** Figma _Base Checkbox checked: 21.3px rounded square in a 32px hit area; the check is a cut-out. */
const KycConsentCheck = () => (
  <svg
    width="32"
    height="32"
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M10.6654 5.33203C7.71985 5.33203 5.33203 7.71985 5.33203 10.6654V21.332C5.33203 24.2775 7.71985 26.6654 10.6654 26.6654H21.332C24.2775 26.6654 26.6654 24.2775 26.6654 21.332V10.6654C26.6654 7.71985 24.2775 5.33203 21.332 5.33203H10.6654ZM21.0257 12.278C20.6279 11.8951 19.9947 11.9076 19.6117 12.3053L14.5931 17.5163L12.4212 15.0104C12.0595 14.5931 11.4274 14.5481 11.0101 14.9098C10.5931 15.2715 10.5481 15.9027 10.9095 16.32L13.7982 19.654C13.9821 19.8661 14.247 19.9912 14.5277 19.9987C14.8084 20.0061 15.0799 19.8944 15.2747 19.6921L21.0521 13.6921C21.4352 13.2942 21.4235 12.6611 21.0257 12.278Z"
      fill="#8B85F4"
    />
  </svg>
);

/** Figma map-pinpoint-02 20px, white stroke, location + nearby pin. */
const KycMapPinIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M16.666 7.49935C15.9522 4.15026 12.492 1.66602 9.16695 1.66602C6.21464 1.66602 3.40738 3.41531 2.23791 6.14907C0.0749848 11.2051 4.5102 14.6877 7.81976 17.8052C8.18117 18.1435 8.66422 18.3327 9.16695 18.3327C9.62545 18.3327 10.0676 18.1753 10.416 17.891"
      stroke="white"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M11.6667 7.66351C11.1563 6.81649 10.2276 6.25 9.16667 6.25C7.55584 6.25 6.25 7.55584 6.25 9.16667C6.25 10.3302 6.93127 11.3345 7.91667 11.8027"
      stroke="white"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M14.166 13.334H14.1735"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M14.9151 18.0425C14.7144 18.2286 14.446 18.3327 14.1668 18.3327C13.8875 18.3327 13.6192 18.2286 13.4184 18.0425C11.5799 16.3279 9.11618 14.4125 10.3177 11.6317C10.9673 10.1281 12.5268 9.16602 14.1668 9.16602C15.8068 9.16602 17.3662 10.1281 18.0158 11.6317C19.2158 14.409 16.7581 16.3338 14.9151 18.0425Z"
      stroke="white"
      strokeWidth="1.5"
    />
  </svg>
);

const Tier3ProgressBar =
 ({ complete }: { complete: boolean }) => (
  <div className="h-0.5 w-full overflow-hidden bg-white/10">
    <div
      className="h-full bg-[#FF7D52]"
      style={{ width: complete ? "100%" : "50%" }}
    />
  </div>
);

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
  const {
    isInjectedWallet,
    injectedAddress,
    injectedReady,
    getInjectedToken,
    getInjectedAuthHeaders,
  } = useInjectedWallet();

  const embeddedWallet = wallets.find(
    (wallet) => wallet.walletClientType === "privy",
  );
  // Only surface the injected address once the wallet is connected/ready — until
  // then fall through to null so no KYC request fires with a half-initialized wallet.
  const walletAddress = isInjectedWallet
    ? injectedReady
      ? injectedAddress
      : null
    : embeddedWallet?.address;

  // Opening the KYC modal is an explicit user action — establish the injected
  // session here (one wallet signature, cached ~1h) so the modal's internal
  // status fetches and submissions find a token without their own popups.
  // Re-run the status hydration once the token lands: the 500ms hydration
  // effect below fires while the signature popup is still open, skips (no
  // token yet), and would otherwise leave the modal stuck on LOADING.
  useEffect(() => {
    if (isInjectedWallet && injectedReady) {
      void getInjectedToken({ interactive: true }).then((token) => {
        if (token && targetTier !== 3) void fetchStatus();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInjectedWallet, injectedReady, getInjectedToken, targetTier]);

  const [step, setStep] = useState<Step>(() =>
    targetTier === 3 ? STEPS.TIER3_PROMPT : STEPS.LOADING,
  );
  // Tracks where the retry button in renderFailedStatus should navigate back to.
  // Tier 3 failures retry at TIER3_UPLOAD; SmileID (Tier 2) failures retry at TERMS.
  const [failedRetryStep, setFailedRetryStep] = useState<Step>(STEPS.TERMS);
  const [failedReason, setFailedReason] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const cameraHostRef = useRef<HTMLElement | null>(null);
  const smileListenerCleanupRef = useRef<(() => void) | null>(null);
  const smileThemeObserverCleanupRef = useRef<(() => void) | null>(null);
  const stepRef = useRef(step);
  stepRef.current = step;
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
      tier3HouseNumber ? `No. ${tier3HouseNumber}` : "",
      tier3StreetAddress,
      tier3PostalCode,
      tier3County,
      tier3SelectedCountryLabel,
    ]
      .filter(Boolean)
      .join(", ") || "—";

  // Check if current selection requires document capture or just ID number
  const needsDocCapture = requiresDocumentCapture(
    selectedCountry,
    selectedIdType,
  );

  const smileIdIdNumberValidation = useMemo(() => {
    if (!selectedCountry || !selectedIdType || needsDocCapture) {
      return { ok: true as const };
    }
    return validateSmileIdIdInfo({
      country: selectedCountry.code,
      id_type: selectedIdType,
      id_number: idNumber,
    });
  }, [selectedCountry, selectedIdType, idNumber, needsDocCapture]);

  const captureSmileContextRef = useRef({
    walletAddress,
    selectedCountry,
    selectedIdType,
    idNumber,
    needsDocCapture,
    getAccessToken,
    user,
    isInjectedWallet,
    getInjectedToken,
  });
  captureSmileContextRef.current = {
    walletAddress,
    selectedCountry,
    selectedIdType,
    idNumber,
    needsDocCapture,
    getAccessToken,
    user,
    isInjectedWallet,
    getInjectedToken,
  };

  const detachSmileCameraListeners = () => {
    smileListenerCleanupRef.current?.();
    smileListenerCleanupRef.current = null;
  };

  const handleSmilePublish = async (event: Event) => {
    if (smileIdSubmitInFlightRef.current) {
      return;
    }

    const detail = (event as CustomEvent).detail as {
      images?: unknown[];
      partner_params?: Record<string, unknown>;
    };
    const ctx = captureSmileContextRef.current;

    if (!ctx.needsDocCapture) {
      const idCheck = validateSmileIdIdInfo({
        country: ctx.selectedCountry?.code ?? "",
        id_type: ctx.selectedIdType ?? "",
        id_number: ctx.idNumber,
      });
      if (!idCheck.ok) {
        toast.error(idCheck.message);
        setStep(STEPS.ID_INFO);
        return;
      }
    }

    smileIdSubmitInFlightRef.current = true;
    setStep(STEPS.LOADING);

    try {
      const { images, partner_params } = detail;

      if (!images || !Array.isArray(images) || images.length === 0) {
        throw new Error("Invalid image data received");
      }

      if (!ctx.walletAddress) {
        throw new Error("Missing wallet address");
      }

      const accessToken = await ctx.getAccessToken();
      // Injected wallets authenticate with a SIWE session token instead of a
      // Privy token. The session was normally established when the modal
      // opened; this re-prompts only if it expired mid-flow or was rejected.
      const injectedToken = ctx.isInjectedWallet
        ? await ctx.getInjectedToken({ interactive: true })
        : null;
      if (!accessToken && !injectedToken) {
        throw new Error("No access token available");
      }

      if (!ctx.selectedCountry || !ctx.selectedIdType) {
        throw new Error("Please select country and ID type");
      }

      if (!ctx.needsDocCapture && !ctx.idNumber) {
        throw new Error("Please enter your ID number");
      }

      const response = await submitSmileIDData(
        {
          images,
          partner_params: {
            ...partner_params,
            user_id: `user-${ctx.walletAddress}`,
          },
          id_info: {
            country: ctx.selectedCountry.code,
            id_type: ctx.selectedIdType,
            ...(ctx.idNumber && { id_number: ctx.idNumber }),
          },
          email: ctx.user?.email?.address,
        },
        accessToken,
        ctx.walletAddress,
        injectedToken,
      );

      if (response.status === "success" || response.status === "pending") {
        await refreshStatus(true);
        setStep(STEPS.STATUS.PENDING);
        trackEvent("Account verification", {
          "Verification status": "Submitted",
        });
      } else {
        setFailedReason(response.message || null);
        setFailedRetryStep(STEPS.TERMS);
        setStep(STEPS.STATUS.FAILED);
      }
    } catch (error) {
      let handled = false;
      mapReportAndAct(error, {
        feature: "kyc-smile-verification",
        onUserMessage: (message) => {
          handled = true;
          setFailedReason(message);
          setFailedRetryStep(STEPS.TERMS);
          setStep(STEPS.STATUS.FAILED);
        },
      });
      // If mapReportAndAct suppressed the error (e.g. Hotjar), still advance out of LOADING
      if (!handled) {
        setFailedReason(null);
        setFailedRetryStep(STEPS.TERMS);
        setStep(STEPS.STATUS.FAILED);
      }
    } finally {
      smileIdSubmitInFlightRef.current = false;
    }
  };

  const attachSmileCameraListeners = (host: HTMLElement) => {
    detachSmileCameraListeners();

    const onPublish = (event: Event) => {
      void handleSmilePublish(event);
    };
    const onCancel = () => {
      toast.info("Verification cancelled");
      setStep(STEPS.TERMS);
    };
    const onBack = () => {};

    host.addEventListener("smart-camera-web.publish", onPublish);
    host.addEventListener("smart-camera-web.cancelled", onCancel);
    host.addEventListener("smart-camera-web.back", onBack);

    smileListenerCleanupRef.current = () => {
      host.removeEventListener("smart-camera-web.publish", onPublish);
      host.removeEventListener("smart-camera-web.cancelled", onCancel);
      host.removeEventListener("smart-camera-web.back", onBack);
    };
  };

  const detachSmileCameraAlertStyleFix = () => {
    smileThemeObserverCleanupRef.current?.();
    smileThemeObserverCleanupRef.current = null;
  };

  const attachSmileCameraAlertStyleFix = (host: HTMLElement) => {
    detachSmileCameraAlertStyleFix();
    smileThemeObserverCleanupRef.current = startSmileCameraAlertStyleFix(host);
  };

  const bindCameraHostRef = (el: HTMLElement | null) => {
    if (cameraHostRef.current && cameraHostRef.current !== el) {
      detachSmileCameraListeners();
      detachSmileCameraAlertStyleFix();
    }
    cameraHostRef.current = el;
    if (el && stepRef.current === STEPS.CAPTURE) {
      attachSmileCameraListeners(el);
      attachSmileCameraAlertStyleFix(el);
    } else if (!el) {
      detachSmileCameraListeners();
      detachSmileCameraAlertStyleFix();
    }
  };

  useLayoutEffect(() => {
    if (step !== STEPS.CAPTURE) {
      detachSmileCameraAlertStyleFix();
      return;
    }
    const host = cameraHostRef.current;
    if (!host) return;

    attachSmileCameraAlertStyleFix(host);
    return detachSmileCameraAlertStyleFix;
  }, [step, smileIdLoaded]);

  useEffect(() => {
    // Only load SmileID components for Tier 2 verification flow
    if (targetTier === 3) return;
    if (typeof window !== "undefined" && !smileIdLoaded) {
      import("@smileid/web-components/smart-camera-web")
        .then(() => {
          setSmileIdLoaded(true);
        })
        .catch((error) => {
          mapReportAndAct(error, {
            feature: "kyc-component-load",
            onUserMessage: (message) => {
              toast.error(message);
            },
          });
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
        <UserAccountIcon className={kycHeaderIconClass} />
        <h2 className={kycTitleClass}>
          Verify your identity in{" "}
          <span className={MINUTES_GRADIENT_CLASS}>2 minutes</span>
        </h2>
      </div>

      <div className="space-y-4 rounded-2xl border-[0.3px] border-border-light bg-background-neutral p-4 dark:border-white/10 dark:bg-white/5">
        <h4 className={kycSectionClass}>
          Accept terms to get started
        </h4>

        <div className="flex w-[335px] max-w-full flex-col gap-5">
          {TERMS_ITEMS.map((item, index) => {
            const isLast = index === TERMS_ITEMS.length - 1;
            return (
              <div key={item} className="flex w-full items-start gap-2">
                <span className="flex size-7 shrink-0 items-start justify-center">
                  <KycFilledCheck />
                </span>
                <div
                  className={classNames(
                    "w-[289px] max-w-[289px] shrink-0",
                    isLast ? "flex flex-col gap-5" : "",
                  )}
                >
                  <p className={kycMutedClass}>{item}</p>
                  {isLast ? (
                    <a
                      href="/kyc-policy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full text-sm font-normal leading-5 tracking-[-0.01em] text-lavender-500 hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        window.open("/kyc-policy", "_blank");
                      }}
                    >
                      Read full Terms and Conditions
                    </a>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border-[0.3px] border-border-light p-4 dark:border-white/10">
        <div className="flex items-center gap-3.5">
          <Checkbox
            checked={termsAccepted}
            onChange={(checked) => setTermsAccepted(checked)}
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center"
          >
            {termsAccepted ? (
              <KycConsentCheck />
            ) : (
              <span className="block h-[21.3px] w-[21.3px] rounded-[5.33px] border border-border-input bg-transparent dark:border-white/30" />
            )}
          </Checkbox>
          <p className="w-[289px] max-w-[289px] shrink-0 text-xs font-normal font-[400] leading-4 text-text-secondary dark:text-white/50">
            By clicking &ldquo;sign and continue&rdquo; below, you are agreeing to the terms and policies above
          </p>
        </div>
      </div>

      <div className="flex gap-4">
        <button
          type="button"
          onClick={() => setIsKycModalOpen(false)}
          className={kycNoThanksClass}
        >
          No, thanks
        </button>
        <button
          type="button"
          className={kycPrimary40}
          disabled={!termsAccepted}
          onClick={handleAcceptTerms}
        >
          Sign and continue
        </button>
      </div>
    </motion.div>
  );

  const renderIdInfo = () => (
    <motion.div key="id_info" {...fadeInOut} className="space-y-4">
      <div className="space-y-3">
        <UserAccountIcon className={kycHeaderIconClass} />
        <div className="space-y-1">
          <h2 className={kycTitleClass}>
            Select your ID document
          </h2>
          <p className={kycMutedClass}>
            Choose your country and the type of ID you&apos;ll use for
            verification.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Country Selection */}
        <div>
          <label className={kycLabelClass}>
            Country
          </label>
          <FlexibleDropdown
            panelClassName="font-general-sans"
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
            searchable
            searchPlaceholder="Search countries…"
          >
            {({ selectedItem, isOpen, toggleDropdown }) => (
              <button
                type="button"
                onClick={toggleDropdown}
                className={kycSelectTriggerClass}
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
            <label className={kycLabelClass}>
              ID Type
            </label>
            <FlexibleDropdown
            panelClassName="font-general-sans"
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
                  className={kycSelectTriggerClass}
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
            <label className={kycLabelClass}>
              {selectedIdType.replace(/_/g, " ")} Number
            </label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
              placeholder={`Enter your ${selectedIdType.replace(/_/g, " ")} number`}
              className={kycInputClass}
            />
            <p className="mt-1 text-xs leading-4 text-text-secondary dark:text-white/50">
              Your ID will be verified against the government database
            </p>
          </div>
        )}
      </div>

      <div className="flex gap-4">
        <button
          type="button"
          onClick={() => setStep(STEPS.TERMS)}
          className={kycSecondary40}
        >
          Back
        </button>
        <button
          type="button"
          className={kycPrimary40}
          disabled={
            !selectedCountry ||
            !selectedIdType ||
            !smileIdIdNumberValidation.ok ||
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
    <motion.div key="capture" {...fadeInOut} className="flex flex-col py-4 max-h-[min(85vh,48rem)] supports-[height:100dvh]:max-h-[min(90dvh,48rem)]">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
        <UserAccountIcon className={kycHeaderIconClass} />
        <button
        type="button"
        onClick={() => setStep(STEPS.ID_INFO)}
        className="mb-3 flex flex-shrink-0 items-center gap-1.5 self-start text-sm tracking-[-0.01em] text-text-secondary transition-colors hover:text-text-body dark:text-white/50 dark:hover:text-white"
      >
        <ArrowLeft01Icon className="size-4" />
        Back
      </button>
      </div>
        <div className="space-y-2">
          <h2 className={kycTitleClass}>
            {needsDocCapture ? "Capture your documents" : "Take a selfie"}
          </h2>
          <p className="text-sm tracking-[-0.01em] text-gray-500 dark:text-white/50">
            {needsDocCapture
              ? "Please take a selfie and capture your ID document for verification."
              : "Please take a selfie to verify your identity against your ID."}
          </p>
        </div>
      </div>

      <div
        className={classNames(
          "mx-auto w-full min-h-0 max-w-md flex-1",
          needsDocCapture
            ? "flex flex-col overflow-visible"
            : "flex justify-center",
        )}
      >
        {needsDocCapture ? (
          <smart-camera-web
            ref={bindCameraHostRef}
            className="noblocks-kyc-camera-host block h-full min-h-0 w-full flex-1"
            theme-color="#8B85F4"
            capture-id
            hide-attribution
            style={
              {
                "--web-digital-blue": "#FFFFFF",
                "--color-active": "#FFFFFF",
              } as React.CSSProperties
            }
          />
        ) : (
          <smart-camera-web
           ref={bindCameraHostRef}
           className="noblocks-kyc-camera-host block h-full min-h-0 w-full flex-1"
           theme-color="#8B85F4"
           hide-attribution
           style={
             {
               "--web-digital-blue": "#FFFFFF",
               "--color-active": "#FFFFFF",
             } as React.CSSProperties
           }
          />
        )}
      </div>
    </motion.div>
  );

  const renderPendingStatus = () => (
    <motion.div key="pending" {...fadeInOut} className="space-y-4">
      <div className="relative flex h-[186px] w-full flex-col items-center">
        <Clock05Icon className="mt-[17px] text-yellow-primary" size={40} />
        <div className="mt-[22px] w-full max-w-[322px] space-y-3 text-center">
        <DialogTitle className={kycTitleClass}>
          {targetTier === 3
            ? "Tier 3 Upgrade in progress"
            : "Tier 2 Upgrade in progress"}
        </DialogTitle>

        <p className={kycBodyClass}>
          {targetTier === 3
            ? "We are currently verifying your proof of address. You will get feedback within 48 hours. Kindly check back soon"
            : "We are currently verifying your identity. You will get feedback within 24 hours. Kindly check back soon"}
        </p>
        </div>
      </div>

      <button
        type="button"
        className={kycPrimary44}
        onClick={async () => {
          await refreshStatus(true);
          setIsKycModalOpen(false);
        }}
      >
        Got it
      </button>
    </motion.div>
  );

  const renderSuccessStatus = () => {
    const tier3LimitLabel = KYC_TIERS[3].limits.unlimited
      ? "unlimited"
      : `$${formatNumberWithCommas(KYC_TIERS[3].limits.monthly)}`;
    const tier3SuccessBody = `You can now swap crypto of up to ${tier3LimitLabel} monthly on Noblocks`;
    return (
    <motion.div key="success" {...fadeInOut} className="space-y-4">
      <div className="relative flex h-[186px] w-full flex-col items-center">
        <CheckmarkCircle01Icon className="mt-[17px] size-10" color="#39C65D" />
        <div className="mt-[22px] w-full max-w-[322px] space-y-3 text-center">
        <DialogTitle className={kycTitleClass}>
          {targetTier === 3 ? "Tier 3 upgrade successful" : "Verification successful"}
        </DialogTitle>

        <p className={kycBodyClass}>
          {targetTier === 3
            ? tier3SuccessBody
            : "You can now continue swapping your crypto to fiats at zero fees on noblocks"}
        </p>
        </div>
      </div>

      <button
        type="button"
        className={kycPrimary44}
        onClick={async () => {
          await refreshStatus(true);
          setIsUserVerified(true);
          setIsKycModalOpen(false);
        }}
      >
        Let&apos;s go!
      </button>
    </motion.div>
    );
  };

  const getFailureHint = (reason: string | null): string => {
    if (!reason) return "Your verification couldn’t be completed. Please check all requirements and try again.";
    const t = reason.toLowerCase();
    if (t.includes("timeout") || t.includes("database") || t.includes("service unavailable") || t.includes("server error") || t.includes("temporarily unavailable") || t.includes("connection")) {
      return "The government database may be temporarily unavailable. Try a different ID type (e.g. Driver’s License) or retry later.";
    }
    if (t.includes("readable") || t.includes("bright") || t.includes("blurry") || t.includes("quality") || t.includes("not clear")) {
      return "Your image was unclear. Retake in better lighting, or try a different ID type.";
    }
    if (t.includes("liveness")) {
      return "Liveness check failed. Look directly at the camera with good lighting and try again.";
    }
    if (t.includes("mismatch") || t.includes("face")) {
      return "Your selfie didn’t match the ID. Ensure you’re submitting your own valid ID.";
    }
    return "Verification failed. Please try again with a different ID type or contact support.";
  };

  const renderFailedStatus = () => (
    <motion.div key="failed" {...fadeInOut} className="space-y-4">
      <SadFaceIcon className="mx-auto" />

      <div className="space-y-3 text-center">
        <DialogTitle className={kycTitleClass}>
          Verification failed
        </DialogTitle>

        {failedReason && (
          <p className="text-xs leading-4 text-text-secondary dark:text-white/30">{failedReason}</p>
        )}

        <p className={kycBodyClass}>
          {getFailureHint(failedReason)}
        </p>
      </div>

      <button
        type="button"
        className={kycPrimary44}
        onClick={() => {
          setFailedReason(null);
          setStep(failedRetryStep);
        }}
      >
        Retry verification
      </button>
    </motion.div>
  );

  const renderLoadingStatus = () => (
    <motion.div key="loading" {...fadeInOut} className="space-y-4">
      <div className="mx-auto size-10 animate-pulse rounded-full bg-gray-200 motion-reduce:animate-none dark:bg-white/10" />
      <div className="space-y-3">
        <div className="mx-auto h-5 w-40 animate-pulse rounded bg-gray-200 motion-reduce:animate-none dark:bg-white/10" />
        <div className="mx-auto h-4 w-full max-w-[280px] animate-pulse rounded bg-gray-200 motion-reduce:animate-none dark:bg-white/10" />
        <div className="mx-auto h-4 w-3/4 max-w-[220px] animate-pulse rounded bg-gray-200 motion-reduce:animate-none dark:bg-white/10" />
      </div>
      <div className="h-11 w-full animate-pulse rounded-xl bg-gray-200 motion-reduce:animate-none dark:bg-white/10" />
    </motion.div>
  );

  const renderRefresh = () => (
    <motion.div key="refresh" {...fadeInOut} className="space-y-4">
      <VerificationPendingIcon className="mx-auto" />

      <div className="space-y-3 text-center">
        <DialogTitle className={kycTitleClass}>
          Refresh to Update KYC
        </DialogTitle>

        <p className={kycBodyClass}>
          If you have completed your KYC, click Refresh to update your KYC
          status.
        </p>
      </div>

      <button
        type="button"
        className={kycPrimary44}
        onClick={handleRefresh}
      >
        {isRefreshing ? "Refreshing..." : "Refresh"}
      </button>
    </motion.div>
  );

  // Tier 3: Address verification card (reused in Tier 3 steps)
  const Tier3AddressCard = ({
    className,
    subtitle = "Utility bill, Phone bill, Bank statement.",
    compact = false,
  }: {
    className?: string;
    subtitle?: string;
    compact?: boolean;
  }) => (
    <div
      className={classNames(
        "flex items-center rounded-2xl",
        compact ? "h-[38px] gap-3" : "h-[62px] gap-4 px-4",
        className || "",
      )}
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#FF7D52]">
        <KycMapPinIcon />
      </div>
      <div className="space-y-0.5">
        <p className="text-sm font-medium leading-5 tracking-[-0.01em] text-text-body dark:text-white/80">
          Address verification
        </p>
        <p className="text-xs font-normal leading-4 text-text-secondary dark:text-white/50">
          {subtitle}
        </p>
      </div>
    </div>
  );

  const renderTier3Prompt = () => {
    const tier3Limits = KYC_TIERS[3];
    return (
      <motion.div key="tier3_prompt" {...fadeInOut} className="space-y-4">
        <div className="space-y-3">
          <UserAccountIcon className={kycHeaderIconClass} />
          <h2 className={kycTitleClass}>
            Upgrade KYC to Tier 3 in{" "}
            <span className={MINUTES_GRADIENT_CLASS}>2 minutes</span>
          </h2>
        </div>
        <div className="space-y-4 rounded-2xl border-[0.3px] border-border-light bg-background-neutral p-4 dark:border-white/10 dark:bg-white/5">
          <div className="space-y-4">
            <p className={kycSectionClass}>
              Account limit
            </p>
            <div className="flex flex-col items-start gap-4 rounded-3xl border border-border-light p-4 dark:border-white/10">
              <span className="inline-flex h-7 items-center rounded-lg bg-[#39C65D] px-2 py-1 text-sm font-semibold leading-5 text-[#121217]">
                <StarIcon className="size-4" color="#121217" />
                <span className="px-1">Tier 3</span>
              </span>
              <div className="flex w-full flex-col items-start gap-2">
                <p className="flex items-center gap-1 text-sm font-medium leading-6 text-black dark:text-white">
                  Monthly limit
                  <InformationCircleIcon className="size-4 shrink-0 text-text-placeholder dark:text-white/30" />
                </p>
                <span className="text-2xl font-medium leading-9 tracking-[-0.03em] text-black dark:text-white">
                  {tier3Limits.limits.unlimited
                    ? "Unlimited"
                    : `$${formatNumberWithCommas(tier3Limits.limits.monthly)}`}
                </span>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <p className={kycSectionClass}>
              Key requirements
            </p>
            <Tier3AddressCard className="border border-border-light dark:border-white/10" />
          </div>
        </div>
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => setIsKycModalOpen(false)}
            className={kycNoThanksClass}
          >
            No, thanks
          </button>
          <button
            type="button"
            onClick={() => setStep(STEPS.TIER3_COUNTRY)}
            className={kycPrimary40}
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
        <UserAccountIcon className={kycHeaderIconClass} />
        <h2 className={kycTitleClass}>
          Get started with Tier 3 KYC Upgrade
        </h2>
      </div>
      <p className={kycMutedClass}>
        {tier3CountryCode
          ? "Fill the details below to upgrade"
          : "Fill the details below to start upgrade"}
      </p>
      <div className={kycCanvasCardClass}>
        <div className="mb-4 space-y-4 px-4 pt-4">
          <Tier3AddressCard
            compact
            className="border-none bg-transparent p-0"
            subtitle="Utility bill & Bank statement."
          />
          <div>
            <label className={kycLabelClass}>
              Country of Residence
            </label>
            <FlexibleDropdown
            panelClassName="font-general-sans"
              data={tier3CountryOptions}
              selectedItem={tier3CountryCode}
              onSelect={(code) => setTier3CountryCode(code)}
              mobileTitle="Select Country"
              dropdownWidth={350}
              searchable
              searchPlaceholder="Search countries…"
            >
              {({ selectedItem, isOpen, toggleDropdown }) => (
                <button
                  type="button"
                  onClick={toggleDropdown}
                  className={kycSelectTriggerClass}
                >
                  <span className={classNames("flex min-w-0 items-center gap-2", selectedItem ? "" : "text-text-placeholder dark:text-white/30")}>
                    {selectedItem?.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={selectedItem.imageUrl}
                        alt=""
                        className="h-4 w-6 shrink-0 rounded-sm object-cover"
                      />
                    ) : null}
                    {selectedItem?.label || "Enter country of residence"}
                  </span>
                  <ArrowDown01Icon
                    className={classNames(
                      "size-5 shrink-0 text-text-placeholder transition-transform",
                      isOpen ? "rotate-180" : "",
                    )}
                  />
                </button>
              )}
            </FlexibleDropdown>
          </div>
        </div>
        <Tier3ProgressBar complete={false} />
        {tier3CountryCode != "" && (
          <div className="space-y-4 p-4">
            <div>
              <label className={kycLabelClass}>
                House Number
              </label>
              <input
                type="text"
                value={tier3HouseNumber}
                onChange={(e) => setTier3HouseNumber(e.target.value)}
                placeholder="Enter house number"
                className={kycInputClass}
              />
            </div>
            <div>
              <label className={kycLabelClass}>
                Street Address
              </label>
              <input
                type="text"
                value={tier3StreetAddress}
                onChange={(e) => setTier3StreetAddress(e.target.value)}
                placeholder="Enter street address"
                className={kycInputClass}
              />
            </div>
            <div>
              <label className={kycLabelClass}>
                County
              </label>
              <input
                type="text"
                value={tier3County}
                onChange={(e) => setTier3County(e.target.value)}
                placeholder="Select county"
                className={kycInputClass}
              />
            </div>
            <div>
              <label className={kycLabelClass}>
                Postal code
              </label>
              <input
                type="text"
                value={tier3PostalCode}
                onChange={(e) => setTier3PostalCode(e.target.value)}
                placeholder="Enter postal code"
                className={kycInputClass}
              />
            </div>
          </div>
        )}
      </div>
      <div className="flex gap-4">
        <button
          type="button"
          onClick={() => setIsKycModalOpen(false)}
          className={kycSecondary40}
        >
          Cancel
        </button>
        <button
          type="button"
          className={kycPrimary40}
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

  const ALLOWED_TIER3_EXTENSIONS = ["JPG", "JPEG", "PNG"];
  const TIER3_MAX_BYTES = 5 * 1024 * 1024;

  const renderTier3Upload = () => {
    const handleTier3FileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const input = e.currentTarget;
      const file = input.files?.[0];
      if (!file) return;
      const ext = file.name.split(".").pop()?.toUpperCase();
      if (!ext || !ALLOWED_TIER3_EXTENSIONS.includes(ext)) {
        setTier3UploadedFile(null);
        setTier3ErrorMessage(
          "Invalid file type; allowed: JPG, JPEG, PNG",
        );
        input.value = "";
        return;
      }
      if (file.size > TIER3_MAX_BYTES) {
        setTier3UploadedFile(null);
        setTier3ErrorMessage("File is bigger than 5MB. Upload again");
        input.value = "";
        return;
      }
      setTier3ErrorMessage(null);
      setTier3UploadedFile(file);
      input.value = "";
    };
    const handleTier3Drop = (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (!file) return;
      const ext = file.name.split(".").pop()?.toUpperCase();
      if (!ext || !ALLOWED_TIER3_EXTENSIONS.includes(ext)) {
        setTier3UploadedFile(null);
        setTier3ErrorMessage(
          "Invalid file type; allowed: JPG, JPEG, PNG",
        );
        return;
      }
      if (file.size > TIER3_MAX_BYTES) {
        setTier3UploadedFile(null);
        setTier3ErrorMessage("File is bigger than 5MB. Upload again");
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
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setStep(STEPS.TIER3_COUNTRY)}
            className="flex size-7 items-center justify-center text-text-body hover:text-text-secondary dark:text-white dark:hover:text-white/70"
            aria-label="Back"
          >
            <ArrowLeft02Icon className="size-7" />
          </button>
          <h2 className={kycTitleClass}>
            Upload proof of address
          </h2>
        </div>
        <p className={kycMutedClass}>
          Provide any of the document below as proof of your residential
          address
        </p>
        <div className={kycCanvasCardClass}>
          <div className="mb-4 space-y-4 px-4 pt-4">
          <Tier3AddressCard
            compact
            className="border-none bg-transparent p-0"
            subtitle="Utility bill & Bank statement."
          />
          <button
            type="button"
            onClick={() => setStep(STEPS.TIER3_COUNTRY)}
            className="flex w-full flex-col items-start gap-2 text-left"
          >
            <p className="flex items-center gap-1 text-sm font-normal leading-6 text-text-secondary dark:text-white/50">
              Current address{" "}
              <PencilEdit01Icon className="size-4 text-text-secondary hover:text-text-body dark:text-white/50 dark:hover:text-white/70" />
            </p>
            <p className={kycBodyClass}>
              {tier3AddressDisplay !== "—" ? tier3AddressDisplay : "—"}
            </p>
          </button>
          </div>
          <Tier3ProgressBar complete />
          <div className="space-y-2 p-4">
            <label className={kycLabelClass}>
              Document type
            </label>
            <FlexibleDropdown
            panelClassName="font-general-sans"
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
                  className={kycSelectTriggerClass}
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
          <div className="rounded-2xl bg-background-neutral p-4 dark:bg-surface-canvas">
            <div className="mb-4 flex items-center justify-between">
              <label className="text-base font-medium leading-6 text-text-body dark:text-white/80">
                Upload {docLabel}
              </label>
              <button
                type="button"
                onClick={() => setTier3RequirementsOpen(true)}
                className="text-sm font-medium leading-5 text-lavender-500 hover:underline"
              >
                See requirements
              </button>
            </div>
            <div
              onDrop={handleTier3Drop}
              onDragOver={(e) => e.preventDefault()}
              className="flex h-[120px] flex-col items-start gap-2.5 rounded-2xl border border-dashed border-white/10 bg-transparent p-4"
            >
              <div className="flex size-[34px] shrink-0 items-center justify-center rounded-lg border border-white/10 p-2">
                {tier3UploadedFile ? (
                  <Tick01Icon className="size-[18px] text-[#39C65D]" />
                ) : (
                  <FileAddIcon className="size-[18px] text-black dark:text-white/50" />
                )}
              </div>
              {tier3UploadedFile ? (
                <div className="flex flex-col gap-2">
                  <p className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-sm font-normal leading-5 tracking-[-0.01em] text-text-body dark:text-white/80">
                    <span className="break-all">{tier3UploadedFile.name}</span>
                    <label className="inline-flex cursor-pointer items-center gap-1 text-sm tracking-[-0.01em] text-lavender-500 hover:underline">
                      <PencilEdit02Icon className="size-4 shrink-0" />
                      Change
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                        className="sr-only"
                        onChange={handleTier3FileChange}
                      />
                    </label>
                  </p>
                  <p className="text-xs font-normal leading-4 text-text-secondary dark:text-white/50">
                    Size:{" "}
                    {(() => {
                      const mb = tier3UploadedFile.size / 1024 / 1024;
                      return mb >= 1
                        ? `${parseFloat(mb.toFixed(mb >= 10 ? 0 : 1))}MB`
                        : `${mb.toFixed(2)}MB`;
                    })()}{" "}
                    Format:{" "}
                    {String(
                      tier3UploadedFile.name?.split(".").pop() ??
                        tier3UploadedFile.type?.split("/")[1] ??
                        "UNKNOWN",
                    ).toUpperCase()}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="flex items-center gap-1 text-sm font-normal leading-5 tracking-[-0.01em] text-text-body dark:text-white/80">
                    Drag and drop or{" "}
                    <label className="flex cursor-pointer items-center gap-1 text-lavender-500 hover:underline">
                      <Folder02Icon className="size-3.5" /> Browse File
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                        className="sr-only"
                        onChange={handleTier3FileChange}
                      />
                    </label>
                  </p>
                  <p className="text-xs font-normal leading-4 text-text-secondary dark:text-white/50">
                    JPG, JPEG, PNG allowed. 5MB Max.
                  </p>
                </div>
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
            className={kycSecondary40}
          >
            Cancel
          </button>
          <button
            type="button"
            className={kycPrimary40}
            disabled={!tier3UploadedFile || tier3Submitting}
            onClick={async () => {
              if (!tier3UploadedFile || tier3Submitting) return;
              setTier3Submitting(true);
              try {
                const accessToken = await getAccessToken();
                // Injected wallets authenticate via the x-injected-token SIWE
                // session (interactive: submitting is a user action, so
                // re-prompting on an expired session is expected here).
                const injectedHeaders = isInjectedWallet
                  ? await getInjectedAuthHeaders({ interactive: true })
                  : null;
                if (!accessToken && !injectedHeaders) {
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

                const headers: Record<string, string> = injectedHeaders
                  ? { ...injectedHeaders }
                  : accessToken
                    ? { Authorization: `Bearer ${accessToken}` }
                    : {};

                const res = await fetch("/api/kyc/tier3-verify", {
                  method: "POST",
                  headers,
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
                  setFailedReason(errorDetail);
                  setFailedRetryStep(STEPS.TIER3_UPLOAD);
                  setStep(STEPS.STATUS.FAILED);
                  setTier3Submitting(false);
                  return;
                }

                const data = await res.json();
                if (data?.success) {
                  setStep(STEPS.STATUS.SUCCESS);
                } else {
                  const errorDetail =
                    data?.error || data?.message || "Tier 3 verification failed.";
                  toast.error("Tier 3 verification failed", { description: errorDetail });
                  setFailedReason(errorDetail);
                  setFailedRetryStep(STEPS.TIER3_UPLOAD);
                  setStep(STEPS.STATUS.FAILED);
                }
              } catch (e) {
                mapReportAndAct(e, {
                  feature: "kyc-tier3-verification",
                  onUserMessage: (message) => {
                    toast.error(message);
                    setFailedReason(message);
                    setFailedRetryStep(STEPS.TIER3_UPLOAD);
                    setStep(STEPS.STATUS.FAILED);
                  },
                });
              } finally {
                setTier3Submitting(false);
              }
            }}
          >
            {tier3Submitting
              ? "Verifying…"
              : tier3UploadedFile
                ? "Complete upgrade"
                : "Continue"}
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
      // Passive token read: the session is established by the modal-open
      // effect; a status poll must never pop a signature request. Until the
      // user signs, skip quietly (the modal shows its loading state).
      const injectedHeaders = isInjectedWallet
        ? await getInjectedAuthHeaders({ interactive: false })
        : null;
      const accessToken = isInjectedWallet ? null : await getAccessToken();
      if (!accessToken && !injectedHeaders) return;

      const headers: Record<string, string> = injectedHeaders
        ? { ...injectedHeaders }
        : { Authorization: `Bearer ${accessToken}` };

      const res = await fetch("/api/kyc/status", { headers });

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
        // This fetch is local to the modal — push the upgrade into KYCContext too,
        // so profile/limit UIs don't keep showing the old tier (and its 30s cache
        // window) while the success screen is visible.
        void refreshStatus(true);
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

      // Do not reopen while polling SmileID (user may have closed the modal).
      if (step !== STEPS.STATUS.PENDING) {
        setIsKycModalOpen(true);
      }
    } catch (error) {
      mapReportAndAct(error, {
        feature: "kyc-status-check",
        onUserMessage: (message) => {
          toast.error(message);
          setIsKycModalOpen(false);
        },
      });
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

  // Re-bind Smile listeners when capture context changes (ref callback handles initial mount).
  useEffect(() => {
    if (step !== STEPS.CAPTURE) {
      detachSmileCameraListeners();
      return;
    }
    const host = cameraHostRef.current;
    if (host) {
      attachSmileCameraListeners(host);
    }
    return () => detachSmileCameraListeners();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    step,
    walletAddress,
    selectedCountry,
    selectedIdType,
    idNumber,
    needsDocCapture,
    user,
  ]);

  return (
    <div className="font-general-sans">
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
    </div>
  );
};
