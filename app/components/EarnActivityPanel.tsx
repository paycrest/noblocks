"use client";

import React, { useEffect, useMemo } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  EARN_TOKENS,
  useEarnHandler,
  type EarnActivityEntry,
  type EarnToken,
} from "../hooks/useEarnHandler";
import { classNames, getRelativeDate } from "../utils";

const TOKEN_DECIMALS = 6;
const TOKEN_FACTOR = BigInt("1000000");
// Vesu's pool APR fluctuates with utilization. Poll the markets API on this
// cadence so the displayed rate doesn't drift from the live pool while the
// wallet drawer is open.
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

const Divider = () => (
  <div className="w-full border border-dashed border-[#EBEBEF] dark:border-[#FFFFFF1A]" />
);

interface Props {
  onSelectActivity?: (entry: EarnActivityEntry) => void;
}

export const EarnActivityPanel: React.FC<Props> = ({ onSelectActivity }) => {
  const { positions, activity, refreshAllPositions } = useEarnHandler();

  useEffect(() => {
    void refreshAllPositions();
    const id = window.setInterval(() => {
      void refreshAllPositions();
    }, APR_REFRESH_MS);
    return () => clearInterval(id);
  }, [refreshAllPositions]);

  // Show a "Currently supplied" card per token where supplied > 0 (option b).
  const suppliedTokens = useMemo<EarnToken[]>(
    () =>
      EARN_TOKENS.filter(
        (t) => safeBigInt(positions[t]?.suppliedBaseUnits) > BigInt("0"),
      ),
    [positions],
  );

  // Group activity by relative date label (Today / Yesterday / N days ago …),
  // newest group first. Mirrors the Transactions tab grouping.
  const groupedActivity = useMemo(() => {
    const groups = new Map<string, EarnActivityEntry[]>();
    for (const entry of activity) {
      const label = getRelativeDate(new Date(entry.timestamp));
      const bucket = groups.get(label);
      if (bucket) bucket.push(entry);
      else groups.set(label, [entry]);
    }
    return Array.from(groups, ([label, entries]) => ({ label, entries })).sort(
      (a, b) => b.entries[0].timestamp - a.entries[0].timestamp,
    );
  }, [activity]);

  return (
    <div className="space-y-6">
      {suppliedTokens.length > 0 && (
        <div className="space-y-2">
          {suppliedTokens.map((t) => {
            const pos = positions[t];
            const supplied = safeBigInt(pos?.suppliedBaseUnits);
            const apy = pos?.supplyApy ?? null;
            const { monthly, yearly } = projectEarnings(supplied, apy);
            return (
              <div
                key={t}
                className="flex flex-col gap-3 rounded-xl bg-accent-gray p-4 dark:bg-white/5"
              >
                <div className="flex justify-between gap-1">
                  <p className="text-xs text-text-secondary dark:text-white/50">
                    Earning
                    {apy != null ? ` · ${formatPercent(apy)}` : ""}
                  </p>
                </div>
                <div className="flex items-end justify-between gap-2">
                  <p className="text-xl font-semibold text-text-body dark:text-white">
                    {formatBaseUnits(supplied)} {t}
                  </p>
                  {apy != null && (
                    <div className="flex flex-col items-end gap-1 text-right text-xs text-text-secondary dark:text-white/50">
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
            );
          })}
        </div>
      )}

      {groupedActivity.length === 0 ? (
        <p className="text-sm text-text-secondary dark:text-white/40">
          No earn activity yet.
        </p>
      ) : (
        <div className="w-full space-y-6">
          <AnimatePresence mode="popLayout">
            {groupedActivity.map(({ label, entries }) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-3"
              >
                <div className="flex items-center justify-between gap-x-6">
                  <h3 className="whitespace-nowrap text-sm font-medium text-text-secondary dark:text-white/50">
                    {label}
                  </h3>
                  <Divider />
                </div>
                <div className="space-y-2">
                  {entries.map((entry) => (
                    <ActivityRow
                      key={entry.txHash}
                      entry={entry}
                      onClick={() => onSelectActivity?.(entry)}
                    />
                  ))}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

const ActivityRow: React.FC<{
  entry: EarnActivityEntry;
  onClick: () => void;
}> = ({ entry, onClick }) => {
  const isDeposit = entry.type === "deposit";
  const verb = isDeposit ? "Deposited" : "Withdrew";
  const amount = formatBaseUnits(safeBigInt(entry.amountBaseUnits));
  const tokenLogo = `/logos/${entry.token.toLowerCase()}-logo.svg`;
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      onClick={onClick}
      className="group flex cursor-pointer items-start justify-between rounded-xl px-2 py-2 transition-all hover:bg-gray-50 dark:hover:bg-white/5"
    >
      <div className="flex items-center gap-2">
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-x-2">
            <Image
              src={tokenLogo}
              alt={entry.token}
              width={16}
              height={16}
              quality={90}
              className="rounded-full"
            />
            <span className="dark:text-white/80">
              {verb} {amount} {entry.token}
            </span>
          </div>
          <div className="flex items-center gap-x-2">
            <span className="text-text-disabled dark:text-white/30">
              {new Date(entry.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span className="size-1 bg-icon-outline-disabled dark:bg-white/5"></span>
            <span className={classNames("text-green-500")}>completed</span>
          </div>
        </div>
      </div>
      <span className="text-sm text-text-secondary dark:text-white/50">
        {amount} {entry.token}
      </span>
    </motion.div>
  );
};
