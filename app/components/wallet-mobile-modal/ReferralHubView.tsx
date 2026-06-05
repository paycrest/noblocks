"use client";

import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { ArrowLeft02Icon, Cancel01Icon, Copy01Icon } from "hugeicons-react";
import { PiCheck } from "react-icons/pi";
import Image from "next/image";
import { getReferralData } from "@/app/api/aggregator";
import { usePrivy } from "@privy-io/react-auth";
import { ReferralDashboardSkeleton } from "../ReferralDashboardSkeleton";
import {
  getAvatarImageFromAddress,
  handleCopyCode,
  handleCopyLink,
} from "../../utils";

interface ReferralHubViewProps {
  onBack: () => void;
  onClose: () => void;
}

export const ReferralHubView: React.FC<ReferralHubViewProps> = ({
  onBack,
  onClose,
}) => {
  const { getAccessToken } = usePrivy();
  const [referralData, setReferralData] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"pending" | "earned">("pending");
  const [showCopiedMessage, setShowCopiedMessage] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function fetchData() {
      try {
        setIsLoading(true);
        const token = await getAccessToken();
        if (!token) {
          if (mounted) {
            setReferralData(null);
            toast.error("Please sign in again to load referral data");
          }
          return;
        }
        const response = await getReferralData(token);
        if (mounted && response.success) {
          setReferralData(response.data);
        } else if (mounted) {
          setReferralData(null);
          if (!response.success) {
            toast.error(response.error || "Failed to load referral data");
          }
        }
      } catch (error) {
        console.error("Failed to fetch referral data:", error);
        if (mounted) {
          toast.error("Failed to load referral data");
          setReferralData(null);
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    fetchData();

    return () => {
      mounted = false;
    };
  }, [getAccessToken]);

  const onCopyCode = () => {
    handleCopyCode(referralData?.referral_code, setShowCopiedMessage);
  };

  const onCopyLink = () => {
    handleCopyLink(referralData?.referral_code);
  };

  const filteredReferrals: any[] = (referralData?.referrals || []).filter(
    (r: any) => r.status === activeTab,
  );

  if (isLoading) {
    return <ReferralDashboardSkeleton />;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex-shrink-0">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            title="Back to wallet"
            onClick={onBack}
            className="flex items-center gap-1 rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10"
          >
            <ArrowLeft02Icon className="size-5 text-outline-gray dark:text-white/50" />
            <span className="text-lg font-semibold text-text-body dark:text-white">
              Referrals
            </span>
          </button>
          <button
            type="button"
            title="Close"
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10"
          >
            <Cancel01Icon className="size-5 text-outline-gray dark:text-white/50" />
          </button>
        </div>
      </div>

      <div className="flex-shrink-0">
        <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border-light bg-border-light dark:border-white/10 dark:bg-transparent">
          <div className="border-r border-border-light bg-transparent p-4 dark:border-white/10">
            <p className="mb-1 text-sm text-text-secondary dark:text-white/60">
              Earned
            </p>
            <p className="text-lg font-semibold text-text-body dark:text-white">
              {referralData?.total_earned?.toFixed(1) ?? "0.0"} USDC
            </p>
          </div>
          <div className="bg-transparent p-4">
            <p className="mb-1 text-sm text-text-secondary dark:text-white/60">
              Pending
            </p>
            <p className="text-lg font-semibold text-text-body dark:text-white">
              {referralData?.total_pending?.toFixed(0) ?? "0"} USDC
            </p>
          </div>
        </div>

        <div className="mb-4 space-y-3 rounded-2xl border border-border-light bg-transparent p-4 dark:border-white/10">
          <p className="text-sm text-text-secondary dark:text-white/60">
            Your invite code
          </p>

          <div className="flex items-center justify-between">
            <p className="text-2xl font-bold tracking-wider text-text-body dark:text-white">
              {referralData?.referral_code ?? "No code yet"}
            </p>
            <button
              onClick={onCopyCode}
              aria-pressed={showCopiedMessage}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 hover:bg-gray-100 dark:hover:bg-white/10 disabled:opacity-50"
              disabled={!referralData?.referral_code}
            >
              {showCopiedMessage ? (
                <>
                  <PiCheck className="size-4 text-lavender-500" />
                  <span className="text-sm font-medium text-lavender-500">
                    Copied
                  </span>
                </>
              ) : (
                <>
                  <Copy01Icon className="size-4 text-lavender-500" />
                  <span className="text-sm font-medium text-lavender-500">
                    Copy
                  </span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="mb-4">
          <button
            onClick={onCopyLink}
            className="min-h-11 w-full rounded-xl bg-lavender-500 py-3 text-base font-medium text-white transition-colors hover:bg-lavender-600 disabled:opacity-50"
            disabled={!referralData?.referral_code}
          >
            Copy Invite Link
          </button>
        </div>

        <p className="mb-6 text-sm leading-relaxed text-text-secondary dark:text-white/60">
          Earn when you refer your friends. You both get $1 when they complete
          their first $20 transaction.
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col pb-6">
        <div className="mb-4 flex flex-shrink-0 gap-6">
          <button
            onClick={() => setActiveTab("pending")}
            className={`text-base font-medium transition-colors ${
              activeTab === "pending"
                ? "text-text-body dark:text-white"
                : "text-text-secondary dark:text-white/50"
            }`}
          >
            Pending
          </button>

          <button
            onClick={() => setActiveTab("earned")}
            className={`text-base font-medium transition-colors ${
              activeTab === "earned"
                ? "text-text-body dark:text-white"
                : "text-text-secondary dark:text-white/50"
            }`}
          >
            Earned
          </button>
        </div>

        <div
          className="scrollbar-hide flex-1 space-y-3 overflow-y-auto"
          style={{
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
        >
          {filteredReferrals.length === 0 ? (
            <div className="rounded-2xl border border-border-light bg-transparent p-8 text-center dark:border-white/10">
              <p className="text-sm text-text-secondary dark:text-white/60">
                {activeTab === "pending"
                  ? "No pending referrals yet"
                  : "No earned referrals yet"}
              </p>
            </div>
          ) : (
            filteredReferrals.map((referral) => (
              <div
                key={referral.id}
                className="flex items-center justify-between py-2 pr-14"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full">
                    <Image
                      src={getAvatarImageFromAddress(referral.wallet_address)}
                      alt={`Avatar for ${referral.wallet_address_short}`}
                      width={40}
                      height={40}
                      className="size-10 rounded-full object-cover"
                    />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text-body dark:text-white">
                      {referral.wallet_address_short}
                    </p>
                  </div>
                </div>
                <p className="text-sm font-medium text-text-secondary dark:text-white/60">
                  {(referral.amount ?? 0).toFixed(1)} USDC
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
