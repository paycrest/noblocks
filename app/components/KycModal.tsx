"use client";
import { Checkbox, DialogTitle, Field, Label } from "@headlessui/react";
import { toast } from "sonner";
import { QRCode } from "react-qrcode-logo";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { FiExternalLink } from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useCallback, useEffect, useRef } from "react";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "smart-camera-web": any;
    }
  }
}


import {
  CheckIcon,
  SadFaceIcon,
  UserDetailsIcon,
  VerificationPendingIcon,
} from "./ImageAssets";
import { fadeInOut } from "./AnimatedComponents";
import { generateTimeBasedNonce } from "../utils";
import {
  fetchKYCStatus,
  initiateKYC,
  submitSmileIDData,
} from "../api/aggregator";
import { primaryBtnClasses, secondaryBtnClasses } from "./Styles";
import { trackEvent } from "../hooks/analytics/client";
import { Cancel01Icon, CheckmarkCircle01Icon, Clock05Icon } from "hugeicons-react";
import { useInjectedWallet } from "../context";

export const STEPS = {
  TERMS: "terms",
  CAPTURE: "capture",
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
  | typeof STEPS.CAPTURE
  | typeof STEPS.LOADING
  | typeof STEPS.REFRESH
  | (typeof STEPS.STATUS)[keyof typeof STEPS.STATUS];

export const KycModal = ({
  setIsUserVerified,
  setIsKycModalOpen,
}: {
  setIsUserVerified: (value: boolean) => void;
  setIsKycModalOpen: (value: boolean) => void;
}) => {
  const { signMessage } = usePrivy();
  const { wallets } = useWallets();
  const { isInjectedWallet, injectedAddress, injectedProvider } =
    useInjectedWallet();

  const embeddedWallet = wallets.find(
    (wallet) => wallet.walletClientType === "privy",
  );
  const walletAddress = isInjectedWallet
    ? injectedAddress
    : embeddedWallet?.address;

  const [step, setStep] = useState<Step>(STEPS.LOADING);
  const [showQRCode, setShowQRCode] = useState(false);
  const [kycUrl, setKycUrl] = useState("");
  const [termsAccepted, setTermsAccepted] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [kycSignature, setKycSignature] = useState<string>("");
  const [kycNonce, setKycNonce] = useState<string>("");
  const [cameraElement, setCameraElement] = useState<HTMLElement | null>(null);
    const [smileIdLoaded, setSmileIdLoaded] = useState(false);

    useEffect(() => {
    if (typeof window !== 'undefined' && !smileIdLoaded) {
      import("@smileid/web-components/smart-camera-web")
        .then(() => {
          console.log("SmileID web components loaded");
          setSmileIdLoaded(true);
        })
        .catch((error) => {
          console.error("Failed to load SmileID components:", error);
          toast.error("Failed to load verification component");
        });
    }
  }, [smileIdLoaded]);

  const handleSignAndContinue = async () => {
    setIsSigning(true);
    const nonce = generateTimeBasedNonce({ length: 16 });
    const message = `I accept the KYC Policy and hereby request an identity verification check for ${walletAddress} with nonce ${nonce}`;

    try {
      let signature: string;

      if (isInjectedWallet && injectedProvider) {
        try {
          const accounts = await injectedProvider.request({
            method: "eth_requestAccounts",
          });

          const signResult = await injectedProvider.request({
            method: "personal_sign",
            params: [`0x${Buffer.from(message).toString("hex")}`, accounts[0]],
          });

          signature = signResult;
        } catch (error) {
          console.error("Injected wallet signature error:", error);
          toast.error("Failed to sign message with injected wallet");
          setIsSigning(false);
          return;
        }
      } else {
        const signResult = await signMessage(
          { message },
          { uiOptions: { buttonText: "Sign" } },
        );

        if (!signResult) {
          setIsSigning(false);
          return;
        }

        signature = signResult.signature;
      }

      if (signature) {
        setIsKycModalOpen(true);
        setStep(STEPS.LOADING);

        const sigWithoutPrefix = signature.startsWith("0x")
          ? signature.slice(2)
          : signature;

        setKycSignature(sigWithoutPrefix);
        setKycNonce(nonce);

        // Skip old KYC initiation since we're using Smile ID
        setStep(STEPS.CAPTURE);
      }
    } catch (error: unknown) {
      console.log("error", error);
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
      setIsKycModalOpen(false);
      setStep(STEPS.TERMS);
    } finally {
      setIsSigning(false);
    }
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
                  We do not store any personal information. All personal data is
                  handled exclusively by our third-party KYC provider.
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
                  We only store the KYC reference code and signing wallet
                  address for verification and audit purposes.
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
                  We rely on the third-party provider&apos;s rigorous data
                  protection measures to ensure that your personal information
                  is secure.
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
            By clicking &ldquo;Accept and sign&rdquo; below, you are agreeing to
            the KYC Policy and hereby request an identity verification check for
            your wallet address.
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
          disabled={!termsAccepted || isSigning}
          onClick={handleSignAndContinue}
        >
          {isSigning ? "Signing..." : "Accept and sign"}
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
            Capture your documents
          </h2>
          <p className="text-sm text-gray-500 dark:text-white/50">
            Please take a selfie and capture your ID document for verification.
          </p>
        </div>
      </div>

      <div className="flex justify-center">
        {/* @ts-ignore */}
        <smart-camera-web
          ref={(el: HTMLElement | null) => {
          console.log("🔗 Ref callback called with:", el);
          setCameraElement(el);
        }}
          theme-color="#8B85F4"
          capture-id
        />
      </div>

      {isCapturing && (
      <div className="text-center text-sm text-gray-500">
        Processing your verification...
      </div>
    )}

      <button
        type="button"
        onClick={() => setStep(STEPS.TERMS)}
        className={secondaryBtnClasses}
      >
        Back
      </button>
    </motion.div>
  );


  const renderPendingStatus = () => (
    <motion.div key="pending" {...fadeInOut} className="space-y-4 pt-4">
      <Clock05Icon className="mx-auto dark:text-yellow-primary" size={40} />

      <div className="space-y-3 pb-2 px-6 text-center">
        <DialogTitle className="text-lg font-semibold">
          Tier 2 Upgrade in progress
        </DialogTitle>

        <p className="text-gray-500 dark:text-white/50">
          We are currently verifying your identity. You will get feedback within 24 hours. Kindly check back soon
        </p>
      </div>

      <div className="flex w-full items-center gap-2">
        <button
          type="button"
          className={`${primaryBtnClasses} w-full`}
          onClick={() => setIsKycModalOpen(false)}
        >
          Got it
        </button>
      </div>
    </motion.div>
  );

  const renderSuccessStatus = () => (
    <motion.div key="success" {...fadeInOut} className="space-y-4 pt-4">
      <CheckmarkCircle01Icon className="mx-auto size-12" color="#39C65D"/>

      <div className="space-y-3 pb-2 px-6 text-center">
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
        }}
      >
        Let&apos;s go!
      </button>
    </motion.div>
  );

  const renderFailedStatus = () => (
    <motion.div key="failed" {...fadeInOut} className="space-y-4 pt-4">
      <SadFaceIcon className="mx-auto" />

      <div className="space-y-3 pb-2 px-6 text-center">
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
    <motion.div key="refresh" {...fadeInOut} className="space-y-4 pt-4">
      <VerificationPendingIcon className="mx-auto" />

      <div className="space-y-3 pb-2 px-6 text-center">
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
        setShowQRCode(false);
        trackEvent("Account verification", {
          "Verification status": "Success",
        });
      }
      if (newStatus === STEPS.STATUS.PENDING) {
        // setKycUrl(response.data.url);
        // setIsKycModalOpen(true);
        return;
      }
      if (newStatus === STEPS.STATUS.FAILED) {
        trackEvent("Account verification", {
          "Verification status": "Failed",
        });
      }

      setIsKycModalOpen(true);
    } catch (error) {
      if (error instanceof Error && (error as any).response?.status === 404) {
        setStep(STEPS.TERMS);
        return;
      }

      // Show error message from backend if available, otherwise show generic error
      if (error instanceof Error) {
        const errorMessage =
          (error as any).response?.data?.message || error.message;
        toast.error(errorMessage);
        setIsKycModalOpen(false);
      } else {
        toast.error(String(error));
        setIsKycModalOpen(false);
      }
    }
  };

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    const startTime = Date.now();

    const debouncedFetchStatus = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(async () => {
        await fetchStatus();
      }, 500); // 500ms debounce delay
    };

    debouncedFetchStatus(); // Initial fetch

    let intervalId: NodeJS.Timeout;

    if (step === STEPS.STATUS.PENDING) {
      intervalId = setInterval(() => {
        const elapsedSeconds = (Date.now() - startTime) / 1000;

        // stop polling after 10 minutes
        if (elapsedSeconds >= 600) {
          clearInterval(intervalId);
          setStep(STEPS.REFRESH);
        } else {
          debouncedFetchStatus();
        }
      }, 10000);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress]);

// Handle Smile ID publish event
useEffect(() => {
  if (step !== STEPS.CAPTURE) {
    return;
  }
  
  if (!cameraElement) {
    return;
  }

  const handlePublish = async (event: any) => {
    // Show loading screen while submitting
    setStep(STEPS.LOADING);

    try {
      const { images, partner_params } = event.detail;

      // Validate data structure
      if (!images || !Array.isArray(images) || images.length === 0) {
        throw new Error("Invalid image data received");
      }

      // Send the captured data to backend
      const payload = {
        images,
        partner_params: {
          ...partner_params,
          user_id: `user-${walletAddress}`,
          job_type: 4, // 4 for selfie enrollment (no country/ID required)
        },
        walletAddress,
        signature: kycSignature,
        nonce: kycNonce,
      };

      const response = await submitSmileIDData(payload);

      if (response.status === "success") {
        setStep(STEPS.STATUS.PENDING);
        trackEvent("Account verification", {
          "Verification status": "Submitted",
        });
      } else {
        setStep(STEPS.STATUS.FAILED);
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
      }
      toast.error("Failed to submit verification data");
      setStep(STEPS.STATUS.FAILED);
    }
  };

  const handleCancel = (event: any) => {
    toast.info("Verification cancelled");
    setStep(STEPS.TERMS);
  };

  const handleBack = (event: any) => {
    console.log("Back detail:", event.detail);
  };

  cameraElement.addEventListener("smart-camera-web.publish", handlePublish);
  cameraElement.addEventListener("smart-camera-web.cancelled", handleCancel);
  cameraElement.addEventListener("smart-camera-web.back", handleBack);

  return () => {
    console.log("🧹 Cleaning up listeners");
    cameraElement.removeEventListener("smart-camera-web.publish", handlePublish);
    cameraElement.removeEventListener("smart-camera-web.cancelled", handleCancel);
    cameraElement.removeEventListener("smart-camera-web.back", handleBack);
  };
}, [step, cameraElement, walletAddress, kycSignature, kycNonce]);


  return (
    <>
      <AnimatePresence mode="wait">
        {
          {
            [STEPS.TERMS]: renderTerms(),
            [STEPS.CAPTURE]: renderCapture(),
            [STEPS.STATUS.PENDING]: renderPendingStatus(),
            [STEPS.STATUS.SUCCESS]: renderSuccessStatus(),
            [STEPS.STATUS.FAILED]: renderFailedStatus(),
            [STEPS.LOADING]: renderLoadingStatus(),
            [STEPS.REFRESH]: renderRefresh(),
          }[step]
        }
      </AnimatePresence>
    </>
  );
};
