"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useWalletAddress } from "@/app/hooks/useWalletAddress";
import { useNetwork } from "@/app/context/NetworksContext";
import { useStarknet } from "@/app/context/StarknetContext";
import { useBalance, useTokens, useInjectedWallet } from "@/app/context";
import { useBridgeQuote, useBridgeExecute, useBridgeStatus } from "@/app/hooks/bridge";
import { selectEngine, toRawAmount, bridgeFeeInReceivingToken } from "@/app/lib/bridge";
import type { BridgeLeg, BridgeEngine } from "@/app/lib/bridge";
import { BridgeRouteSelector } from "./BridgeRouteSelector";
import { BridgeQuoteCard } from "./BridgeQuoteCard";
import {
  ArrowLeft02Icon,
  ArrowRight03Icon,
  Cancel01Icon,
  InformationSquareIcon,
  SadDizzyIcon,
} from "hugeicons-react";
import { useDelegationContractAuth } from "@/app/hooks/useEIP7702Account";
import { primaryBtnClasses, outlineBtnClasses } from "../Styles";
import { classNames, formatTokenAmount, getExplorerLink } from "@/app/utils";
import type { MobileSheetView } from "@/app/types";
import { saveTransaction } from "@/app/api/aggregator";
import { networks } from "@/app/mocks";
import Link from "next/link";
import { mapReportAndAct } from "@/app/lib/toastMappedError";
import { format } from "date-fns";

const CONVERSION_FAILED_MESSAGE = "Please try again.";

export interface BridgeSubmitInfo {
  savedTxId: string;
  engine: BridgeEngine;
  depositRefId: string;
}

interface BridgeFormProps {
  onClose: () => void;
  setCurrentView?: React.Dispatch<React.SetStateAction<MobileSheetView>>;
  layout?: "modal" | "mobile";
  onBridgeSubmit?: (info: BridgeSubmitInfo) => void;
}

export const BridgeForm: React.FC<BridgeFormProps> = ({
  onClose,
  setCurrentView,
  onBridgeSubmit,
}) => {
  const { authenticated, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const {
    isInjectedWallet,
    injectedAddress,
    injectedReady,
    injectedProvider,
    getInjectedToken,
  } = useInjectedWallet();

  // Opening Convert is an explicit user action — establish the injected SIWE
  // session up front (one signature, cached ~1h) so quote/status polling can
  // read the token passively without ever popping a wallet prompt themselves.
  useEffect(() => {
    if (isInjectedWallet && injectedReady) {
      void getInjectedToken({ interactive: true });
    }
  }, [isInjectedWallet, injectedReady, getInjectedToken]);

  // Passive getter for polling hooks; interactive one for user-action paths.
  const getInjectedTokenPassive = useCallback(
    () => getInjectedToken({ interactive: false }),
    [getInjectedToken],
  );
  const getInjectedTokenInteractive = useCallback(
    () => getInjectedToken({ interactive: true }),
    [getInjectedToken],
  );
  const walletAddress = useWalletAddress();
  const { selectedNetwork } = useNetwork();
  const starknet = useStarknet();
  const { allTokens } = useTokens();
  const { signDelegationAuthorization } = useDelegationContractAuth();
  const { refreshBalance } = useBalance();
  const [step, setStep] = useState<"form" | "status" | "failed">("form");
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
  const [isQuoteExpired, setIsQuoteExpired] = useState(false);
  const [statusInfo, setStatusInfo] = useState<{
    txHash: string;
    depositRefId: string;
    engine: BridgeEngine;
    savedTxId: string | null;
    fromToken: string;
    fromNetwork: string;
    toToken: string;
    toNetwork: string;
    amountSent: string;
    amountReceived: string;
    fee: number;
    timestamp: number;
  } | null>(null);
  const [from, setFrom] = useState<BridgeLeg | null>(null);
  const [to, setTo] = useState<BridgeLeg | null>(null);
  const [amount, setAmount] = useState("");
  const [fromNetworkName, setFromNetworkName] = useState(selectedNetwork.chain.name);
  const [toNetworkName, setToNetworkName] = useState(selectedNetwork.chain.name);

  const fromNetworkObj = useMemo(
    () => networks.find((n) => n.chain.name === fromNetworkName) ?? selectedNetwork,
    [fromNetworkName, selectedNetwork],
  );

  const routeUnsupported =
    fromNetworkName === "Starknet" || toNetworkName === "Starknet";

  const slippageBps = parseInt(
    process.env.NEXT_PUBLIC_BRIDGE_DEFAULT_SLIPPAGE_BPS ?? "50",
    10,
  );

  const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");

  // Support both Privy embedded wallet and injected wallet
  const evmAddress = isInjectedWallet
    ? (injectedReady ? injectedAddress ?? "" : "")
    : (embeddedWallet?.address ?? "");

  const starknetAddress = starknet.address ?? "";

  // Create adapter for injected wallet to match EmbeddedWalletLike interface
  const walletAdapter = useMemo(() => {
    if (isInjectedWallet && injectedReady && injectedAddress && injectedProvider) {
      return {
        switchChain: async (chainId: number) => {
          const chainIdHex = `0x${chainId.toString(16)}`;
          await injectedProvider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: chainIdHex }],
          });
        },
        getEthereumProvider: async () => injectedProvider,
        address: injectedAddress,
      };
    }
    if (embeddedWallet) {
      return {
        switchChain: embeddedWallet.switchChain.bind(embeddedWallet),
        getEthereumProvider: embeddedWallet.getEthereumProvider.bind(embeddedWallet),
        address: embeddedWallet.address,
      };
    }
    return undefined;
  }, [isInjectedWallet, injectedReady, injectedAddress, injectedProvider, embeddedWallet]);

  const {
    quote,
    isLoading: quoteLoading,
    isFetched: quoteFetched,
    error: quoteError,
  } = useBridgeQuote({
    from,
    to,
    amount,
    evmAddress,
    starknetAddress,
    slippageBps,
    enabled: (authenticated || (isInjectedWallet && injectedReady)) && !routeUnsupported && !!(evmAddress || starknetAddress),
    getAccessToken,
    getInjectedToken:
      isInjectedWallet && injectedReady ? getInjectedTokenPassive : undefined,
  });

  // Which rail actually served the quote. Predicted from the pair while one is in flight;
  // once a quote lands it is the source of truth, because a NEAR pair with no solver
  // inventory (USDT on Base, any Lisk/Celo leg) falls back to LI.FI inside useBridgeQuote.
  const engine: BridgeEngine | null = quote
    ? quote.kind === "lifi-tx"
      ? "lifi"
      : "near"
    : from && to
      ? selectEngine(from, to)
      : null;

  const { execute, isLoading: execLoading } = useBridgeExecute({
    selectedNetwork: fromNetworkObj,
    getAccessToken,
    starknetWallet: {
      walletId: starknet.walletId,
      publicKey: starknet.publicKey,
      address: starknet.address,
      deployed: starknet.deployed,
    },
    embeddedWallet: walletAdapter,
    allTokens,
    signDelegationAuthorization,
    isInjectedWallet: isInjectedWallet && injectedReady,
    injectedProvider: isInjectedWallet && injectedReady ? injectedProvider : null,
    injectedAddress: isInjectedWallet && injectedReady ? injectedAddress : null,
    getInjectedToken:
      isInjectedWallet && injectedReady ? getInjectedTokenInteractive : undefined,
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
    getInjectedToken:
      isInjectedWallet && injectedReady ? getInjectedTokenPassive : undefined,
  });
  const liveStatus = bridgeStatus?.status;
  const isDone = liveStatus === "SUCCESS";
  const isRefunded = liveStatus === "REFUNDED";
  const isFailed = liveStatus === "FAILED";

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
      setIsFinalizing(true);
      const { txHash, depositRefId } = await execute(quote, fromWithAmount);
      const resolvedEngine: BridgeEngine = quote.kind === "lifi-tx" ? "lifi" : "near";

      // Injected wallets authenticate saves via the x-injected-token session
      // JWT (interactive: the user just executed a convert, so a re-prompt on
      // an expired session is fine); Privy wallets via the Bearer token.
      const accessToken = isInjectedWallet ? null : await getAccessToken();
      const injectedToken = isInjectedWallet
        ? await getInjectedToken({ interactive: true })
        : null;
      let savedTxId: string | null = null;
      if ((accessToken || injectedToken) && walletAddress) {
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
          injectedToken,
        ).catch(() => null);
        savedTxId = saved?.data?.id ?? null;
      }

      setStatusInfo({
        txHash,
        depositRefId,
        engine: resolvedEngine,
        savedTxId,
        fromToken: from.token,
        fromNetwork: from.network,
        toToken: to.token,
        toNetwork: to.network,
        amountSent: amount,
        amountReceived: quote.amountOut,
        fee: bridgeFeeInReceivingToken(quote),
        timestamp: Date.now(),
      });
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
      mapReportAndAct(err, {
        feature: "bridge-convert",
        onUserMessage: (message) => {
          setFailureMessage(message);
        },
      });
      setIsFinalizing(false);
      refreshBalance();
      setStep("failed");
    }
  };

  // Only a quote attempt that actually ran and came back empty means no rail. A query that
  // never ran (unauthenticated, wallet address not ready) leaves `quote` null too, and
  // treating that as a dead route showed this error to every user before they connected.
  const noRailAvailable =
    routeUnsupported ||
    (quoteFetched &&
      !quoteLoading &&
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

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="relative flex flex-col gap-5">
      {/* Header — centered title, back arrow only on the form step, never a close icon.
          Same on desktop and mobile: on desktop there's no view stack to go "back" to, so the
          arrow just closes the modal instead. */}
      <div className="flex items-center justify-between">
        <div className="flex size-8 shrink-0 items-center justify-center">
          {step === "form" && (
            <button
              type="button"
              onClick={() => (setCurrentView ? setCurrentView("wallet") : onClose())}
              className="flex size-8 items-center justify-center  text-gray-500 transition-all active:scale-95 dark:text-white/60 "
            >
              <ArrowLeft02Icon className="size-5" strokeWidth={1.5} />
            </button>
          )}
        </div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Convert</h2>
        <div className="size-8 shrink-0" />
      </div>

      {!authenticated && !(isInjectedWallet && injectedReady) ? (
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
                outputAmount={quote?.amountOut ?? undefined}
                engine={engine}
                timeEstimate={timeEstimate}
                isQuoteLoading={quoteLoading}
              />

              {fromNetworkName !== toNetworkName && (
                <div className="flex items-start gap-2 rounded-[24px] border border-gray-200 bg-gray-100 p-3 text-sm text-text-secondary dark:border-white/5 dark:bg-neutral-800/60 dark:text-white/50">
                  <InformationSquareIcon className="mt-0.5 size-5 shrink-0" strokeWidth={1.5} />
                  <span>
                    Funds route through {fromNetworkName} to {toNetworkName} and
                    may take a few minutes longer.
                  </span>
                </div>
              )}

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
                    disabled={execLoading || isFinalizing}
                    onClick={handleConfirm}
                    className={classNames(primaryBtnClasses, "w-full")}
                  >
                    {execLoading || isFinalizing ? "Confirming…" : "Confirm"}
                  </button>
                  <p className="text-center text-xs text-gray-400 dark:text-white/30 -mt-3">
                    By clicking Confirm, you agree to the <Link target="_blank" rel="noopener noreferrer" href="/terms" className="text-lavender-600 dark:text-lavender-400 hover:underline">Terms of Use</Link>.
                  </p>
                </>
              )}
            </>
          )}

          {step === "failed" && (
            <div className="flex flex-col items-center gap-5 py-6 text-center">
              <div className="flex size-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <SadDizzyIcon className="size-8 text-red-500 dark:text-red-400" />
              </div>
              <div className="space-y-1.5">
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  Conversion failed
                </p>
                <p className="max-w-sm text-sm text-gray-500 dark:text-white/50">
                  {failureMessage ?? CONVERSION_FAILED_MESSAGE}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStep("form");
                  setFailureMessage(null);
                  setIsFinalizing(false);
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
                  <SadDizzyIcon className="size-8 text-red-500 dark:text-red-400" />
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
                {!isDone && explorerLink && (
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

              {isDone && statusInfo && (
                <div className="w-full space-y-3 rounded-2xl border border-gray-200 bg-gray-100 p-4 text-left dark:border-white/5 dark:bg-neutral-800/60">
                  <div className="flex items-center gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <img
                        src={`/logos/${statusInfo.fromToken.toLowerCase()}-logo.svg`}
                        alt={statusInfo.fromToken}
                        className="size-6 shrink-0 rounded-full"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                          {formatTokenAmount(statusInfo.amountSent)}{" "}
                          {statusInfo.fromToken}
                        </p>
                        <p className="truncate text-xs text-gray-400 dark:text-white/40">
                          {statusInfo.fromNetwork}
                        </p>
                      </div>
                    </div>
                    <ArrowRight03Icon className="size-4 shrink-0 text-gray-400 dark:text-white/40" />
                    <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
                      <div className="min-w-0 text-right">
                        <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                          {formatTokenAmount(statusInfo.amountReceived)}{" "}
                          {statusInfo.toToken}
                        </p>
                        <p className="truncate text-xs text-gray-400 dark:text-white/40">
                          {statusInfo.toNetwork}
                        </p>
                      </div>
                      <img
                        src={`/logos/${statusInfo.toToken.toLowerCase()}-logo.svg`}
                        alt={statusInfo.toToken}
                        className="size-6 shrink-0 rounded-full"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>
                  </div>
                  <div className="space-y-2 border-t border-gray-200 pt-3 dark:border-white/10">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500 dark:text-white/50">
                        Transaction fee
                      </span>
                      <span className="text-gray-700 dark:text-white/70">
                        {formatTokenAmount(statusInfo.fee)} {statusInfo.toToken}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500 dark:text-white/50">Date</span>
                      <span className="text-gray-700 dark:text-white/70">
                        {format(new Date(statusInfo.timestamp), "MMM d, yyyy '·' h:mm a")}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {isDone && explorerLink ? (
                <div className="flex w-full gap-3">
                  <a
                    href={explorerLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={classNames(outlineBtnClasses, "flex-1")}
                  >
                    View on explorer
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      refreshBalance();
                      onClose();
                    }}
                    className={classNames(primaryBtnClasses, "flex-1")}
                  >
                    Done
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    refreshBalance();
                    onClose();
                  }}
                  className={classNames(primaryBtnClasses, "w-full")}
                >
                  {isDone ? "Done" : "Close"}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
