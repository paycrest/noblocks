"use client";

import React, { useMemo } from "react";
import { classNames, formatDecimalPrecision, formatTokenAmount } from "@/app/utils";
import {
  ArrowRight03Icon,
  ArrowUpDownIcon,
  Wallet01Icon,
} from "hugeicons-react";
import { useBalance } from "@/app/context/BalanceContext";
import { useTokens } from "@/app/context";
import { networks } from "@/app/mocks";
import type { BridgeLeg } from "@/app/lib/bridge";
import { isRouteSupported } from "@/app/lib/bridge";
import { BridgePicker, BridgePickerChevron } from "./BridgePicker";
import type { BridgePickerItem } from "./BridgePicker";

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

function buildTokenLeg(
  networkName: string,
  symbol: string,
  allTokens: ReturnType<typeof useTokens>["allTokens"],
): BridgeLeg | null {
  const network = networks.find((n) => n.chain.name === networkName);
  const token = (allTokens[networkName] ?? []).find((t) => t.symbol === symbol);
  if (!network || !token) return null;
  return {
    network: network.chain.name,
    chainId: network.chain.id,
    token: token.symbol,
    tokenAddress: token.address,
    decimals: token.decimals,
    amount: "0",
    rawAmount: "0",
  };
}

const chipButtonClass =
  "flex min-w-0 max-w-full items-center gap-1.5 rounded-full bg-white px-3 py-2 text-xs font-semibold capitalize tracking-wide text-text-secondary transition-all hover:bg-gray-50 active:scale-95 dark:bg-neutral-700 dark:text-white/60 dark:hover:bg-neutral-600";

const tokenPillClass =
  "flex items-center gap-2 rounded-full bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm transition-all hover:bg-gray-50 active:scale-95 dark:bg-neutral-700 dark:text-white dark:hover:bg-neutral-600";

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
  outputAmount,
  isQuoteLoading,
}) => {
  const { crossChainBalances } = useBalance();
  const { allTokens } = useTokens();

  const networkItems: BridgePickerItem[] = useMemo(
    () =>
      networks.map((n) => ({
        id: n.chain.name,
        label: n.chain.name,
        imgSrc: getNetworkImgSrc(n),
      })),
    [],
  );

  const fromTokenItems: BridgePickerItem[] = useMemo(
    () =>
      (allTokens[fromNetworkName] ?? []).map((t) => ({
        id: t.symbol,
        label: t.symbol,
        imgSrc: `/logos/${t.symbol.toLowerCase()}-logo.svg`,
        sub: t.name,
      })),
    [allTokens, fromNetworkName],
  );

  const toTokenItems: BridgePickerItem[] = useMemo(
    () =>
      (allTokens[toNetworkName] ?? []).map((t) => ({
        id: t.symbol,
        label: t.symbol,
        imgSrc: `/logos/${t.symbol.toLowerCase()}-logo.svg`,
        sub: t.name,
      })),
    [allTokens, toNetworkName],
  );

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

  const handleFromNetworkSelect = (name: string) => {
    onFromNetworkChange(name);
    onFromChange(null);
  };

  const handleToNetworkSelect = (name: string) => {
    onToNetworkChange(name);
    onToChange(null);
  };

  const handleFromTokenSelect = (symbol: string) => {
    const leg = buildTokenLeg(fromNetworkName, symbol, allTokens);
    if (!leg) return;
    onFromChange(leg);
    if (to && !isRouteSupported(leg, to)) onToChange(null);
  };

  const handleToTokenSelect = (symbol: string) => {
    const leg = buildTokenLeg(toNetworkName, symbol, allTokens);
    if (leg) onToChange(leg);
  };

  const cardCls =
    "space-y-3 rounded-2xl border border-gray-200 bg-gray-100 p-4 dark:border-white/5 dark:bg-surface-canvas";

  return (
    <div className="space-y-2">
      {/* Network route bar */}
      <div className="space-y-2 rounded-2xl border border-gray-200 bg-gray-100 p-4 dark:border-white/5 dark:bg-neutral-800/60">
        <p className="text-xs text-text-secondary dark:text-white/40">
          Select network route
        </p>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <BridgePicker
              title="Select source network"
              items={networkItems}
              selectedId={fromNetworkName}
              onSelect={handleFromNetworkSelect}
              menuWidth={260}
              trigger={({ isOpen, toggle }) => (
                <button
                  type="button"
                  onClick={toggle}
                  aria-expanded={isOpen}
                  className={classNames(chipButtonClass, "w-full")}
                >
                  {fromNetworkObj && (
                    <img
                      src={getNetworkImgSrc(fromNetworkObj)}
                      alt={fromNetworkName}
                      className="size-3.5 shrink-0 rounded-full"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  )}
                  <span className="min-w-0 truncate">{fromNetworkName}</span>
                  <BridgePickerChevron isOpen={isOpen} />
                </button>
              )}
            />
          </div>

          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-gray-400 dark:bg-neutral-700 dark:text-white/40">
            <ArrowRight03Icon className="size-4" />
          </div>

          <div className="min-w-0 flex-1">
            <BridgePicker
              title="Select destination network"
              items={networkItems}
              selectedId={toNetworkName}
              onSelect={handleToNetworkSelect}
              menuWidth={260}
              trigger={({ isOpen, toggle }) => (
                <button
                  type="button"
                  onClick={toggle}
                  aria-expanded={isOpen}
                  className={classNames(chipButtonClass, "w-full")}
                >
                  {toNetworkObj && (
                    <img
                      src={getNetworkImgSrc(toNetworkObj)}
                      alt={toNetworkName}
                      className="size-3.5 shrink-0 rounded-full"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  )}
                  <span className="min-w-0 truncate">{toNetworkName}</span>
                  <BridgePickerChevron isOpen={isOpen} />
                </button>
              )}
            />
          </div>
        </div>
      </div>

      {/* FROM label */}
      <div className="flex items-end justify-between px-1">
        <span className="text-xs text-text-secondary dark:text-white/40">From</span>
      </div>

      {/* FROM card */}
      <div className={cardCls}>
        <div className="flex items-center justify-between">
          <BridgePicker
            title="Select 'from' token"
            items={fromTokenItems}
            selectedId={from?.token}
            onSelect={handleFromTokenSelect}
            menuWidth={240}
            trigger={({ isOpen, toggle }) => (
              <button
                type="button"
                onClick={toggle}
                aria-expanded={isOpen}
                className={tokenPillClass}
              >
                {from?.token && (
                  <img
                    src={`/logos/${from.token.toLowerCase()}-logo.svg`}
                    alt={from.token}
                    className="size-5 rounded-full"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                )}
                <span>{from?.token || "Select token"}</span>
                <BridgePickerChevron isOpen={isOpen} />
              </button>
            )}
          />
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
            className="w-full min-w-0 bg-transparent text-3xl font-light text-gray-900 outline-none placeholder-gray-300 dark:text-white dark:placeholder-white/20"
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
                className="text-xs font-bold text-lavender-600 hover:underline dark:text-lavender-400"
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
          className="relative flex size-10 items-center justify-center rounded-full bg-gray-200 text-gray-500 transition-all hover:bg-gray-300 active:scale-95 dark:bg-neutral-700 dark:text-white/60 dark:hover:bg-neutral-600"
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
          <BridgePicker
            title="Select 'to' token"
            items={toTokenItems}
            selectedId={to?.token}
            onSelect={handleToTokenSelect}
            menuWidth={240}
            trigger={({ isOpen, toggle }) => (
              <button
                type="button"
                onClick={toggle}
                aria-expanded={isOpen}
                className={tokenPillClass}
              >
                {to?.token && (
                  <img
                    src={`/logos/${to.token.toLowerCase()}-logo.svg`}
                    alt={to.token}
                    className="size-5 rounded-full"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                )}
                <span>{to?.token || "Select token"}</span>
                <BridgePickerChevron isOpen={isOpen} />
              </button>
            )}
          />
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
