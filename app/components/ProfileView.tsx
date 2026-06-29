"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowLeft02Icon,
  ArrowRight03Icon,
  ArrowDown01Icon,
  Copy01Icon,
  StarIcon,
  InformationCircleIcon,
  FaceIdIcon,
  MapPinpoint01Icon,
  WorkAlertIcon,
} from "hugeicons-react";
import { useKYC } from "../context";
import { KYC_TIERS } from "../context/KYCContext";
import {
  formatKycTierDisplayLabel,
  hasAssignedKycTier,
} from "../lib/kyc-upgrade-path";
import { formatUsdAmount, shortenAddress, classNames } from "../utils";
import { PiCheck } from "react-icons/pi";
import { TbIdBadge, TbPhoneCall } from "react-icons/tb";
import TransactionLimitModal from "./TransactionLimitModal";

// Re-import usePrivy and useLinkAccount specifically from Privy
import { usePrivy as usePrivyAuth, useLinkAccount as useLinkAccountAuth } from "@privy-io/react-auth";

interface ProfileViewProps {
  layout: "drawer" | "sheet";
  onBack?: () => void; // Used for "sheet" layout to go back to settings
  onClose?: () => void; // Used for "drawer" layout to close the drawer
}

export default function ProfileView({ layout, onBack, onClose }: ProfileViewProps) {
  const { user } = usePrivyAuth();
  const {
    tier,
    transactionSummary,
    getCurrentLimits,
    refreshStatus,
    walletAddress,
  } = useKYC();

  const [isLimitModalOpen, setIsLimitModalOpen] = useState(false);
  const [expandedTierLevel, setExpandedTierLevel] = useState<number | null>(null);
  const [isAddressCopied, setIsAddressCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const currentLimits = getCurrentLimits();
  const monthlyLimit = currentLimits.monthly || 0;
  const monthlyProgress =
    monthlyLimit > 0
      ? (transactionSummary.monthlySpent / monthlyLimit) * 100
      : 0;

  useEffect(() => {
    setIsLoading(true);
    refreshStatus(true).finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { linkEmail } = useLinkAccountAuth({
    onSuccess: ({ user }) => {
      toast.success(`${user.email?.address} linked successfully`);
    },
    onError: () => {
      toast.error("Error linking account", {
        description: "You might have this email linked already",
      });
    },
  });

  const handleCopyAddress = async () => {
    if (!walletAddress) {
      setIsAddressCopied(false);
      return;
    }
    try {
      await navigator.clipboard.writeText(walletAddress);
      setIsAddressCopied(true);
      toast.success("Address copied to clipboard");
      setTimeout(() => setIsAddressCopied(false), 2000);
    } catch {
      setIsAddressCopied(false);
      toast.error("Could not copy address", {
        description: "Clipboard access was denied or is unavailable.",
      });
    }
  };

  const toggleTierExpansion = (tierLevel: number) => {
    setExpandedTierLevel((current) =>
      current === tierLevel ? null : tierLevel,
    );
  };

  useEffect(() => {
    if (tier < 1) {
      setExpandedTierLevel(tier + 1);
    }
  }, [tier]);

  const renderSkeletonLoader = () => (
    <div className="animate-pulse space-y-4">
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
      <div className="space-y-4 rounded-[20px] border border-border-light bg-transparent p-4 dark:border-white/5">
        <div className="h-6 w-28 rounded-lg bg-gray-200 dark:bg-white/10"></div>
        <div className="space-y-3">
          <div className="h-4 w-24 rounded bg-gray-200 dark:bg-white/10"></div>
          <div className="h-8 w-full rounded bg-gray-200 dark:bg-white/10"></div>
          <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-white/10"></div>
        </div>
        <div className="h-11 w-full rounded-xl bg-gray-200 dark:bg-white/10"></div>
      </div>
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
    const isExpanded = expandedTierLevel === tierLevel;

    if (!tierData) return null;

    return (
      <div
        key={tierLevel}
        className="border-b border-border-light last:border-b-0 dark:border-white/10"
      >
        <button
          type="button"
          onClick={() => toggleTierExpansion(tierLevel)}
          title={`View ${formatKycTierDisplayLabel(tierLevel)} details`}
          className="flex w-full items-center justify-between p-4 text-left transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-sm font-light text-text-body dark:text-white/70">
              {formatKycTierDisplayLabel(tierData.level)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-light text-text-secondary dark:text-lavender-500">
              {isExpanded ? "See less" : "See more"}
            </span>
            <ArrowDown01Icon
              className={classNames(
                "size-4 text-outline-gray transition-transform dark:text-lavender-500",
                isExpanded ? "rotate-180" : "rotate-0",
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
                        {(() => {
                          if (req.toLowerCase().includes("phone")) {
                            return (
                              <TbPhoneCall className="size-4 text-outline-gray dark:text-white/50" />
                            );
                          }
                          if (req.includes("Selfie verification")) {
                            return (
                              <FaceIdIcon className="size-4 text-outline-gray dark:text-white/70" />
                            );
                          }
                          if (req.includes("Address verification")) {
                            return (
                              <MapPinpoint01Icon className="size-4 text-outline-gray dark:text-white/50" />
                            );
                          }
                          if (req.includes("Business verification")) {
                            return (
                              <WorkAlertIcon className="size-4 text-outline-gray dark:text-white/50" />
                            );
                          }
                          if (req.includes("ID")) {
                            return (
                              <TbIdBadge className="size-4 text-outline-gray dark:text-white/50" />
                            );
                          }
                          return (
                            <InformationCircleIcon className="size-4 text-outline-gray dark:text-white/50" />
                          );
                        })()}
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
                    {tierData.limits.unlimited ? (
                      "Unlimited"
                    ) : (
                      <>
                        <span className="text-sm font-medium">
                          ${formatUsdAmount(tierData.limits.monthly)}
                        </span>{" "}
                        / month
                      </>
                    )}
                  </p>
                </div>
                {tier == 0 && tierLevel === tier + 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsLimitModalOpen(true);
                    }}
                    title={`Upgrade to ${formatKycTierDisplayLabel(tierLevel)}`}
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
    <div className={layout === "sheet" ? "space-y-6" : "flex h-full flex-col p-5"}>
      {/* Header */}
      {layout === "sheet" ? (
        <div className="flex items-center justify-between">
          <button type="button" title="Back" onClick={onBack}>
            <ArrowLeft02Icon className="size-5 text-outline-gray dark:text-white/50" />
          </button>
          <h2 className="text-lg font-semibold text-text-body dark:text-white">
            Profile
          </h2>
          <div className="w-10"></div>
        </div>
      ) : (
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
      )}

      {/* Body content */}
      <div className={classNames(
        "scrollbar-hide flex-1 space-y-4 overflow-y-auto pb-4",
        layout === "sheet" ? "" : "mt-6"
      )}>
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
                  alt=""
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
                  {walletAddress ? (
                    <div className="flex w-full items-center justify-between">
                      <p className="text-sm font-light text-text-body dark:text-white/70">
                        {shortenAddress(walletAddress, 10)}
                      </p>
                      <button
                        type="button"
                        onClick={() => void handleCopyAddress()}
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
                  ) : null}
                </div>
              </div>
            </div>

            {/* Current tier status */}
            {hasAssignedKycTier(tier) && (
              <div className="space-y-4 rounded-[20px] border border-border-light bg-transparent p-4 dark:border-white/5">
                <div className="flex w-[137px] items-center gap-2 rounded-lg bg-[#39C65D] px-3 py-1.5 dark:bg-[#39C65D]">
                  <StarIcon
                    className="text-white dark:text-black"
                    size={16}
                  />
                  <span className="text-xs font-medium text-white dark:text-black">
                    Current: {formatKycTierDisplayLabel(tier)}
                  </span>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-light text-text-secondary dark:text-white/70">
                      Monthly limit
                    </span>
                    <InformationCircleIcon className="size-4 text-outline-gray dark:text-white/50" />
                  </div>

                  <div className="text-2xl font-light text-text-body dark:text-white">
                    ${formatUsdAmount(transactionSummary.monthlySpent)}{" "}
                    /{" "}
                    {currentLimits.unlimited
                      ? "Unlimited"
                      : `$${formatUsdAmount(currentLimits.monthly)}`}
                  </div>

                  {!currentLimits.unlimited && (
                    <div className="flex h-2 w-full items-center rounded-full bg-gray-300 dark:bg-white/10">
                      <div
                        className="h-2.5 rounded-full bg-gradient-to-r from-lavender-300 to-lavender-600 transition-all duration-500 dark:from-lavender-400 dark:to-lavender-600"
                        style={{
                          width: `${Math.min(monthlyProgress, 100)}%`,
                        }}
                      />
                    </div>
                  )}
                </div>

                {tier < 3 && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsLimitModalOpen(true);
                    }}
                    title={`Upgrade to ${formatKycTierDisplayLabel(tier + 1)}`}
                    className="min-h-11 w-full rounded-xl bg-lavender-600 px-4 py-2 text-center text-sm font-light text-white transition-all hover:scale-[0.98] hover:bg-lavender-700 active:scale-95 dark:bg-lavender-500 dark:hover:bg-lavender-600"
                  >
                    Increase limit → {formatKycTierDisplayLabel(tier + 1)}
                  </button>
                )}
              </div>
            )}

            {/* Tier Information */}
            {Object.values(KYC_TIERS)
              .filter((tierData) => tierData.level > tier)
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

      <TransactionLimitModal
        isOpen={isLimitModalOpen}
        onClose={async () => {
          setIsLimitModalOpen(false);
          await refreshStatus();
        }}
      />
    </div>
  );
}
