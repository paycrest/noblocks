"use client";

import React, { useEffect, useState } from "react";
import type { BridgeQuote } from "@/app/lib/bridge";
import { formatTokenAmount } from "@/app/utils";

interface BridgeQuoteCardProps {
  quote: BridgeQuote | null;
  isLoading: boolean;
  error: Error | null;
  engine: "near" | "lifi" | null;
  toToken?: string;
  onExpire?: () => void;
}

export const BridgeQuoteCard: React.FC<BridgeQuoteCardProps> = ({
  quote,
  isLoading,
  error,
  engine,
  toToken,
  onExpire,
}) => {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (quote?.kind !== "near-deposit" || !quote.deadline) {
      setSecondsLeft(null);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, Math.floor((quote.deadline - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) onExpire?.();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [quote, onExpire]);
  if (isLoading) {
    return (
      <div className="animate-pulse space-y-2.5 border-t border-gray-200 dark:border-white/10 pt-4">
        {["w-32", "w-48", "w-40"].map((widthClass) => (
          <div
            key={widthClass}
            className={`h-4 ${widthClass} rounded bg-gray-200 dark:bg-white/10`}
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="break-words rounded-xl bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/30">
        {error.message || "Failed to fetch quote. Please try again."}
      </div>
    );
  }

  if (!quote) return null;

  const engineLabel = engine === "near" ? "NEAR Intents" : "LI.FI";
  const routeName =
    quote.kind === "lifi-tx" &&
    quote.raw &&
    typeof quote.raw === "object" &&
    "toolDetails" in quote.raw
      ? (quote.raw as { toolDetails?: { name?: string } }).toolDetails?.name ||
        engineLabel
      : engineLabel;

  const Row = ({
    label,
    value,
    bold,
  }: {
    label: string;
    value: string;
    bold?: boolean;
  }) => (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-500 dark:text-white/50">{label}</span>
      <span
        className={
          bold
            ? "font-semibold text-gray-900 dark:text-white"
            : "text-gray-700 dark:text-white/70"
        }
      >
        {value}
      </span>
    </div>
  );

  return (
    <div className="space-y-2.5 border-t border-gray-200 dark:border-white/10 pt-4">
      <Row
        label="You receive"
        value={`${formatTokenAmount(quote.amountOut)} ${toToken || ""}`}
        bold
      />

      {quote.kind === "lifi-tx" && Number(quote.feeReceivingToken) > 0 && (
        <Row
          label="Network fee"
          value={`${formatTokenAmount(quote.feeReceivingToken)} ${toToken || ""}`}
        />
      )}

      {quote.kind === "lifi-tx" &&
        parseInt(String(quote.estimate.executionDuration)) > 0 && (
          <Row
            label="Est. time"
            value={`~${Math.ceil(parseInt(String(quote.estimate.executionDuration)) / 60)} min`}
          />
        )}

      {quote.kind === "near-deposit" && quote.timeEstimate && (
        <Row label="Est. time" value={quote.timeEstimate} />
      )}

      {secondsLeft !== null && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500 dark:text-white/50">Quote expires</span>
          <span className={secondsLeft <= 30 ? "font-semibold text-amber-500" : "text-gray-700 dark:text-white/70"}>
            {secondsLeft > 0
              ? `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`
              : "Expired"}
          </span>
        </div>
      )}
    </div>
  );
};
