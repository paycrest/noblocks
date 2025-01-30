"use client";
import {
  Checkbox,
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
  Field,
  Label,
} from "@headlessui/react";
import { toast } from "sonner";
import { QRCode } from "react-qrcode-logo";
import { usePrivy } from "@privy-io/react-auth";
import { FiExternalLink } from "react-icons/fi";
import { IoMdClose } from "react-icons/io";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useCallback, useEffect } from "react";

import {
  CheckIcon,
  QrCodeIcon,
  SadFaceIcon,
  UserDetailsIcon,
  VerificationPendingIcon,
} from "./ImageAssets";
import { fadeInOut } from "./AnimatedComponents";
import { generateTimeBasedNonce } from "../utils";
import { fetchKYCStatus, initiateKYC } from "../api/aggregator";
import { primaryBtnClasses, secondaryBtnClasses } from "./Styles";
import { trackEvent } from "../hooks/analytics";

const STEPS = {
  TERMS: "terms",
  QR_CODE: "qr_code",
  STATUS: {
    PENDING: "pending",
    SUCCESS: "success",
    FAILED: "failed",
  },
  LOADING: "loading",
  EXPIRED: "expired",
  REFRESH: "refresh",
} as const;

type Step =
  | typeof STEPS.TERMS
  | typeof STEPS.QR_CODE
  | typeof STEPS.LOADING
  | typeof STEPS.REFRESH
  | (typeof STEPS.STATUS)[keyof typeof STEPS.STATUS];

const terms = [
  {
    id: "privacyPolicy",
    label: "Privacy Policy",
    url: "/privacy-policy",
    text: "I understand my privacy is protected through self-custody wallets, and only essential transaction details will be processed. Personal data won't be shared without consent unless legally required.",
  },
  {
    id: "termsAndConditions1",
    label: "Terms and Conditions",
    url: "/terms",
    text: "I understand I maintain control of my assets but must complete KYC verification through a third party. I confirm I'm not in a restricted region or a Politically Exposed Person.",
  },
  {
    id: "termsAndConditions2",
    label: "Terms and Conditions",
    url: "/terms",
    text: "I understand I'm responsible for my wallet security and payment accuracy. I confirm I'm at least 18 years old and will use this service in compliance with applicable laws.",
  },
] as const;

export const KycModal = ({
  setIsUserVerified,
}: {
  setIsUserVerified: (value: boolean) => void;
}) => {
  const { user, signMessage } = usePrivy();
  const walletAddress = user?.wallet?.address;

  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<Step>(STEPS.TERMS);
  const [kycUrl, setKycUrl] = useState("");
  const [termsAccepted, setTermsAccepted] = useState<Record<string, boolean>>(
    Object.fromEntries(terms.map((term) => [term.id, false])),
  );
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleTermChange = useCallback((termId: string, value: boolean) => {
    setTermsAccepted((prev) => ({ ...prev, [termId]: value }));
  }, []);

  const isAllTermsAccepted = Object.values(termsAccepted).every(Boolean);

  const handleSignAndContinue = async () => {
    const nonce = generateTimeBasedNonce({ length: 16 });
    const message = `I accept the KYC Policy and hereby request an identity verification check for ${walletAddress} with nonce ${nonce}`;
    const uiConfig = {
      buttonText: "Sign",
    };

    try {
      setIsOpen(false);
      const signature = await signMessage({ message }, { uiOptions: uiConfig });
      if (signature) {
        setIsOpen(true);
        setStep(STEPS.LOADING);

        const response = await initiateKYC({
          signature: signature.signature.startsWith("0x")
            ? signature.signature.slice(2)
            : signature.signature,
          walletAddress: walletAddress || "",
          nonce,
        });

        if (response.status === "success") {
          setStep(STEPS.QR_CODE);
          setKycUrl(response.data.url);
          trackEvent("verification_initiated", {
            walletAddress,
          });
        } else {
          setStep(STEPS.STATUS.FAILED);
          trackEvent("verification_initiation_failed", {
            walletAddress,
          });
        }
      }
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error as any).response &&
        (error as any).response.data
      ) {
        // backend error response
        const { status, message, data } = (error as any).response.data;
        toast.error(`${message}: ${data}`);
      } else {
        // unexpected errors
        toast.error(error instanceof Error ? error.message : String(error));
      }
      setIsOpen(false);
      setStep(STEPS.TERMS);
    }
  };

  const QRCodeComponent = useCallback(
    () => (
      <div className="w-full">
        <QRCode
          value={kycUrl}
          qrStyle="dots"
          eyeRadius={20}
          logoImage="/images/user-qr-logo.png"
          bgColor="#F9FAFB"
          style={{
            borderRadius: "32px",
            margin: "0 auto",
            width: "100%",
            maxWidth: "360px",
            objectFit: "contain",
            height: "auto",
          }}
          quietZone={16}
          size={256}
        />
      </div>
    ),
    [kycUrl],
  );

  const renderTerms = () => (
    <motion.div key="terms" {...fadeInOut} className="space-y-4">
      <div className="space-y-3">
        <UserDetailsIcon />
        <DialogTitle className="text-lg font-bold">
          Start sending money in just{" "}
          <span className="bg-gradient-to-br from-green-400 via-orange-400 to-orange-600 bg-clip-text text-transparent">
            2 minutes
          </span>
        </DialogTitle>
      </div>

      <div className="space-y-6 rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/5">
        <h4 className="text-base font-medium text-neutral-800 dark:text-white/80">
          Accept terms to get started
        </h4>

        {terms.map((term) => (
          <Field key={term.id} className="flex gap-6">
            <Checkbox
              checked={termsAccepted[term.id]}
              onChange={(checked) => handleTermChange(term.id, checked)}
              className="group mt-1 block size-5 flex-shrink-0 cursor-pointer rounded border-2 border-gray-300 bg-transparent data-[checked]:border-lavender-500 data-[checked]:bg-lavender-500 dark:border-white/30 dark:data-[checked]:border-lavender-500"
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
            <Label className="grid cursor-pointer gap-2 text-gray-500 dark:text-white/50">
              <p>{term.text}</p>
              <a
                href={term.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-lavender-500 hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  window.open(term.url, "_blank");
                }}
              >
                Read full {term.label}
              </a>
            </Label>
          </Field>
        ))}
      </div>

      <div className="rounded-2xl border border-gray-100 p-4 dark:border-white/10">
        <p className="text-xs text-gray-500 dark:text-white/50">
          By clicking “Accept” below, you are agreeing to the terms and policies
          above
        </p>
      </div>

      <div className="flex gap-4">
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className={secondaryBtnClasses}
        >
          No, thanks
        </button>
        <button
          type="button"
          className={`${primaryBtnClasses} w-full`}
          disabled={!isAllTermsAccepted}
          onClick={handleSignAndContinue}
        >
          Accept
        </button>
      </div>
    </motion.div>
  );

  const renderQRCode = () => (
    <motion.div key="qr_code" {...fadeInOut} className="space-y-4">
      <div className="relative">
        <DialogTitle className="mx-auto text-center text-lg font-semibold">
          Verify with your phone or URL
        </DialogTitle>
      </div>

      <p className="mx-auto text-center text-gray-500 dark:text-white/50">
        Scan with your phone to have the best verification experience. You can
        also open the URL below
      </p>

      <QRCodeComponent />

      <div className="flex w-full items-center justify-center gap-3">
        <hr className="h-px w-full bg-gray-100 opacity-10 dark:bg-white/5" />
        <p className="text-xs text-gray-500 dark:text-white/50">Or</p>
        <hr className="h-px w-full bg-gray-100 opacity-10 dark:bg-white/5" />
      </div>

      <button
        type="button"
        className={`${secondaryBtnClasses} flex w-full items-center justify-center gap-2`}
        onClick={() => window.open(kycUrl, "_blank")}
      >
        Open URL <FiExternalLink className="text-lg" />
      </button>
    </motion.div>
  );

  const renderPendingStatus = () => (
    <motion.div key="pending" {...fadeInOut} className="space-y-6 pt-4">
      <VerificationPendingIcon className="mx-auto" />

      <div className="space-y-3 pb-5 text-center">
        <DialogTitle className="text-lg font-semibold">
          Verification in progress
        </DialogTitle>

        <p className="text-gray-500 dark:text-white/50">
          We are verifying your identity. This will only take a few minutes.
          Kindly check back soon
        </p>
      </div>

      <div className="flex w-full items-center gap-2">
        <button
          type="button"
          title="View QR Code"
          className={`${secondaryBtnClasses}`}
          onClick={() => setStep(STEPS.QR_CODE)}
        >
          <QrCodeIcon className="size-6 p-0.5 text-gray-300" />
        </button>
        <button
          type="button"
          className={`${primaryBtnClasses} w-full`}
          onClick={() => setIsOpen(false)}
        >
          Got it
        </button>
      </div>
    </motion.div>
  );

  const renderSuccessStatus = () => (
    <motion.div key="success" {...fadeInOut} className="space-y-6 pt-4">
      <CheckIcon className="mx-auto" />

      <div className="space-y-3 pb-5 text-center">
        <DialogTitle className="text-lg font-semibold">
          Verification successful
        </DialogTitle>

        <p className="text-gray-500 dark:text-white/50">
          You can now start converting your crypto to fiats at zero fees on
          noblocks
        </p>
      </div>

      <button
        type="button"
        className={`${primaryBtnClasses} w-full`}
        onClick={() => setIsOpen(false)}
      >
        Let&apos;s go!
      </button>
    </motion.div>
  );

  const renderFailedStatus = () => (
    <motion.div key="failed" {...fadeInOut} className="space-y-6 pt-4">
      <SadFaceIcon className="mx-auto" />

      <div className="space-y-3 pb-5 text-center">
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
        onClick={() => setStep(STEPS.TERMS)}
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
    <motion.div key="refresh" {...fadeInOut} className="space-y-6 pt-4">
      <VerificationPendingIcon className="mx-auto" />

      <div className="space-y-3 pb-5 text-center">
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

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchStatus();
    setIsRefreshing(false);
  };

  // fetch the KYC status
  const fetchStatus = async () => {
    if (!walletAddress) return;

    try {
      const response = await fetchKYCStatus(walletAddress);
      const statusMap = {
        success: STEPS.STATUS.SUCCESS,
        pending: STEPS.STATUS.PENDING,
        failed: STEPS.STATUS.FAILED,
        expired: STEPS.TERMS,
      };

      // set the step based on the status from the response
      const newStatus =
        statusMap[response.data.status as keyof typeof statusMap] ||
        STEPS.STATUS.PENDING;
      setStep(newStatus);

      if (newStatus === STEPS.STATUS.SUCCESS) {
        setIsUserVerified(true);
        trackEvent("verification_completed", {
          walletAddress,
        });
      }
      if (newStatus === STEPS.STATUS.PENDING) setKycUrl(response.data.url);
      if (newStatus === STEPS.STATUS.FAILED) {
        trackEvent("verification_failed", {
          walletAddress,
        });
      }

      setIsOpen(true);
    } catch (error) {
      if (
        error instanceof Error &&
        (error as any).response &&
        (error as any).response.data
      ) {
        // backend error response
        const { message } = (error as any).response.data;
        console.error(message);
      } else {
        // unexpected errors
        console.error(error instanceof Error ? error.message : String(error));
      }
    }
  };

  useEffect(() => {
    fetchStatus();

    let intervalId: NodeJS.Timeout;
    let elapsedTime = 0;

    if (step === STEPS.STATUS.PENDING) {
      intervalId = setInterval(() => {
        elapsedTime += 30;
        // stop polling after 10 minutes
        if (elapsedTime >= 600) {
          clearInterval(intervalId);
          setStep(STEPS.REFRESH);
        } else {
          fetchStatus();
        }
      }, 30000);
    }

    return () => {
      clearInterval(intervalId);
    };
  }, [walletAddress]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Get started"
        className={`${primaryBtnClasses} w-full`}
      >
        Get started
      </button>

      <Dialog
        open={isOpen}
        onClose={() => {
          setIsOpen(false);
          trackEvent("dismissed_ui_element", { element: "KYC Modal" });
        }}
        className="relative z-50"
      >
        <DialogBackdrop className="fixed inset-0 bg-black/30 backdrop-blur-sm transition-opacity duration-300 ease-out data-[state=closed]:opacity-0" />

        <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
          <DialogPanel className="relative max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-2xl bg-white p-5 text-sm shadow-xl transition-all duration-300 ease-out data-[state=closed]:scale-95 data-[state=closed]:opacity-0 dark:bg-neutral-800">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="absolute right-5 top-9 rounded-full bg-gray-100 p-1 text-lg text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700 dark:bg-white/10 dark:text-white/40 dark:hover:bg-white/30 dark:hover:text-white/80"
              title="Close"
            >
              <IoMdClose />
            </button>
            <AnimatePresence mode="wait">
              {
                {
                  [STEPS.TERMS]: renderTerms(),
                  [STEPS.QR_CODE]: renderQRCode(),
                  [STEPS.STATUS.PENDING]: renderPendingStatus(),
                  [STEPS.STATUS.SUCCESS]: renderSuccessStatus(),
                  [STEPS.STATUS.FAILED]: renderFailedStatus(),
                  [STEPS.LOADING]: renderLoadingStatus(),
                  [STEPS.REFRESH]: renderRefresh(),
                }[step]
              }
            </AnimatePresence>
          </DialogPanel>
        </div>
      </Dialog>
    </>
  );
};
