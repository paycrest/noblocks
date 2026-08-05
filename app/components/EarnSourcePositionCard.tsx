"use client";

import { useEarnSourcePosition } from "../hooks/useEarnSourcePosition";
import { EARN_STARKNET_DISCLOSURE } from "../lib/earnChains";
import { classNames } from "../utils";

interface EarnSourcePositionCardProps {
  evmAddress: string;
  sourceChain: string;
  className?: string;
}

export function EarnSourcePositionCard({
  evmAddress,
  sourceChain,
  className,
}: EarnSourcePositionCardProps) {
  const position = useEarnSourcePosition(evmAddress, sourceChain, "USDC");
  if (!position) return null;

  const supplied = parseFloat(position.suppliedFormatted || "0");
  if (!(supplied > 0)) return null;

  return (
    <div
      className={classNames(
        "rounded-xl border border-border-light bg-accent-gray px-3 py-3 dark:border-white/10 dark:bg-white/5",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-text-body dark:text-white">
          Earn · {supplied.toFixed(2)} USDC
        </p>
        {position.supplyApy != null && (
          <span className="text-xs text-lavender-500">
            {(position.supplyApy * 100).toFixed(2)}% APY
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-text-secondary dark:text-white/50">
        {EARN_STARKNET_DISCLOSURE}
      </p>
    </div>
  );
}
