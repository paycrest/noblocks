"use client";
import { Checkbox, DialogTitle, Field, Label } from "@headlessui/react";
import { toast } from "sonner";
import { QRCode } from "react-qrcode-logo";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { FiExternalLink } from "react-icons/fi";
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
import { trackEvent } from "../hooks/analytics/client";
import { Cancel01Icon, CheckmarkCircle01Icon } from "hugeicons-react";
import { useInjectedWallet } from "../context";

export const STEPS = {
  TERMS: "terms",
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

        const response = await initiateKYC({
          signature: sigWithoutPrefix,
          walletAddress: walletAddress || "",
          nonce,
        });

        if (response.status === "success") {
          trackEvent("Account verification", {
            "Verification status": "Pending",
          });
          setKycUrl(response.data.url);
          setShowQRCode(true);
          setStep(STEPS.STATUS.PENDING);
        } else {
          setStep(STEPS.STATUS.FAILED);
          trackEvent("Account verification", {
            "Verification status": "Failed",
          });
        }
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
        <div>
          <h2 className="text-lg font-medium dark:text-white">
            Verify your identity in just{" "}
            <span className="bg-linear-to-br from-green-400 via-orange-400 to-orange-600 bg-clip-text text-transparent">
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
                className="mx-1 mt-1 size-5 shrink-0 cursor-pointer"
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
                className="mx-1 mt-1 size-5 shrink-0 cursor-pointer"
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
                className="mx-1 mt-1 size-5 shrink-0 cursor-pointer"
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
              <div className="mx-1 mt-1 size-5 shrink-0"></div>
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
            className="group mr-1 mt-1 block size-5 shrink-0 cursor-pointer rounded-sm border-2 border-gray-300 bg-transparent data-checked:border-lavender-500 data-checked:bg-lavender-500 dark:border-white/30 dark:data-checked:border-lavender-500"
          >
            <svg
              className="stroke-neutral-800 opacity-0 group-data-checked:opacity-100"
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

  const renderQRCode = () => (
    <motion.div key="qr_code" {...fadeInOut} className="space-y-4">
      <div className="flex items-center justify-between">
        <div></div>
        <h2 className="text-lg font-medium dark:text-white">
          Verify with your phone or URL
        </h2>
        <button
          type="button"
          onClick={() => setIsKycModalOpen(false)}
          className="rounded-full p-1 text-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white/80"
          title="Close"
        >
          <Cancel01Icon className="size-5 text-outline-gray dark:text-white/50" />
        </button>
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
          onClick={() => setShowQRCode(true)}
        >
          <QrCodeIcon className="size-6 p-0.5 text-gray-300" />
        </button>
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
    <motion.div key="success" {...fadeInOut} className="space-y-6 pt-4">
      <CheckmarkCircle01Icon className="mx-auto size-10" color="#39C65D" />

      <div className="space-y-3 pb-5 text-center">
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
        setShowQRCode(false);
        trackEvent("Account verification", {
          "Verification status": "Success",
        });
      }
      if (newStatus === STEPS.STATUS.PENDING) setKycUrl(response.data.url);
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

  return (
    <>
      <AnimatePresence mode="wait">
        {showQRCode
          ? renderQRCode()
          : {
              [STEPS.TERMS]: renderTerms(),
              [STEPS.STATUS.PENDING]: renderPendingStatus(),
              [STEPS.STATUS.SUCCESS]: renderSuccessStatus(),
              [STEPS.STATUS.FAILED]: renderFailedStatus(),
              [STEPS.LOADING]: renderLoadingStatus(),
              [STEPS.REFRESH]: renderRefresh(),
            }[step]}
      </AnimatePresence>
    </>
  );
};
