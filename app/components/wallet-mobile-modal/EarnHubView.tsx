"use client";

import React, { useEffect, useMemo } from "react";
import { ArrowLeft02Icon, Cancel01Icon, Setting07Icon } from "hugeicons-react";
import {
  EARN_TOKENS,
  useEarnHandler,
  type EarnActivityEntry,
  type EarnToken,
} from "../../hooks/useEarnHandler";
import { EarnDisclosureBanner } from "../EarnDisclosureBanner";
import { EarnActivityPanel } from "../EarnActivityPanel";

const TOKEN_DECIMALS = 6;
const TOKEN_FACTOR = BigInt("1000000");
const APR_REFRESH_MS = 30_000;

function formatBaseUnits(units: bigint, fractionDigits = 4): string {
  const negative = units < BigInt("0");
  const abs = negative ? -units : units;
  const whole = abs / TOKEN_FACTOR;
  const frac = abs % TOKEN_FACTOR;
  const fracStr = frac
    .toString()
    .padStart(TOKEN_DECIMALS, "0")
    .slice(0, fractionDigits);
  const trimmed = fracStr.replace(/0+$/, "");
  const out = trimmed ? `${whole}.${trimmed}` : whole.toString();
  return negative ? `-${out}` : out;
}

function formatPercent(decimal: number | null): string {
  if (decimal === null || !Number.isFinite(decimal)) return "";
  return `${(decimal * 100).toFixed(2)}%`;
}

function safeBigInt(s: string | undefined): bigint {
  if (!s) return BigInt("0");
  try {
    return BigInt(s);
  } catch {
    return BigInt("0");
  }
}

function projectEarnings(
  principalBaseUnits: bigint,
  apy: number | null,
): { monthly: bigint; yearly: bigint } {
  if (apy == null || principalBaseUnits <= BigInt("0")) {
    return { monthly: BigInt("0"), yearly: BigInt("0") };
  }
  const yearly =
    (principalBaseUnits * BigInt(Math.round(apy * 1_000_000))) /
    BigInt("1000000");
  const monthly = yearly / BigInt("12");
  return { monthly, yearly };
}

interface EarnHubViewProps {
  onBack: () => void;
  onClose: () => void;
  onSettings?: () => void;
  onDeposit: () => void;
  onWithdraw: () => void;
  onSelectActivity: (entry: EarnActivityEntry) => void;
}

export const EarnHubView: React.FC<EarnHubViewProps> = ({
  onBack,
  onClose,
  onSettings,
  onDeposit,
  onWithdraw,
  onSelectActivity,
}) => {
  const { positions, refreshAllPositions } = useEarnHandler();

  useEffect(() => {
    void refreshAllPositions();
    const id = window.setInterval(() => {
      void refreshAllPositions();
    }, APR_REFRESH_MS);
    return () => clearInterval(id);
  }, [refreshAllPositions]);

  const suppliedTokens = useMemo<EarnToken[]>(
    () =>
      EARN_TOKENS.filter(
        (t) => safeBigInt(positions[t]?.suppliedBaseUnits) > BigInt("0"),
      ),
    [positions],
  );

  const hasWithdrawableBalance = suppliedTokens.length > 0;

  const primaryToken = suppliedTokens[0] ?? null;
  const primaryPosition = primaryToken ? positions[primaryToken] : null;
  const primarySupplied = safeBigInt(primaryPosition?.suppliedBaseUnits);
  const primaryApy = primaryPosition?.supplyApy ?? null;
  const { monthly, yearly } = projectEarnings(primarySupplied, primaryApy);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          title="Back to wallet"
          onClick={onBack}
          className="flex items-center gap-1 rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10"
        >
          <ArrowLeft02Icon className="size-5 text-outline-gray dark:text-white/50" />
          <span className="text-lg font-semibold text-text-body dark:text-white">
            Earn
          </span>
        </button>
        <div className="flex items-center">
          {onSettings ? (
            <button
              type="button"
              title="Settings"
              onClick={onSettings}
              className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10"
            >
              <Setting07Icon className="size-5 text-outline-gray dark:text-white/50" />
            </button>
          ) : null}
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

      <div className="space-y-4 rounded-[20px] border border-border-light bg-accent-gray/40 p-5 dark:border-white/10 dark:bg-white/5">
        {primaryToken ? (
          <div className="space-y-3">
            <p className="text-sm text-text-secondary dark:text-white/50">
              Earning
              {primaryApy != null ? (
                <>
                  <span className="mx-1.5 inline-block size-[3px] translate-y-[-1px] rounded-full bg-text-secondary dark:bg-white/50" />
                  {formatPercent(primaryApy)}
                </>
              ) : null}
            </p>
            <div className="flex items-end justify-between gap-2">
              <p className="text-[1.75rem] font-semibold leading-9 text-text-body dark:text-white">
                {formatBaseUnits(primarySupplied)} {primaryToken}
              </p>
              {primaryApy != null && (
                <div className="flex flex-col items-end gap-0.5 text-right text-xs text-text-secondary dark:text-white/50">
                  <p>
                    Monthly:{" "}
                    <span className="font-semibold text-text-body dark:text-white">
                      ${formatBaseUnits(monthly, 2)}
                    </span>
                  </p>
                  <p>
                    Yearly:{" "}
                    <span className="font-semibold text-text-body dark:text-white">
                      ${formatBaseUnits(yearly, 2)}
                    </span>
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-secondary dark:text-white/50">
            No funds in Earn yet. Deposit USDC or USDT to start earning.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onDeposit}
            className="min-h-11 rounded-xl bg-lavender-500 py-2.5 text-sm font-semibold text-white transition-all hover:bg-lavender-600 active:scale-[0.98]"
          >
            Deposit
          </button>
          <button
            type="button"
            onClick={onWithdraw}
            disabled={!hasWithdrawableBalance}
            className="min-h-11 rounded-xl bg-accent-gray py-2.5 text-sm font-medium text-gray-900 transition-all hover:bg-[#EBEBEF] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
          >
            Withdraw
          </button>
        </div>
      </div>

      <EarnDisclosureBanner />

      <div className="space-y-4">
        <h3 className="text-base font-semibold text-text-body dark:text-white">
          Earn activity
        </h3>
        <EarnActivityPanel
          showDisclosureBanner={false}
          onSelectActivity={onSelectActivity}
        />
      </div>
    </div>
  );
};
