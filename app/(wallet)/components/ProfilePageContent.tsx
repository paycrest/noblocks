"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLogout, usePrivy } from "@privy-io/react-auth";
import {
  ArrowDown01Icon,
  Copy01Icon,
  StarIcon,
  InformationCircleIcon,
  FaceIdIcon,
  MapPinpoint01Icon,
  WorkAlertIcon,
} from "hugeicons-react";
import { PiCheck } from "react-icons/pi";
import { TbIdBadge, TbPhoneCall } from "react-icons/tb";
import type { KYCTier } from "../../context/KYCContext";
import {
  formatKycTierDisplayLabel,
  hasAssignedKycTier,
} from "../../lib/kyc-upgrade-path";
import { isPooledAllowance } from "../../lib/kyc-limit-copy";
import { resetNetworkModalDismissed } from "../../lib/networkModalStore";
import { clearUserSessionData } from "../../lib/session-cleanup";
import { shortenAddress, classNames } from "../../utils";
import {
  useProfileViewModel,
  formatMonthlyLimitLine,
  formatTierLimitLine,
} from "../../hooks/useProfileViewModel";
import { useWalletDisconnect } from "../../hooks/useWalletDisconnect";
import TransactionLimitModal from "../../components/TransactionLimitModal";

const pulseBar =
  "animate-pulse motion-reduce:animate-none bg-gray-200 dark:bg-white/10";

function trackLogoutWithFetch(payload: {
  walletAddress: string;
  logoutMethod: string;
}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1500); // 1.5s timeout

  fetch("/api/track-logout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: controller.signal,
  })
    .catch((error) => {
      if (error.name !== "AbortError") {
        console.warn("Logout tracking failed:", error);
      }
    })
    .finally(() => {
      clearTimeout(timeoutId);
    });
}

/**
 * Sign-out behavior shared with SettingsDropdown: track the logout server-side
 * (best-effort), clear local session state, log out of Privy, then disconnect
 * an injected EIP-1193 wallet if present.
 */
function useAccountLogout(walletAddress: string | null | undefined) {
  const { user } = usePrivy();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { disconnectWallet } = useWalletDisconnect();

  const { logout } = useLogout({
    onSuccess: () => {
      setIsLoggingOut(false);
      resetNetworkModalDismissed();
    },
  });

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      if (walletAddress) {
        const trackingPayload = {
          walletAddress,
          logoutMethod: "profile_page",
        };
        if (navigator.sendBeacon) {
          try {
            navigator.sendBeacon(
              "/api/track-logout",
              JSON.stringify(trackingPayload),
            );
          } catch (beaconError) {
            console.warn(
              "sendBeacon failed, falling back to fetch:",
              beaconError,
            );
            trackLogoutWithFetch(trackingPayload);
          }
        } else {
          trackLogoutWithFetch(trackingPayload);
        }
      }

      clearUserSessionData(user?.id, walletAddress ?? user?.wallet?.address);

      localStorage.removeItem(`starknet_walletId_${user?.id}`);
      localStorage.removeItem(`starknet_address_${user?.id}`);
      localStorage.removeItem(`starknet_publicKey_${user?.id}`);
      localStorage.removeItem(`starknet_deployed_${user?.id}`);

      await logout();

      if (window.ethereum) {
        try {
          await disconnectWallet();
        } catch (disconnectError) {
          console.warn("Wallet disconnect failed:", disconnectError);
        }
      }
    } catch (error) {
      console.error("Error during logout:", error);
    } finally {
      setIsLoggingOut(false);
    }
  };

  return { handleLogout, isLoggingOut };
}

/** Icon for a KYC_TIERS requirement string, matching the icons ProfileView already uses. */
function requirementIcon(req: string) {
  const className = "size-5 text-outline-gray dark:text-white/50";
  if (req.toLowerCase().includes("phone")) return <TbPhoneCall className={className} />;
  if (req.includes("Selfie verification")) return <FaceIdIcon className={className} />;
  if (req.includes("Address verification")) return <MapPinpoint01Icon className={className} />;
  if (req.includes("Business verification")) return <WorkAlertIcon className={className} />;
  if (req.includes("ID")) return <TbIdBadge className={className} />;
  return <InformationCircleIcon className={className} />;
}

function AccordionTierRow({
  tierData,
  isExpanded,
  onToggle,
  showVerifyCta,
  onVerify,
}: {
  tierData: KYCTier;
  isExpanded: boolean;
  onToggle: () => void;
  showVerifyCta: boolean;
  onVerify: () => void;
}) {
  return (
    <div
      className={classNames(
        "border-[0.5px] border-border-light bg-background-neutral dark:border-0 dark:bg-[#363636]",
        isExpanded ? "rounded-[20px]" : "rounded-2xl",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        title={`View ${formatKycTierDisplayLabel(tierData.level)} details`}
        className="flex h-14 w-full items-center justify-between p-4 text-left transition-colors"
      >
        <span className="font-general-sans text-sm font-medium text-text-body dark:text-white/80">
          {formatKycTierDisplayLabel(tierData.level)}
        </span>
        <span className="flex items-center gap-1">
          <span className="font-general-sans text-sm font-medium text-lavender-500 dark:text-lavender-400">
            {isExpanded ? "See less" : "See more"}
          </span>
          <ArrowDown01Icon
            className={classNames(
              "size-4 text-lavender-500 transition-transform dark:text-lavender-400",
              isExpanded ? "rotate-180" : "rotate-0",
            )}
          />
        </span>
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
            <div className="space-y-3 px-4 pb-4">
              {tierData.requirements.length > 0 && (
                <ul className="space-y-3">
                  {tierData.requirements.map((req) => (
                    <li
                      key={req}
                      className="flex items-center gap-3 font-general-sans text-sm tracking-[-0.14px] text-text-body dark:text-white/60"
                    >
                      <span className="rounded-lg bg-accent-gray p-0.5 dark:bg-white/10">
                        {requirementIcon(req)}
                      </span>
                      <span>{req}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex items-center justify-between rounded-xl bg-accent-gray px-4 py-3 font-general-sans tracking-[-0.14px] dark:bg-[#404040]">
                <p className="text-sm text-text-body dark:text-white/60">Limit</p>
                <p className="text-sm font-medium text-text-body dark:text-white/80">
                  {formatTierLimitLine(tierData.limits.monthly, !!tierData.limits.unlimited)}
                </p>
              </div>
              {showVerifyCta && (
                <button
                  type="button"
                  onClick={onVerify}
                  className="min-h-11 w-full rounded-xl bg-lavender-500 px-4 py-2 text-center text-sm font-medium text-white transition-all hover:scale-[0.98] hover:bg-lavender-600 active:scale-95"
                >
                  Verify to start swapping
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ProfilePageSkeleton() {
  return (
    <div className="mt-[37px] flex flex-col gap-5" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-4 rounded-[20px] bg-white p-4 dark:bg-[#2b2b2b] md:flex-row md:items-start md:justify-between">
        <div className={classNames("h-5 w-16 rounded", pulseBar)} />
        <div className="flex w-full min-w-0 flex-col gap-[18px] md:w-[419px]">
          <div className="flex items-center gap-2.5 rounded-2xl bg-background-neutral p-4 dark:bg-[#363636]">
            <div className={classNames("size-11 shrink-0 rounded-full", pulseBar)} />
            <div className="flex-1 space-y-2">
              <div className={classNames("h-3 w-32 rounded", pulseBar)} />
              <div className={classNames("h-3 w-24 rounded", pulseBar)} />
            </div>
          </div>
          <div className="space-y-3 rounded-[20px] bg-background-neutral p-4 dark:bg-[#363636]">
            <div className={classNames("h-6 w-24 rounded-lg", pulseBar)} />
            <div className={classNames("h-8 w-full rounded", pulseBar)} />
            <div className={classNames("h-2 w-full rounded-full", pulseBar)} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProfilePageContent() {
  const {
    user,
    isInjectedWallet,
    walletAddress,
    tier,
    pooledWalletCount,
    transactionSummary,
    currentLimits,
    monthlyProgress,
    isLoading,
    linkEmail,
    handleCopyAddress,
    isAddressCopied,
    expandedTierLevel,
    toggleTierExpansion,
    tiersAboveCurrent,
    refreshStatus,
    isLimitModalOpen,
    openLimitModal,
    closeLimitModal,
  } = useProfileViewModel();

  const { handleLogout, isLoggingOut } = useAccountLogout(walletAddress);

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-[643px] pt-[23px]">
        <h1 className="font-sans text-2xl font-semibold leading-6 text-neutral-900 dark:text-white">
          Profile
        </h1>
        <ProfilePageSkeleton />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[643px] pt-[23px]">
      <h1 className="font-sans text-2xl font-semibold leading-6 text-neutral-900 dark:text-white">
        Profile
      </h1>

      <div className="mt-[37px] flex flex-col gap-5">
        <div className="flex flex-col gap-4 rounded-[20px] bg-white p-4 dark:bg-[#2b2b2b] md:flex-row md:items-start md:justify-between">
          <div className="shrink-0 md:w-[105px]">
            <span className="font-sans text-base font-semibold text-neutral-900 dark:text-white">
              Profile
            </span>
          </div>

          <div className="flex w-full min-w-0 flex-col gap-[18px] md:w-[419px]">
            {/* Account card */}
            <div className="space-y-3 rounded-[20px] border-[0.5px] border-border-light bg-background-neutral p-4 dark:border-0 dark:bg-[#363636]">
              <h2 className="font-general-sans text-sm font-medium tracking-[-0.14px] text-text-body dark:text-white/90">
                Account
              </h2>
              <div className="flex items-center gap-2.5">
                <img
                  src="/icons/placeholder.png"
                  alt=""
                  className="h-11 w-11 shrink-0 rounded-full object-cover"
                />
                <div className="flex w-full min-w-0 flex-col items-start gap-1">
                  {!isInjectedWallet &&
                    (user?.email ? (
                      <p className="max-w-full truncate font-general-sans text-sm font-medium tracking-[-0.14px] text-text-body dark:text-white/90">
                        {user.email.address}
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={linkEmail}
                        className="font-general-sans text-sm font-medium tracking-[-0.14px] text-lavender-500 hover:underline dark:text-lavender-400"
                      >
                        Connect my email
                      </button>
                    ))}

                  {walletAddress ? (
                    <div className="flex w-full items-center justify-between gap-2">
                      <p className="min-w-0 truncate font-general-sans text-sm text-text-body dark:text-white/70">
                        {shortenAddress(walletAddress, 13, 15)}
                      </p>
                      <button
                        type="button"
                        onClick={() => void handleCopyAddress()}
                        title="Copy wallet address"
                        className="shrink-0 rounded-lg p-1 transition-colors hover:bg-white dark:hover:bg-white/10"
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
              <div className="flex flex-col rounded-[20px] border-[0.5px] border-border-light bg-background-neutral p-4 dark:border-0 dark:bg-[#363636]">
                <div className="flex w-fit items-center gap-2 rounded-lg bg-[#39C65D] px-2 py-1">
                  <StarIcon className="text-white dark:text-black" size={16} />
                  <span className="text-sm font-semibold text-white dark:text-black">
                    Current: {formatKycTierDisplayLabel(tier)}
                  </span>
                </div>

                <div className="mt-4 flex items-center gap-1">
                  <span className="text-sm font-medium text-text-body dark:text-white/80">
                    Monthly limit
                  </span>
                  <InformationCircleIcon className="size-4 text-outline-gray dark:text-white/50" />
                </div>

                <div className="mt-4 space-y-3">
                  {isPooledAllowance(pooledWalletCount) && (
                    <p className="text-xs font-light text-text-secondary dark:text-white/50">
                      Shared across your {pooledWalletCount} wallets
                    </p>
                  )}

                  <div className="font-general-sans text-2xl font-medium leading-9 tracking-[-0.72px] text-text-body dark:text-white">
                    {formatMonthlyLimitLine(
                      transactionSummary.monthlySpent,
                      currentLimits.monthly,
                      !!currentLimits.unlimited,
                    )}
                  </div>

                  {!currentLimits.unlimited && (
                    <div className="flex h-2 w-full items-center rounded-full bg-border-light dark:bg-white/10">
                      <div
                        className="h-2 rounded-full bg-lavender-500 transition-all duration-500"
                        style={{ width: `${monthlyProgress}%` }}
                      />
                    </div>
                  )}
                </div>

                {tier < 4 && (
                  <button
                    type="button"
                    onClick={openLimitModal}
                    title={`Upgrade to ${formatKycTierDisplayLabel(tier + 1)}`}
                    className="mt-[14px] min-h-11 w-full rounded-xl bg-lavender-500 px-4 py-2 text-center text-sm font-medium text-white transition-all hover:scale-[0.98] hover:bg-lavender-600 active:scale-95"
                  >
                    Increase limit → {formatKycTierDisplayLabel(tier + 1)}
                  </button>
                )}
              </div>
            )}

            {/* Tier accordion: lists the tiers above the current one, same rule as ProfileView. */}
            {tiersAboveCurrent.length > 0 && (
              <div className="flex w-full flex-col gap-3">
                {tiersAboveCurrent.map((tierData) => (
                  <AccordionTierRow
                    key={tierData.level}
                    tierData={tierData}
                    isExpanded={expandedTierLevel === tierData.level}
                    onToggle={() => toggleTierExpansion(tierData.level)}
                    showVerifyCta={tier === 0 && tierData.level === tier + 1}
                    onVerify={openLimitModal}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {!isInjectedWallet && (
          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={isLoggingOut}
            className="self-start text-sm font-medium tracking-[-0.14px] text-[#d50b3e] hover:underline disabled:opacity-50 dark:text-[#f53d6b]"
          >
            Sign out
          </button>
        )}
      </div>

      <TransactionLimitModal
        isOpen={isLimitModalOpen}
        onClose={async () => {
          closeLimitModal();
          await refreshStatus();
        }}
      />
    </div>
  );
}
