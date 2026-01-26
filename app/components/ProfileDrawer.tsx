"use client";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Dialog } from "@headlessui/react";
import {
  ArrowRight03Icon,
  ArrowDown01Icon,
  Copy01Icon,
  StarIcon,
  InformationCircleIcon,
  FaceIdIcon,
  CallingIcon,
} from "hugeicons-react";
import { usePrivy, useLinkAccount } from "@privy-io/react-auth";
import { useKYCStatus, KYC_TIERS } from "../hooks/useKYCStatus";
import { formatNumberWithCommas, shortenAddress, classNames } from "../utils";
import { sidebarAnimation } from "./AnimatedComponents";
import { PiCheck } from "react-icons/pi";
import { TbIdBadge } from "react-icons/tb";
import TransactionLimitModal from "./TransactionLimitModal";

interface ProfileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProfileDrawer({ isOpen, onClose }: ProfileDrawerProps) {
  const { user } = usePrivy();
  const {
    tier,
    isFullyVerified,
    transactionSummary,
    getCurrentLimits,
    refreshStatus,
  } = useKYCStatus();

  const [isLimitModalOpen, setIsLimitModalOpen] = useState(false);
  const [expandedTiers, setExpandedTiers] = useState<Record<number, boolean>>(
    {},
  );
  const [isAddressCopied, setIsAddressCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const currentLimits = getCurrentLimits();
  const monthlyLimit = currentLimits.monthly || 0;
  const monthlyProgress =
    monthlyLimit > 0
      ? (transactionSummary.monthlySpent / monthlyLimit) * 100
      : 0;

  // Refresh KYC status only if last refresh was >30s ago
  const lastRefreshRef = useRef<number>(0);
  useEffect(() => {
    if (isOpen) {
      const now = Date.now();
      if (now - lastRefreshRef.current > 30000) {
        setIsLoading(true);
        refreshStatus().finally(() => setIsLoading(false));
        lastRefreshRef.current = now;
      }
    }
  }, [isOpen, refreshStatus]);

  const walletAddress = user?.linkedAccounts.find(
    (account) => account.type === "smart_wallet",
  )?.address;

  const { linkEmail } = useLinkAccount({
    onSuccess: ({ user }) => {
      toast.success(`${user.email?.address} linked successfully`);
    },
    onError: () => {
      toast.error("Error linking account", {
        description: "You might have this email linked already",
      });
    },
  });

  const handleCopyAddress = () => {
    if (walletAddress) {
      navigator.clipboard.writeText(walletAddress);
      setIsAddressCopied(true);
      toast.success("Address copied to clipboard");
      setTimeout(() => setIsAddressCopied(false), 2000);
    }
  };

  const toggleTierExpansion = (tierLevel: number) => {
    setExpandedTiers((prev) => ({
      ...prev,
      [tierLevel]: !prev[tierLevel],
    }));
  };

  // Auto-expand next tier section
  useEffect(() => {
    if (tier < 1) {
      setExpandedTiers((prev) => ({
        ...prev,
        [tier + 1]: true,
      }));
    }
  }, [tier]);

  const renderSkeletonLoader = () => (
    <div className="animate-pulse space-y-4">
      {/* Account card skeleton */}
      <div className="space-y-4 rounded-[20px] border border-border-light bg-transparent p-4 dark:border-white/5">
        <div className="h-4 w-20 rounded bg-gray-200 dark:bg-white/10"></div>
        <div className="flex items-center gap-4">
          <div className="h-[44px] w-[44px] rounded-full bg-gray-200 dark:bg-white/10"></div>
          <div className="flex-1 space-y-2">
            <div className="h-3 w-32 rounded bg-gray-200 dark:bg-white/10"></div>
            <div className="h-3 w-24 rounded bg-gray-200 dark:bg-white/10"></div>
          </div>
        </div>
      </div>

      {/* Current tier skeleton */}
      <div className="space-y-4 rounded-[20px] border border-border-light bg-transparent p-4 dark:border-white/5">
        <div className="h-6 w-28 rounded-lg bg-gray-200 dark:bg-white/10"></div>
        <div className="space-y-3">
          <div className="h-4 w-24 rounded bg-gray-200 dark:bg-white/10"></div>
          <div className="h-8 w-full rounded bg-gray-200 dark:bg-white/10"></div>
          <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-white/10"></div>
        </div>
        <div className="h-11 w-full rounded-xl bg-gray-200 dark:bg-white/10"></div>
      </div>

      {/* Tier sections skeleton */}
      {[1, 2].map((i) => (
        <div
          key={i}
          className="rounded-[20px] border border-border-light bg-transparent p-4 dark:border-white/5"
        >
          <div className="h-4 w-16 rounded bg-gray-200 dark:bg-white/10"></div>
        </div>
      ))}
    </div>
  );

  const renderTierSection = (tierLevel: number) => {
    const tierData = KYC_TIERS[tierLevel];
    const isExpanded = expandedTiers[tierLevel];

    if (!tierData) return null;

    return (
      <div
        key={tierLevel}
        className="border-b border-border-light last:border-b-0 dark:border-white/10"
      >
        <button
          type="button"
          onClick={() => toggleTierExpansion(tierLevel)}
          title={`View ${tierData.name} details`}
          className="flex w-full items-center justify-between p-4 text-left transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-sm font-light text-text-body dark:text-white/70">
              {tierData.name}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-light text-text-secondary dark:text-lavender-500">
              {isExpanded ? "See less" : "See more"}
            </span>
            <ArrowDown01Icon
              className={classNames(
                "size-4 text-outline-gray transition-transform dark:text-lavender-500",
                isExpanded ? "" : "",
              )}
            />
          </div>
        </button>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="space-y-4 px-4 pb-4">
                <ul className="space-y-4">
                  {tierData.requirements.map((req, index) => (
                    <li
                      key={index}
                      className="flex items-center gap-2 text-xs text-text-secondary dark:text-white/60"
                    >
                      <div className="rounded-lg bg-white/10 p-0.5">
                        {req.includes("number") ? (
                          <CallingIcon className="size-4 text-outline-gray dark:text-white/50" />
                        ) : req.includes("verification") ? (
                          <FaceIdIcon className="size-4 text-outline-gray dark:text-white/70" />
                        ) : (
                          req.includes("ID") && (
                            <TbIdBadge className="size-4 text-outline-gray dark:text-white/50" />
                          )
                        )}
                      </div>
                      <span>{req}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex justify-between rounded-2xl px-4 py-3 dark:bg-white/5">
                  <p className="text-sm text-text-secondary dark:text-white/60">
                    Limit
                  </p>
                  <p className="text-xs font-light text-text-body dark:text-white/80">
                    <span className="text-sm font-medium">
                      ${formatNumberWithCommas(tierData.limits.monthly)}
                    </span>{" "}
                    / month
                  </p>
                </div>
                {tier == 0 && tierLevel === tier + 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsLimitModalOpen(true);
                    }}
                    title={`Upgrade to ${tierData.name}`}
                    className="min-h-11 w-full rounded-xl bg-lavender-600 px-4 py-2 text-center text-sm font-light text-white transition-all hover:scale-[0.98] hover:bg-lavender-700 active:scale-95 dark:bg-lavender-500 dark:hover:bg-lavender-600"
                  >
                    Verify now
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <Dialog
            as="div"
            className="fixed inset-0 z-50 overflow-hidden"
            onClose={onClose}
            open={isOpen}
          >
            <div className="flex h-full">
              {/* Backdrop overlay */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/30 backdrop-blur-sm"
                onClick={onClose}
              />

              {/* Drawer content */}
              <motion.div
                {...sidebarAnimation}
                className="z-50 my-4 ml-auto mr-4 flex h-[calc(100%-32px)] w-full max-w-[396px] flex-col overflow-hidden rounded-[20px] border border-border-light bg-white shadow-lg dark:border-white/5 dark:bg-surface-overlay"
              >
                <div className="flex h-full flex-col p-5">
                  {/* Header with close button */}
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-text-body dark:text-white">
                      Profile
                    </h2>
                    <button
                      type="button"
                      title="Close profile drawer"
                      onClick={onClose}
                      className="rounded-lg p-2 transition-colors hover:bg-accent-gray dark:hover:bg-white/10"
                    >
                      <ArrowRight03Icon className="size-5 text-outline-gray dark:text-white/50" />
                    </button>
                  </div>

                  <div className="scrollbar-hide mt-6 flex-1 space-y-4 overflow-y-auto pb-4">
                    {isLoading ? (
                      renderSkeletonLoader()
                    ) : (
                      <>
                        {/* Account info card */}
                        <div className="space-y-4 rounded-[20px] border border-border-light bg-transparent p-4 dark:border-white/5">
                          <h3 className="text-sm font-light text-text-secondary dark:text-white/70">
                            Account
                          </h3>

                          {/* Email Connection */}
                          <div className="flex items-center gap-4">
                            <img
                              src="/icons/placeholder.png"
                              className="object-fit h-[44px] w-[44px] rounded-full"
                            />
                            <div className="flex w-full flex-col items-start">
                              {user?.email ? (
                                <div>
                                  <p className="text-xs text-text-body dark:text-white/90">
                                    {user.email.address}
                                  </p>
                                </div>
                              ) : (
                                <button
                                  onClick={linkEmail}
                                  className="text-sm text-lavender-600 hover:underline dark:text-lavender-400"
                                >
                                  Connect my email
                                </button>
                              )}

                              {/* Wallet Address */}
                              <div className="flex w-full items-center justify-between">
                                <p className="text-sm font-light text-text-body dark:text-white/70">
                                  {shortenAddress(walletAddress ?? "", 10)}
                                </p>
                                <button
                                  type="button"
                                  onClick={handleCopyAddress}
                                  title="Copy wallet address"
                                  className="rounded-lg p-2 transition-colors hover:bg-accent-gray dark:hover:bg-white/10"
                                >
                                  {isAddressCopied ? (
                                    <PiCheck className="size-4 text-green-500" />
                                  ) : (
                                    <Copy01Icon className="size-4 text-outline-gray dark:text-white/50" />
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Current Tier Status */}
                        {tier >= 1 && tier !== undefined && (
                          <div className="space-y-4 rounded-[20px] border border-border-light bg-transparent p-4 dark:border-white/5">
                            {/* Current Tier Badge */}

                            <div className="flex w-[137px] items-center gap-2 rounded-lg bg-[#39C65D] px-3 py-1.5 dark:bg-[#39C65D]">
                              <StarIcon
                                className="text-white dark:text-black"
                                size={16}
                              />
                              <span className="text-xs font-medium text-white dark:text-black">
                                Current: {KYC_TIERS[tier]?.name || "Tier 0"}
                              </span>
                            </div>

                            {/* Monthly Limit Progress */}
                            <div className="space-y-3">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-light text-text-secondary dark:text-white/70">
                                  Monthly limit
                                </span>
                                <InformationCircleIcon className="size-4 text-outline-gray dark:text-white/50" />
                              </div>

                              <div className="text-2xl font-light text-text-body dark:text-white">
                                $
                                {formatNumberWithCommas(
                                  transactionSummary.monthlySpent,
                                )}{" "}
                                / $
                                {formatNumberWithCommas(currentLimits.monthly)}
                              </div>

                              {/* Progress Bar */}
                              <div className="flex h-2 w-full items-center rounded-full bg-accent-gray dark:bg-white/10">
                                <div
                                  className="h-2.5 rounded-full bg-gradient-to-r from-white to-white transition-all duration-500"
                                  style={{
                                    width: `${Math.min(monthlyProgress, 100)}%`,
                                  }}
                                />
                              </div>
                            </div>

                            {/* Upgrade Button */}
                            {tier < 2 && !isFullyVerified && (
                              <button
                                type="button"
                                onClick={() => {
                                  setIsLimitModalOpen(true);
                                }}
                                title={`Upgrade to ${KYC_TIERS[tier + 1]?.name}`}
                                className="min-h-11 w-full rounded-xl bg-lavender-600 px-4 py-2 text-center text-sm font-light text-white transition-all hover:scale-[0.98] hover:bg-lavender-700 active:scale-95 dark:bg-lavender-500 dark:hover:bg-lavender-600"
                              >
                                Increase limit → {KYC_TIERS[tier + 1]?.name}
                              </button>
                            )}
                          </div>
                        )}

                        {/* Tier Information */}

                        {Object.values(KYC_TIERS)
                          .filter((tierData) => tierData.level > tier) // Only show tiers above current
                          .map((tierData) => (
                            <div
                              key={tierData.level}
                              className="rounded-[20px] border border-border-light bg-transparent dark:border-white/5"
                            >
                              {renderTierSection(tierData.level)}
                            </div>
                          ))}
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            </div>
          </Dialog>
        )}
      </AnimatePresence>

      <TransactionLimitModal
        isOpen={isLimitModalOpen}
        onClose={async () => {
          setIsLimitModalOpen(false);
          await refreshStatus();
        }}
      />
    </>
  );
}
