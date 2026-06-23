"use client";

import React, { useState, useMemo, useEffect } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useWalletAddress } from "@/app/hooks/useWalletAddress";
import { useNetwork } from "@/app/context/NetworksContext";
import { useStarknet } from "@/app/context/StarknetContext";
import { useTokens } from "@/app/context";
import { useBridgeQuote, useBridgeExecute, useBridgeStatus } from "@/app/hooks/bridge";
import { selectEngine, toRawAmount, isRouteSupported, bridgeFeeInReceivingToken } from "@/app/lib/bridge";
import type { BridgeLeg, BridgeEngine } from "@/app/lib/bridge";
import { BridgeRouteSelector } from "./BridgeRouteSelector";
import type { PickerTarget } from "./BridgeRouteSelector";
import { BridgeQuoteCard } from "./BridgeQuoteCard";
import { ArrowLeft02Icon, Cancel01Icon } from "hugeicons-react";
import { useDelegationContractAuth } from "@/app/hooks/useEIP7702Account";
import { primaryBtnClasses } from "../Styles";
import { classNames, getExplorerLink } from "@/app/utils";
import type { MobileSheetView } from "@/app/types";
import { saveTransaction } from "@/app/api/aggregator";
import { networks } from "@/app/mocks";
import Link from "next/link";

export interface BridgeSubmitInfo {
  savedTxId: string;
  engine: BridgeEngine;
  depositRefId: string;
}

interface BridgeFormProps {
  onClose: () => void;
  showBackButton?: boolean;
  setCurrentView?: React.Dispatch<React.SetStateAction<MobileSheetView>>;
  layout?: "modal" | "mobile";
  onBridgeSubmit?: (info: BridgeSubmitInfo) => void;
}

function getNetworkImgSrc(network: (typeof networks)[0]): string {
  return typeof network.imageUrl === "string"
    ? network.imageUrl
    : (network.imageUrl as { light: string; dark: string }).dark;
}

export const BridgeForm: React.FC<BridgeFormProps> = ({
  onClose,
  showBackButton = false,
  setCurrentView,
  onBridgeSubmit,
}) => {
  const { authenticated, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const walletAddress = useWalletAddress();
  const { selectedNetwork } = useNetwork();
  const starknet = useStarknet();
  const { allTokens } = useTokens();
  const { signDelegationAuthorization } = useDelegationContractAuth();

  const [step, setStep] = useState<"form" | "status" | "failed">("form");
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
  const [isQuoteExpired, setIsQuoteExpired] = useState(false);
  const [statusInfo, setStatusInfo] = useState<{
    txHash: string;
    depositRefId: string;
    engine: BridgeEngine;
    savedTxId: string | null;
  } | null>(null);
  const [from, setFrom] = useState<BridgeLeg | null>(null);
  const [to, setTo] = useState<BridgeLeg | null>(null);
  const [amount, setAmount] = useState("");
  const [fromNetworkName, setFromNetworkName] = useState(selectedNetwork.chain.name);
  const [toNetworkName, setToNetworkName] = useState(selectedNetwork.chain.name);

  // Picker overlay state — null means closed
  const [activePicker, setActivePicker] = useState<PickerTarget | null>(null);

  const fromNetworkObj = useMemo(
    () => networks.find((n) => n.chain.name === fromNetworkName) ?? selectedNetwork,
    [fromNetworkName, selectedNetwork],
  );

  const routeUnsupported =
    fromNetworkName === "Starknet" || toNetworkName === "Starknet";

  const engine = from && to ? selectEngine(from, to) : null;
  const slippageBps = parseInt(
    process.env.NEXT_PUBLIC_BRIDGE_DEFAULT_SLIPPAGE_BPS ?? "50",
    10,
  );

  const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");

  const evmAddress = embeddedWallet?.address ?? "";
  const starknetAddress = starknet.address ?? "";

  const { quote, isLoading: quoteLoading, error: quoteError } = useBridgeQuote({
    from,
    to,
    amount,
    evmAddress,
    starknetAddress,
    slippageBps,
    enabled: authenticated && !routeUnsupported && !!(evmAddress || starknetAddress),
    getAccessToken,
  });

  const { execute, isLoading: execLoading } = useBridgeExecute({
    selectedNetwork: fromNetworkObj,
    getAccessToken,
    starknetWallet: {
      walletId: starknet.walletId,
      publicKey: starknet.publicKey,
      address: starknet.address,
      deployed: starknet.deployed,
    },
    embeddedWallet: embeddedWallet
      ? {
          switchChain: embeddedWallet.switchChain.bind(embeddedWallet),
          getEthereumProvider: embeddedWallet.getEthereumProvider.bind(embeddedWallet),
          address: embeddedWallet.address,
        }
      : undefined,
    allTokens,
    signDelegationAuthorization,
  });

  // Reset expiry flag whenever a fresh quote arrives
  useEffect(() => { setIsQuoteExpired(false); }, [quote]);

  // Live status drives the on-screen result ONLY. Terminal-status DB writes are owned solely
  // by useBridgeStatusTracker (registered via onBridgeSubmit), which polls durably across modal
  // close — BridgeForm never writes here, to avoid the double-writer race we removed earlier.
  const { result: bridgeStatus } = useBridgeStatus({
    engine: statusInfo?.engine ?? null,
    refId: statusInfo?.depositRefId ?? null,
    enabled: step === "status" && !!statusInfo,
    getAccessToken,
  });
  const liveStatus = bridgeStatus?.status;
  const isDone = liveStatus === "SUCCESS";
  const isRefunded = liveStatus === "REFUNDED";
  const isFailed = liveStatus === "FAILED";
  const isTerminal = isDone || isRefunded || isFailed;

  // Prefer the destination-chain tx on success (where funds landed); otherwise the source tx.
  const explorerLink = statusInfo
    ? isDone && bridgeStatus?.destinationTxHash && to
      ? getExplorerLink(to.network, bridgeStatus.destinationTxHash)
      : from
        ? getExplorerLink(from.network, statusInfo.txHash)
        : ""
    : "";

  const timeEstimate =
    quote?.kind === "near-deposit" ? quote.timeEstimate : undefined;

  // ── Picker handlers ──────────────────────────────────────────────────────────

  const handlePickerSelect = (value: string) => {
    if (!activePicker) return;

    if (activePicker === "fromNet") {
      setFromNetworkName(value);
      setFrom(null);
    } else if (activePicker === "toNet") {
      setToNetworkName(value);
      setTo(null);
    } else if (activePicker === "fromToken") {
      const network = networks.find((n) => n.chain.name === fromNetworkName);
      const tokens = allTokens[fromNetworkName] ?? [];
      const t = tokens.find((tk) => tk.symbol === value);
      if (t && network) {
        const leg: BridgeLeg = {
          network: network.chain.name,
          chainId: network.chain.id,
          token: t.symbol,
          tokenAddress: t.address,
          decimals: t.decimals,
          amount: "0",
          rawAmount: "0",
        };
        setFrom(leg);
        if (to && !isRouteSupported(leg, to)) setTo(null);
      }
    } else if (activePicker === "toToken") {
      const network = networks.find((n) => n.chain.name === toNetworkName);
      const tokens = allTokens[toNetworkName] ?? [];
      const t = tokens.find((tk) => tk.symbol === value);
      if (t && network) {
        const leg: BridgeLeg = {
          network: network.chain.name,
          chainId: network.chain.id,
          token: t.symbol,
          tokenAddress: t.address,
          decimals: t.decimals,
          amount: "0",
          rawAmount: "0",
        };
        setTo(leg);
      }
    }

    setActivePicker(null);
  };

  // ── Execution ────────────────────────────────────────────────────────────────

  const handleConfirm = async () => {
    if (!quote || !from || !to) return;
    const parsedAmount = Number(amount);
    const rawAmount = toRawAmount(amount, from.decimals);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || rawAmount === "0") {
      setFailureMessage("Enter a valid amount for the selected token.");
      setStep("failed");
      return;
    }
    const fromWithAmount: BridgeLeg = {
      ...from,
      amount,
      rawAmount,
    };
    try {
      const { txHash, depositRefId } = await execute(quote, fromWithAmount);
      const resolvedEngine: BridgeEngine = quote.kind === "lifi-tx" ? "lifi" : "near";

      const accessToken = await getAccessToken();
      let savedTxId: string | null = null;
      if (accessToken && walletAddress) {
        const saved = await saveTransaction(
          {
            walletAddress,
            transactionType: "bridge",
            fromCurrency: from.token,
            toCurrency: to.token,
            amountSent: parsedAmount,
            amountReceived: parseFloat(quote.amountOut),
            // Fee consolidated to the receiving token (existing NUMERIC column, stored in to_currency).
            fee: bridgeFeeInReceivingToken(quote),
            recipient: {
              account_name: "Convert",
              institution: quote.kind === "lifi-tx" ? "LI.FI" : "NEAR Intents",
              account_identifier: txHash,
              // network is the source; persist the destination here (no schema change).
              to_network: to.network,
            },
            status: "pending",
            network: from.network,
            txHash,
            orderId: depositRefId,
          },
          accessToken,
        ).catch(() => null);
        savedTxId = saved?.data?.id ?? null;
      }

      setStatusInfo({ txHash, depositRefId, engine: resolvedEngine, savedTxId });
      setStep("status");

      // Notify parent to track status updates
      if (savedTxId) {
        onBridgeSubmit?.({
          savedTxId,
          engine: resolvedEngine,
          depositRefId,
        });
      }
    } catch (err) {
      setFailureMessage(err instanceof Error ? err.message : "Conversion failed");
      setStep("failed");
    }
  };

  const noRailAvailable =
    routeUnsupported ||
    (!quoteLoading &&
      !quoteError &&
      quote === null &&
      !!from &&
      !!to &&
      parseFloat(amount || "0") > 0);

  const canConfirm =
    !noRailAvailable &&
    !isQuoteExpired &&
    !!quote &&
    !quoteLoading &&
    !quoteError &&
    parseFloat(amount || "0") > 0 &&
    !!from &&
    !!to;

  // ── Picker overlay content ───────────────────────────────────────────────────

  const isNetworkPicker = activePicker === "fromNet" || activePicker === "toNet";
  const pickerItems = isNetworkPicker
    ? networks.map((n) => ({
        id: n.chain.name,
        label: n.chain.name,
        imgSrc: getNetworkImgSrc(n),
        sub: "",
      }))
    : (allTokens[activePicker === "fromToken" ? fromNetworkName : toNetworkName] ?? []).map(
        (t) => ({
          id: t.symbol,
          label: t.symbol,
          imgSrc: `/logos/${t.symbol.toLowerCase()}-logo.svg`,
          sub: t.name,
        }),
      );

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="relative flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {showBackButton && (
            <button
              type="button"
              onClick={() => setCurrentView?.("wallet")}
              className="flex size-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-all hover:bg-gray-200 active:scale-95 dark:bg-white/10 dark:text-white/60 dark:hover:bg-white/20 sm:hidden"
            >
              <ArrowLeft02Icon className="size-4" />
            </button>
          )}
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Convert</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex size-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-all hover:bg-gray-200 active:scale-95 dark:bg-white/10 dark:text-white/60 dark:hover:bg-white/20"
        >
          <Cancel01Icon className="size-4" />
        </button>
      </div>

      {!authenticated ? (
        <p className="text-sm text-gray-500 dark:text-white/50">
          Connect your wallet to convert tokens.
        </p>
      ) : (
        <>
          {step === "form" && (
            <>
              <BridgeRouteSelector
                from={from}
                to={to}
                amount={amount}
                fromNetworkName={fromNetworkName}
                toNetworkName={toNetworkName}
                onFromChange={setFrom}
                onToChange={setTo}
                onAmountChange={setAmount}
                onFromNetworkChange={setFromNetworkName}
                onToNetworkChange={setToNetworkName}
                onOpenPicker={setActivePicker}
                outputAmount={quote?.amountOut ?? undefined}
                engine={engine}
                timeEstimate={timeEstimate}
              />

              {noRailAvailable ? (
                <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30 p-3 text-sm text-amber-700 dark:text-amber-400">
                  No conversion rail is available for this route at this time.
                </div>
              ) : (
                <BridgeQuoteCard
                  quote={quote}
                  isLoading={quoteLoading}
                  error={quoteError}
                  engine={engine}
                  toToken={to?.token}
                  onExpire={() => setIsQuoteExpired(true)}
                />
              )}

              {canConfirm && (
                <>
                  <button
                    type="button"
                    disabled={execLoading}
                    onClick={handleConfirm}
                    className={classNames(primaryBtnClasses, "w-full")}
                  >
                    {execLoading ? "Converting…" : "Confirm"}
                  </button>
                  <p className="text-center text-xs text-gray-400 dark:text-white/30 -mt-3">
                    By clicking Confirm, you agree to the <Link href="/terms" className="text-lavender-600 dark:text-lavender-400 hover:underline">Terms of Use</Link>.
                  </p>
                </>
              )}
            </>
          )}

          {step === "failed" && (
            <div className="flex flex-col items-center gap-5 py-6 text-center">
              <div className="flex size-16 items-center justify-center rounded-full border-2 border-red-500">
                <svg
                  className="size-8 text-red-500"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </div>
              <div className="space-y-1.5">
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  Conversion failed
                </p>
                {failureMessage && (
                  <p className="max-w-sm text-sm break-words text-gray-500 dark:text-white/50">
                    {failureMessage}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setStep("form");
                  setFailureMessage(null);
                }}
                className={classNames(primaryBtnClasses, "w-full")}
              >
                Try again
              </button>
            </div>
          )}

          {step === "status" && (
            <div className="flex flex-col items-center gap-5 py-6 text-center">
              {isDone ? (
                <div className="flex size-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                  <svg
                    viewBox="0 0 24 24"
                    className="size-8 text-green-600 dark:text-green-400"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </div>
              ) : isRefunded ? (
                <div className="flex size-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                  <Cancel01Icon className="size-8 text-amber-600 dark:text-amber-400" />
                </div>
              ) : isFailed ? (
                <div className="flex size-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                  <Cancel01Icon className="size-8 text-red-600 dark:text-red-400" />
                </div>
              ) : (
                <div className="size-16 animate-spin rounded-full border-4 border-gray-200 border-t-blue-500 dark:border-gray-700 dark:border-t-blue-400" />
              )}
              <div className="space-y-1.5">
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {isDone
                    ? "Conversion complete"
                    : isRefunded
                      ? "Conversion refunded"
                      : isFailed
                        ? "Conversion failed"
                        : "Processing conversion..."}
                </p>
                <p className="text-sm text-gray-500 dark:text-white/50">
                  {isDone
                    ? "Your converted funds have arrived."
                    : isRefunded
                      ? "The conversion couldn't be completed, so your funds were refunded."
                      : isFailed
                        ? "The conversion failed. Any funds that left your wallet will be refunded."
                        : "Your transaction is being processed. You can close this window and track its progress in transaction history."}
                </p>
                {explorerLink && (
                  <a
                    href={explorerLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-sm font-medium text-lavender-600 dark:text-lavender-400 hover:underline"
                  >
                    View transaction
                  </a>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className={classNames(primaryBtnClasses, "w-full")}
              >
                {isTerminal ? "Close" : "Done"}
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Picker overlay — covers the entire BridgeForm ── */}
      {activePicker && (
        <div className="absolute inset-0 z-50 flex flex-col rounded-2xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-white/10 overflow-hidden">
          <div className="flex items-center gap-3 border-b border-gray-200 dark:border-white/10 p-4 shrink-0">
            <button
              type="button"
              onClick={() => setActivePicker(null)}
              className="flex size-8 items-center justify-center rounded-full bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-white/60 hover:bg-gray-200 dark:hover:bg-white/20 active:scale-95 transition-all"
            >
              <ArrowLeft02Icon className="size-4" />
            </button>
            <span className="font-semibold text-gray-900 dark:text-white">
              {isNetworkPicker ? "Select Network" : "Select Token"}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto py-1.5">
            {pickerItems.length === 0 ? (
              <p className="px-4 py-3 text-sm text-gray-400 dark:text-white/40">
                No options available for this network.
              </p>
            ) : (
              pickerItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handlePickerSelect(item.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-white/5 active:bg-gray-100 dark:active:bg-white/10 transition-colors"
                >
                  <img
                    src={item.imgSrc}
                    alt={item.label}
                    className="size-8 rounded-full shrink-0 bg-gray-100 dark:bg-white/10"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <div className="min-w-0">
                    <p className="font-semibold text-sm leading-tight">{item.label}</p>
                    {item.sub && (
                      <p className="text-xs text-gray-400 dark:text-white/40 truncate">
                        {item.sub}
                      </p>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
