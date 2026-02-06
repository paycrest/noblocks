"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  InformationSquareIcon,
  Wallet02Icon,
  StarIcon,
  InformationCircleIcon,
} from "hugeicons-react";
import { useKYC } from "../context";
import { KYC_TIERS } from "../context/KYCContext";
import PhoneVerificationModal from "./PhoneVerificationModal";
import { primaryBtnClasses, secondaryBtnClasses } from "./Styles";
import { AnimatedModal, fadeInOut } from "./AnimatedComponents";
import { formatNumberWithCommas } from "../utils";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { KycModal } from "./KycModal";

interface TransactionLimitModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactionAmount?: number;
}

export default function TransactionLimitModal({
  isOpen,
  onClose,
  transactionAmount = 0,
}: TransactionLimitModalProps) {
  const {
    tier,
    getCurrentLimits,
    refreshStatus,
    phoneNumber,
    transactionSummary,
  } = useKYC();

  const [isPhoneModalOpen, setIsPhoneModalOpen] = useState(false);
  const [isKycModalOpen, setIsKycModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Refresh KYC status every time modal is opened
  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      refreshStatus().finally(() => setIsLoading(false));
    }
  }, [isOpen, refreshStatus]);

  // Auto-open phone verification modal if tier is less than 1 (unverified)
  useEffect(() => {
    if (
      isOpen &&
      !isLoading &&
      ((tier < 1 && !phoneNumber) || tier === undefined)
    ) {
      setIsPhoneModalOpen(true);
    }
  }, [isOpen, isLoading, tier, phoneNumber]);

  const currentLimits = getCurrentLimits();
  const currentTier = KYC_TIERS[tier];
  const nextTier = KYC_TIERS[tier + 1];

  const handlePhoneVerified = async (phoneNumber: string) => {
    setIsPhoneModalOpen(false);
    refreshStatus();
    onClose();
  };

  const renderLoadingStatus = () => (
    <motion.div
      key="loading"
      {...fadeInOut}
      className="flex items-center justify-center py-20"
    >
      <div className="h-16 w-16 animate-spin rounded-full border-4 border-t-4 border-lavender-500 border-t-white"></div>
    </motion.div>
  );

  const renderMainContent = () => (
    <motion.div {...fadeInOut} className="space-y-4">
      <div className="space-y-3 text-start">
        <Wallet02Icon className="h-6 w-6 text-gray-400 dark:text-white/50" />
        <DialogTitle className="text-md font-medium text-text-body dark:text-white">
          Increase your transaction limit
        </DialogTitle>
        <p className="text-sm font-light text-text-secondary dark:text-white/50">
          Your current monthly limit is{" "}
          <span className="font-medium text-white">
            ${formatNumberWithCommas(currentLimits.monthly)}
          </span>
          . Verify your identity to unlock higher limits.
        </p>
      </div>

      <div className="flex flex-col items-start space-y-4 rounded-3xl border-[0.3px] border-gray-200 p-4 dark:border-white/5">
        <div className="flex items-center gap-2 rounded-md bg-[#39C65D] px-3 py-1.5 dark:bg-[#39C65D]">
          <StarIcon className="text-white dark:text-black" size={16} />
          <span className="text-sm font-medium text-white dark:text-black">
            Current: {tier < 1 ? "Tier 0" : currentTier?.name || "Tier 0"}
          </span>
        </div>

        {/* Monthly Limit Progress */}
        <div className="w-full space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text-secondary dark:text-white/70">
              Monthly limit
            </span>
            <InformationCircleIcon className="h-4 w-4 text-gray-400 dark:text-white/40" />
          </div>

          {/* Progress Display */}
          <div className="w-full text-start">
            <div className="mb-2 text-2xl font-light text-text-body dark:text-white">
              ${formatNumberWithCommas(transactionSummary.monthlySpent)} / $
              {formatNumberWithCommas(currentLimits.monthly)}
            </div>

            {/* Progress Bar */}
            <div className="mb-4 flex h-2 w-full items-center rounded-full bg-gray-400 dark:bg-white/20">
              <div
                className="h-2.5 rounded-full bg-gradient-to-r from-white to-white transition-all duration-500"
                style={{
                  width:
                    currentLimits.monthly > 0
                      ? `${Math.min(
                          (transactionSummary.monthlySpent /
                            currentLimits.monthly) *
                            100,
                          100,
                        )}%`
                      : "0%",
                }}
              />
            </div>
          </div>
        </div>
      </div>
      {/* Info Text */}
      <div className="flex items-start gap-2 rounded-xl bg-gray-50 p-3 dark:bg-white/5">
        <InformationSquareIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400 dark:text-white/40" />
        <p className="text-xs font-light text-text-secondary dark:text-white/50">
          {tier < 1 ? (
            <>
              Tier 0 gives you ${formatNumberWithCommas(currentLimits.monthly)}
              /month. Verify your ID to unlock $
              {nextTier
                ? formatNumberWithCommas(nextTier.limits.monthly)
                : "1,000"}
              /month and beyond.{" "}
              <span className="cursor-pointer text-lavender-600 dark:text-lavender-600">
                Learn more.
              </span>
            </>
          ) : (
            <>
              You&apos;re currently at {currentTier?.name} with $
              {formatNumberWithCommas(currentLimits.monthly)}/month.{" "}
              {nextTier
                ? `Upgrade to ${nextTier.name} for ${formatNumberWithCommas(nextTier.limits.monthly)}/month`
                : "You have the highest tier available"}
              .{" "}
              <span className="cursor-pointer text-lavender-600 underline dark:text-lavender-400">
                Learn more.
              </span>
            </>
          )}
        </p>
      </div>

      {/* Action Button */}
      {tier < 2 && (
        <button
          onClick={() => {
            if (tier < 1) {
              setIsPhoneModalOpen(true);
            } else {
              // Trigger full KYC modal
              setIsKycModalOpen(true);
            }
          }}
          className={`${primaryBtnClasses} w-full`}
        >
          Verify and increase limit
        </button>
      )}

      {/* Already at max tier */}
      {tier >= 2 && (
        <button onClick={onClose} className={`${secondaryBtnClasses} w-full`}>
          Got it
        </button>
      )}
    </motion.div>
  );

  if (!isOpen) return null;

  return (
    <>
      <AnimatePresence mode="wait">
        {isOpen && !isPhoneModalOpen && (
          <Dialog open={isOpen} onClose={onClose} className="relative z-50">
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm"
              aria-hidden="true"
            />

            <div className="fixed inset-0 flex items-center justify-center p-4">
              <DialogPanel className="mx-auto w-full max-w-[412px] rounded-3xl bg-white p-6 shadow-xl dark:border-[0.3px] dark:border-white/5 dark:bg-surface-overlay">
                <AnimatePresence mode="wait">
                  {isLoading ? renderLoadingStatus() : renderMainContent()}
                </AnimatePresence>
              </DialogPanel>
            </div>
          </Dialog>
        )}
      </AnimatePresence>

      <PhoneVerificationModal
        isOpen={isPhoneModalOpen}
        onClose={() => {
          setIsPhoneModalOpen(false);
          onClose(); // Close parent modal too
        }}
        onVerified={handlePhoneVerified}
      />

      <AnimatePresence>
        {isKycModalOpen && (
          <AnimatedModal
            isOpen={isKycModalOpen}
            onClose={() => {
              setIsKycModalOpen(false);
              onClose();
            }}
          >
            <KycModal
              setIsKycModalOpen={setIsKycModalOpen}
              setIsUserVerified={async () => {
                await refreshStatus();
                setIsKycModalOpen(false);
                onClose();
              }}
            />
          </AnimatedModal>
        )}
      </AnimatePresence>
    </>
  );
}
