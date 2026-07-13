"use client";

import React, { useMemo } from "react";
import { classNames, formatDecimalPrecision, formatTokenAmount } from "@/app/utils";
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  ArrowRight03Icon,
  ArrowUpDownIcon,
  Wallet01Icon,
} from "hugeicons-react";
import { useBalance } from "@/app/context/BalanceContext";
import { networks } from "@/app/mocks";
import type { BridgeLeg } from "@/app/lib/bridge";

export type PickerTarget = "fromToken" | "toToken" | "fromNet" | "toNet";

interface BridgeRouteSelectorProps {
  from: BridgeLeg | null;
  to: BridgeLeg | null;
  amount: string;
  fromNetworkName: string;
  toNetworkName: string;
  onFromChange: (leg: BridgeLeg | null) => void;
  onToChange: (leg: BridgeLeg | null) => void;
  onAmountChange: (amount: string) => void;
  onFromNetworkChange: (name: string) => void;
  onToNetworkChange: (name: string) => void;
  onOpenPicker: (target: PickerTarget) => void;
  outputAmount?: string;
  engine?: "near" | "lifi" | null;
  timeEstimate?: string;
  isQuoteLoading?: boolean;
}

function getNetworkImgSrc(network: (typeof networks)[0]): string {
  return typeof network.imageUrl === "string"
    ? network.imageUrl
    : (network.imageUrl as { light: string; dark: string }).dark;
}

export const BridgeRouteSelector: React.FC<BridgeRouteSelectorProps> = ({
  from,
  to,
  amount,
  fromNetworkName,
  toNetworkName,
  onFromChange,
  onToChange,
  onAmountChange,
  onFromNetworkChange,
  onToNetworkChange,
  onOpenPicker,
  outputAmount,
  engine,
  timeEstimate,
  isQuoteLoading,
}) => {
  const { crossChainBalances } = useBalance();

  const fromNetworkObj = useMemo(
    () => networks.find((n) => n.chain.name === fromNetworkName),
    [fromNetworkName],
  );
  const toNetworkObj = useMemo(
    () => networks.find((n) => n.chain.name === toNetworkName),
    [toNetworkName],
  );

  const fromBalance = useMemo(() => {
    if (!from) return 0;
    const entry = crossChainBalances.find(
      (b) => b.network.chain.name === from.network,
    );
    const key = from.token.toUpperCase();
    return (
      entry?.balances.rawBalances?.[key] ??
      entry?.balances.rawBalances?.[from.token] ??
      entry?.balances.balances[key] ??
      entry?.balances.balances[from.token] ??
      0
    );
  }, [from, crossChainBalances]);

  const handleFlip = () => {
    onFromNetworkChange(toNetworkName);
    onToNetworkChange(fromNetworkName);
    onFromChange(to);
    onToChange(from);
    onAmountChange("");
  };

  const handleMax = () => {
    // Truncate (floor) to 6dp — never round up, or the sent amount can exceed
    // the on-chain balance and the transfer reverts ("transfer amount exceeds balance").
    if (fromBalance > 0) onAmountChange(String(formatDecimalPrecision(fromBalance, 6)));
  };

  const cardCls =
    "rounded-2xl bg-gray-100 dark:bg-surface-canvas border border-gray-200 dark:border-white/5 p-4 space-y-3";

  const TokenPill = ({
    symbol,
    target,
  }: {
    symbol?: string;
    target: PickerTarget;
  }) => (
    <button
      type="button"
      onClick={() => onOpenPicker(target)}
      className="flex items-center gap-2 rounded-full bg-white dark:bg-neutral-700 px-3 py-2 text-sm font-semibold text-gray-900 dark:text-white shadow-sm hover:bg-gray-50 dark:hover:bg-neutral-600 active:scale-95 transition-all"
    >
      {symbol && (
        <img
          src={`/logos/${symbol.toLowerCase()}-logo.svg`}
          alt={symbol}
          className="size-5 rounded-full"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      )}
      <span>{symbol || "Select token"}</span>
      <ArrowDown01Icon className="size-3.5 text-gray-400 dark:text-white/40" />
    </button>
  );

  const NetworkChip = ({
    networkName,
    networkObj,
    target,
  }: {
    networkName: string;
    networkObj?: (typeof networks)[0];
    target: PickerTarget;
  }) => (
    <button
      type="button"
      onClick={() => onOpenPicker(target)}
      className="flex min-w-0 max-w-[45%] items-center gap-1.5 rounded-full bg-white dark:bg-neutral-700 px-3 py-2 text-xs font-semibold capitalize tracking-wide text-text-secondary dark:text-white/60 hover:bg-none dark:hover:bg-neutral-600 active:scale-95 transition-all"
    >
      {networkObj && (
        <img
          src={getNetworkImgSrc(networkObj)}
          alt={networkName}
          className="size-3.5 shrink-0 rounded-full"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      )}
      <span className="min-w-0 truncate">{networkName}</span>
      <ArrowDown01Icon className="size-3 shrink-0 text-gray-400 dark:text-white/40" />
    </button>
  );

  return (
    <div className="space-y-2">
      {/* Network route bar */}
      <div className="rounded-2xl bg-gray-100 dark:bg-neutral-800/60 border border-gray-200 dark:border-white/5 p-4 space-y-2">
        <p className="text-xs text-text-secondary dark:text-white/40">
          Select network route
        </p>
        <div className="flex items-center justify-between gap-2">
          <NetworkChip
            networkName={fromNetworkName}
            networkObj={fromNetworkObj}
            target="fromNet"
          />
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gray-200 dark:bg-neutral-700 text-gray-400 dark:text-white/40">
            <ArrowRight03Icon className="size-4" />
          </div>
          <NetworkChip
            networkName={toNetworkName}
            networkObj={toNetworkObj}
            target="toNet"
          />
        </div>
      </div>

      {/* FROM label */}
      <div className="flex items-end justify-between px-1">
        <span className="text-xs text-text-secondary dark:text-white/40">From</span>
      </div>

      {/* FROM card */}
      <div className={cardCls}>
        <div className="flex items-center justify-between">
          <TokenPill symbol={from?.token} target="fromToken" />
          <span className="text-xs text-text-secondary dark:text-white/40">
            on {fromNetworkName}
          </span>
        </div>
        <div className="flex items-end justify-between gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
            placeholder="0.00"
            className="text-3xl font-light bg-transparent text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-white/20 outline-none w-full min-w-0"
          />
          {from && fromBalance > 0 && (
            <div className="mb-1 flex shrink-0 flex-col items-end gap-1">
              <span className="flex items-center gap-1 text-xs text-text-secondary dark:text-white/40">
                <Wallet01Icon className="size-3.5" />
                {formatTokenAmount(fromBalance)} {from.token}
              </span>
              <button
                type="button"
                onClick={handleMax}
                className="text-xs font-bold text-lavender-600 dark:text-lavender-400 hover:underline"
              >
                Max
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Flip control */}
      <div className="relative flex items-center justify-center py-0.5">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-gray-200 dark:bg-white/10" />
        <button
          type="button"
          onClick={handleFlip}
          className="relative flex size-10 items-center justify-center rounded-full bg-gray-200 dark:bg-neutral-700 text-gray-500 dark:text-white/60 hover:bg-gray-300 dark:hover:bg-neutral-600 active:scale-95 transition-all"
        >
          {isQuoteLoading ? (
            <div className="size-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent dark:border-white/40 dark:border-t-transparent" />
          ) : (
            <ArrowUpDownIcon className="size-4" />
          )}
        </button>
      </div>

      {/* TO label */}
      <div className="flex items-end justify-between px-1">
        <span className="text-xs text-text-secondary dark:text-white/40">to</span>
      </div>

      {/* TO card */}
      <div className={cardCls}>
        <div className="flex items-center justify-between">
          <TokenPill symbol={to?.token} target="toToken" />
          <span className="text-xs text-text-secondary dark:text-white/40">
            on {toNetworkName}
          </span>
        </div>
        <div className="flex items-end justify-between">
          <span
            className={classNames(
              "text-3xl font-light",
              outputAmount
                ? "text-gray-900 dark:text-white"
                : "text-gray-300 dark:text-white/20",
            )}
          >
            {outputAmount ? formatTokenAmount(outputAmount) : "0.00"}
          </span>
        </div>
      </div>
    </div>
  );
};
