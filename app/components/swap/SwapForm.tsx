"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { ArrowDataTransferVerticalIcon, Loading03Icon } from "hugeicons-react";
import { useWalletAddress } from "@/app/hooks/useWalletAddress";
import { useNetwork } from "@/app/context/NetworksContext";
import { useStarknet } from "@/app/context/StarknetContext";
import { useBalance, useTokens, useInjectedWallet } from "@/app/context";
import { useBridgeQuote, useBridgeExecute, useBridgeStatus } from "@/app/hooks/bridge";
import {
  engineFromQuote,
  toRawAmount,
  bridgeFeeInReceivingToken,
  bridgeInstitutionLabel,
} from "@/app/lib/bridge";
import type { BridgeLeg, BridgeEngine } from "@/app/lib/bridge";
import type { BridgeSubmitInfo } from "@/app/hooks/useBridgeStatusTracker";
import { useDelegationContractAuth } from "@/app/hooks/useEIP7702Account";
import {
  classNames,
  formatDecimalPrecision,
  formatTokenAmount,
  getExplorerLink,
} from "@/app/utils";
import { saveTransaction } from "@/app/api/aggregator";
import { networks } from "@/app/mocks";
import { mapReportAndAct } from "@/app/lib/toastMappedError";
import { tokensEqual } from "@/app/lib/token-symbol";
import { AnimatedModal } from "@/app/components/AnimatedComponents";
import { TransferPendingModal } from "@/app/components/transfer/TransferPendingModal";
import { drawerModalScrimClasses } from "@/app/components/drawer/drawerStyles";
import type { BridgePickerItem } from "@/app/components/bridge/BridgePicker";
import { SwapAmountCard } from "./SwapAmountCard";
import { SwapNetworkCard } from "./SwapNetworkCard";
import { SwapQuoteCard } from "./SwapQuoteCard";
import { SwapReviewContent } from "./SwapReviewContent";
import { SwapResultContent, type SwapResultRow } from "./SwapResultContent";
import {
  SWAP_COPY,
  buildSwapLeg,
  canSubmitSwap,
  noSwapRailAvailable,
  formatSwapRateLabel,
} from "./swapConfig";

export interface SwapFormProps {
  onClose: () => void;
  onBridgeSubmit?: (info: BridgeSubmitInfo) => void;
  /** Token-page entry: preselects the From token on the page's own network. */
  preferredTokenSymbol?: string;
  /** Home has a single same-network "Select network" card; the token page
   * has none — the network is fixed to the page's token. */
  showNetworkPicker: boolean;
  fromLabel: string;
  toLabel: string;
  ctaLabel: string;
  /** Home opens a centered Review modal before executing (frame 96); the
   * token page's "Swap" CTA executes directly — Figma draws no review step
   * for that entry point. */
  confirmBeforeSubmit: boolean;
  /** Home overlays Review/Swap-successful as centered modals above the
   * still-visible form (frame 96/98). The token page swaps its drawer body
   * for the result inline (frame 65). */
  successPresentation: "overlay" | "inline";
  /** Token page's inner "Swap" heading inside the drawer body (frame 59);
   * Home has none — the drawer title/subtitle already say so. */
  innerHeading?: string;
}

type SwapStep = "form" | "review" | "failed" | "status";

function buildResultRows(
  status: "success" | "refunded",
  timeSpentSeconds: number,
): SwapResultRow[] {
  return [
    {
      label: SWAP_COPY.transactionStatus,
      value: status === "success" ? SWAP_COPY.completed : "Refunded",
      valueClassName:
        status === "success"
          ? "text-[#227738] dark:text-[#39c65d]"
          : "text-text-accent-red dark:text-accent-red",
    },
    {
      label: SWAP_COPY.fundStatus,
      value: status === "success" ? SWAP_COPY.swapped : "Refunded to wallet",
    },
    {
      label: SWAP_COPY.timeSpent,
      value: `${timeSpentSeconds} second${timeSpentSeconds === 1 ? "" : "s"}`,
    },
  ];
}

/** Frame 65 receipt rows: Transaction fee (receiving token) and Date. */
function buildReceiptRows(
  info: { fee: number; toToken: string } | null,
  completedAt: Date | null,
): SwapResultRow[] {
  const rows: SwapResultRow[] = [];
  if (info) {
    rows.push({
      label: SWAP_COPY.transactionFee,
      value: `${info.fee} ${info.toToken}`,
    });
  }
  if (completedAt) {
    const date = completedAt.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const time = completedAt.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
    rows.push({ label: SWAP_COPY.date, value: `${date} · ${time}` });
  }
  return rows;
}

export const SwapForm: React.FC<SwapFormProps> = ({
  onClose,
  onBridgeSubmit,
  preferredTokenSymbol,
  showNetworkPicker,
  fromLabel,
  toLabel,
  ctaLabel,
  confirmBeforeSubmit,
  successPresentation,
  innerHeading,
}) => {
  const reviewTitleId = useId();
  const resultTitleId = useId();
  const { authenticated, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const {
    isInjectedWallet,
    injectedAddress,
    injectedReady,
    injectedProvider,
    getInjectedToken,
  } = useInjectedWallet();

  // Opening Swap is an explicit user action — establish the injected SIWE
  // session up front, the same way BridgeForm does, so quote polling can read
  // the token passively without ever popping a wallet prompt.
  useEffect(() => {
    if (isInjectedWallet && injectedReady) {
      void getInjectedToken({ interactive: true });
    }
  }, [isInjectedWallet, injectedReady, getInjectedToken]);

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
  const {
    refreshBalance,
    crossChainBalances,
    isLoading: isBalanceLoading,
  } = useBalance();

  const [step, setStep] = useState<SwapStep>("form");
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
  const [isQuoteExpired, setIsQuoteExpired] = useState(false);
  const [networkName, setNetworkName] = useState<string | null>(
    showNetworkPicker ? null : selectedNetwork.chain.name,
  );
  const [fromSymbol, setFromSymbol] = useState<string | null>(
    preferredTokenSymbol ?? (showNetworkPicker ? "USDT" : null),
  );
  const [toSymbol, setToSymbol] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [timeSpentSeconds, setTimeSpentSeconds] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [completedAt, setCompletedAt] = useState<Date | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const [resultInfo, setResultInfo] = useState<{
    txHash: string;
    depositRefId: string;
    engine: BridgeEngine;
    fromToken: string;
    toToken: string;
    amountSent: string;
    amountReceived: string;
    fee: number;
  } | null>(null);

  // Preselect the From token on the page's own (fixed) network — mirrors
  // BridgeForm's preferredTokenSymbol effect.
  useEffect(() => {
    if (!preferredTokenSymbol || fromSymbol || !networkName) return;
    const tokenList = allTokens[networkName] ?? [];
    const match = tokenList.find((t) => tokensEqual(t.symbol, preferredTokenSymbol));
    if (!match) return;
    setFromSymbol(match.symbol);
  }, [preferredTokenSymbol, fromSymbol, networkName, allTokens]);

  const from = useMemo(
    () => buildSwapLeg(networkName, fromSymbol, allTokens),
    [networkName, fromSymbol, allTokens],
  );
  const to = useMemo(
    () => buildSwapLeg(networkName, toSymbol, allTokens),
    [networkName, toSymbol, allTokens],
  );

  const networkObj = useMemo(
    () => networks.find((n) => n.chain.name === networkName) ?? selectedNetwork,
    [networkName, selectedNetwork],
  );

  const slippageBps = parseInt(
    process.env.NEXT_PUBLIC_BRIDGE_DEFAULT_SLIPPAGE_BPS ?? "50",
    10,
  );

  const tokenItems: BridgePickerItem[] = useMemo(
    () =>
      (allTokens[networkName ?? ""] ?? []).map((t) => ({
        id: t.symbol,
        label: t.symbol,
        imgSrc: `/logos/${t.symbol.toLowerCase()}-logo.svg`,
        sub: t.name,
      })),
    [allTokens, networkName],
  );

  const fromBalanceEntry = useMemo(() => {
    if (!from) return null;
    return crossChainBalances.find((b) => b.network.chain.name === from.network);
  }, [from, crossChainBalances]);

  const isFromBalanceKnown = useMemo(() => {
    if (!from) return false;
    if (isBalanceLoading) return false;
    return fromBalanceEntry !== undefined;
  }, [from, fromBalanceEntry, isBalanceLoading]);

  const fromBalance = useMemo(() => {
    if (!from || !fromBalanceEntry) return 0;
    const key = from.token.toUpperCase();
    return (
      fromBalanceEntry.balances.rawBalances?.[key] ??
      fromBalanceEntry.balances.rawBalances?.[from.token] ??
      fromBalanceEntry.balances.balances[key] ??
      fromBalanceEntry.balances.balances[from.token] ??
      0
    );
  }, [from, fromBalanceEntry]);

  const parsedAmount = Number(amount);
  const hasInsufficientBalance =
    isFromBalanceKnown &&
    !!from &&
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0 &&
    parsedAmount > fromBalance;

  const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");
  const evmAddress = isInjectedWallet
    ? injectedReady
      ? injectedAddress ?? ""
      : ""
    : embeddedWallet?.address ?? "";
  const starknetAddress = starknet.address ?? "";

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
    enabled:
      (authenticated || (isInjectedWallet && injectedReady)) &&
      !!(evmAddress || starknetAddress) &&
      !hasInsufficientBalance,
    getAccessToken,
    getInjectedToken:
      isInjectedWallet && injectedReady ? getInjectedTokenPassive : undefined,
  });

  useEffect(() => {
    setIsQuoteExpired(false);
  }, [quote]);

  const { execute } = useBridgeExecute({
    selectedNetwork: networkObj,
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

  const { result: bridgeStatus } = useBridgeStatus({
    engine: resultInfo?.engine ?? null,
    refId: resultInfo?.depositRefId ?? null,
    enabled: step === "status" && !!resultInfo,
    getAccessToken,
    getInjectedToken:
      isInjectedWallet && injectedReady ? getInjectedTokenPassive : undefined,
  });
  const liveStatus = bridgeStatus?.status;
  const isDone = liveStatus === "SUCCESS";
  const isRefunded = liveStatus === "REFUNDED";
  const isStatusFailed = liveStatus === "FAILED";
  const isTerminal = isDone || isRefunded || isStatusFailed;

  useEffect(() => {
    if (!isTerminal) return;
    const startedAt = startedAtRef.current;
    setCompletedAt(new Date());
    setTimeSpentSeconds(
      startedAt ? Math.max(0, Math.round((Date.now() - startedAt) / 1000)) : 0,
    );
  }, [isTerminal]);

  // Elapsed UI timer for the processing screen — display only, same as Transfer.
  useEffect(() => {
    if (step !== "status" || isTerminal) return;
    const tick = () => {
      const startedAt = startedAtRef.current;
      setElapsedSeconds(
        startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0,
      );
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [step, isTerminal]);

  const explorerLink = resultInfo
    ? isDone && bridgeStatus?.destinationTxHash && to
      ? getExplorerLink(to.network, bridgeStatus.destinationTxHash)
      : from
        ? getExplorerLink(from.network, resultInfo.txHash)
        : ""
    : "";

  const rateLabel = formatSwapRateLabel(
    from?.token,
    to?.token,
    amount,
    quote?.amountOut ?? "",
  );

  const noRailAvailable = noSwapRailAvailable({
    from,
    to,
    parsedAmount,
    quote,
    quoteFetched,
    quoteLoading,
    quoteError,
    hasInsufficientBalance,
  });

  const canConfirm = canSubmitSwap({
    from,
    to,
    parsedAmount,
    quote,
    quoteLoading,
    quoteError,
    isQuoteExpired,
    hasInsufficientBalance,
  });

  const resetToForm = () => {
    setStep("form");
    setFailureMessage(null);
    setIsFinalizing(false);
  };

  const handleNetworkSelect = (name: string) => {
    setNetworkName(name);
    const tokenList = allTokens[name] ?? [];
    setFromSymbol((prev) => {
      if (prev && tokenList.some((tok) => tokensEqual(tok.symbol, prev))) {
        return prev;
      }
      const usdt = tokenList.find((tok) => tokensEqual(tok.symbol, "USDT"));
      return usdt?.symbol ?? null;
    });
    setToSymbol(null);
    setAmount("");
  };

  const handleFlip = () => {
    setFromSymbol(toSymbol);
    setToSymbol(fromSymbol);
    setAmount("");
  };

  const handleMax = () => {
    if (fromBalance > 0) {
      setAmount(String(formatDecimalPrecision(fromBalance, 6)));
    }
  };

  const handleConfirm = async () => {
    if (!quote || !from || !to) return;
    const rawAmount = toRawAmount(amount, from.decimals);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || rawAmount === "0") {
      setFailureMessage("Enter a valid amount for the selected token.");
      setStep("failed");
      return;
    }
    const fromWithAmount: BridgeLeg = { ...from, amount, rawAmount };
    try {
      setIsFinalizing(true);
      startedAtRef.current = Date.now();
      setElapsedSeconds(0);
      setStep("status");
      const { txHash, depositRefId } = await execute(quote, fromWithAmount);
      const resolvedEngine = engineFromQuote(quote);

      const accessToken = isInjectedWallet ? null : await getAccessToken();
      const injectedToken = isInjectedWallet
        ? await getInjectedToken({ interactive: true })
        : null;
      if ((accessToken || injectedToken) && walletAddress) {
        await saveTransaction(
          {
            walletAddress,
            transactionType: "bridge",
            fromCurrency: from.token,
            toCurrency: to.token,
            amountSent: parsedAmount,
            amountReceived: parseFloat(quote.amountOut),
            fee: bridgeFeeInReceivingToken(quote),
            recipient: {
              account_name: "Swap",
              institution: bridgeInstitutionLabel(quote),
              account_identifier: txHash,
              to_network: to.network,
            },
            status: "pending",
            network: from.network,
            txHash,
            orderId: depositRefId,
          },
          accessToken,
          injectedToken,
        )
          .then((saved) => {
            if (saved?.data?.id) {
              onBridgeSubmit?.({
                savedTxId: saved.data.id,
                engine: resolvedEngine,
                depositRefId,
              });
            }
          })
          .catch(() => null);
      }

      setResultInfo({
        txHash,
        depositRefId,
        engine: resolvedEngine,
        fromToken: from.token,
        toToken: to.token,
        amountSent: amount,
        amountReceived: quote.amountOut,
        fee: bridgeFeeInReceivingToken(quote),
      });
      setStep("status");
    } catch (err) {
      mapReportAndAct(err, {
        feature: "swap",
        onUserMessage: (message) => setFailureMessage(message),
      });
      setIsFinalizing(false);
      refreshBalance();
      setStep("failed");
    }
  };

  const handleCtaClick = () => {
    if (!canConfirm) return;
    if (confirmBeforeSubmit) {
      setStep("review");
    } else {
      void handleConfirm();
    }
  };

  const handleResultDone = () => {
    refreshBalance();
    resetToForm();
    setAmount("");
    onClose();
  };

  const showQuoteCard =
    !!quote && !!to && !quoteLoading && !hasInsufficientBalance && !quoteError;

  const formBody = (
    <div
      className={classNames("flex w-full flex-col", showNetworkPicker ? "gap-3" : "gap-2")}
      data-testid="swap-form-body"
    >
      {/* Frame 1000003092: one 20px-radius shell holding the (token-page)
          heading, From/to cards, flip control and (Home) network card. */}
      <div className="relative flex w-full flex-col gap-2 rounded-[20px] bg-background-neutral p-2 dark:bg-white/[0.05]">
        {innerHeading ? (
          <div className="flex w-full items-center gap-1.5 pl-2 pr-1">
            <h3 className="whitespace-nowrap font-general-sans text-base font-semibold leading-6 text-black dark:text-white">
              {innerHeading}
            </h3>
          </div>
        ) : null}

        <SwapAmountCard
          testId="swap-from-card"
          label={fromLabel}
          tokenItems={tokenItems}
          selectedSymbol={fromSymbol ?? from?.token}
          onSelectToken={(symbol) => setFromSymbol(symbol)}
          amount={amount}
          onAmountChange={setAmount}
          balanceLabel={
            fromSymbol
              ? isFromBalanceKnown
                ? `${formatTokenAmount(fromBalance)} ${fromSymbol}`
                : undefined
              : undefined
          }
          onMax={handleMax}
          hasError={hasInsufficientBalance}
          variant={showNetworkPicker ? "home" : "token"}
        />

        <SwapAmountCard
          testId="swap-to-card"
          label={toLabel}
          tokenItems={tokenItems}
          selectedSymbol={to?.token}
          onSelectToken={(symbol) => setToSymbol(symbol)}
          displayAmount={quote?.amountOut}
          variant={showNetworkPicker ? "home" : "token"}
        />

        <button
          type="button"
          onClick={handleFlip}
          disabled={quoteLoading}
          aria-label={quoteLoading ? "Loading quote" : "Flip from and to tokens"}
          aria-busy={quoteLoading}
          className={classNames(
            "absolute left-[calc(50%-1px)] top-[130px] z-10 flex size-6 -translate-x-1/2 items-center justify-center rounded-lg border-4 border-background-neutral bg-white p-0.5 dark:border-[#202020] dark:bg-surface-canvas",
            quoteLoading
              ? "cursor-wait"
              : "transition-transform hover:scale-105 active:scale-95",
          )}
        >
          {quoteLoading ? (
            <Loading03Icon
              className="size-5 shrink-0 animate-spin text-icon-outline-secondary motion-reduce:animate-none dark:text-white/50"
              strokeWidth={1.5}
              aria-hidden
            />
          ) : (
            <ArrowDataTransferVerticalIcon
              className="size-5 shrink-0 text-icon-outline-secondary dark:text-white/50"
              strokeWidth={1.5}
              aria-hidden
            />
          )}
        </button>

        {showNetworkPicker ? (
          <SwapNetworkCard
            selectedNetworkName={networkName}
            onSelect={handleNetworkSelect}
          />
        ) : null}
      </div>

      {hasInsufficientBalance ? (
        <div className="rounded-xl border border-red-100 bg-red-50 p-3 font-general-sans text-sm text-red-600 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-400">
          Insufficient balance
        </div>
      ) : null}

      {noRailAvailable ? (
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 font-general-sans text-sm text-amber-700 dark:border-amber-900/30 dark:bg-amber-900/20 dark:text-amber-400">
          {SWAP_COPY.noRail}
        </div>
      ) : null}

      {showQuoteCard && quote && to ? (
        <SwapQuoteCard
          rateLabel={rateLabel ?? ""}
          receiveLabel={`${formatTokenAmount(quote.amountOut)} ${to.token}`}
          feeLabel={`${bridgeFeeInReceivingToken(quote)} ${to.token}`}
        />
      ) : null}

      <div className={classNames("flex w-full flex-col", showNetworkPicker ? "gap-5" : "gap-2")}>
        <button
          type="button"
          data-testid="swap-submit-cta"
          disabled={!canConfirm}
          onClick={handleCtaClick}
          className={classNames(
            "flex h-11 w-full items-center justify-center rounded-xl px-3 py-2.5 font-general-sans text-sm font-medium leading-5 tracking-[-0.14px] text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-500",
            "bg-lavender-500 hover:bg-lavender-600 disabled:cursor-not-allowed disabled:bg-border-input disabled:text-white dark:disabled:bg-[#2e2e2e] dark:disabled:text-white/50",
          )}
        >
          {ctaLabel}
        </button>

        {/* btmSec: two 4px-padded tags joined by a 0.3px fading rule. */}
        <div className="flex w-full items-center gap-1 overflow-hidden py-2 font-general-sans text-xs font-normal leading-4 text-text-disabled dark:text-white/30">
          <span className="shrink-0 whitespace-nowrap py-1">{rateLabel ?? ""}</span>
          <span
            aria-hidden
            className="h-[0.3px] min-w-px flex-1 bg-gradient-to-r from-transparent to-border-light dark:to-white/10"
          />
          <span className="shrink-0 whitespace-nowrap py-1 pl-1">{SWAP_COPY.etaFallback}</span>
        </div>
      </div>
    </div>
  );

  const isPending = step === "status" && !isTerminal;
  const pendingFromSymbol = resultInfo?.fromToken ?? from?.token ?? "";
  const pendingToSymbol = resultInfo?.toToken ?? to?.token ?? "";
  const pendingFromAmount = resultInfo?.amountSent ?? amount;
  const pendingToAmount = resultInfo?.amountReceived ?? quote?.amountOut ?? "";

  const pendingModal = (
    <TransferPendingModal
      isOpen={isPending}
      onClose={resetToForm}
      amountLabel={pendingFromAmount ? formatTokenAmount(pendingFromAmount) : ""}
      tokenSymbol={pendingFromSymbol}
      tokenImageUrl={
        pendingFromSymbol
          ? `/logos/${pendingFromSymbol.toLowerCase()}-logo.svg`
          : undefined
      }
      shortAddress={
        pendingToSymbol
          ? pendingToAmount
            ? `${formatTokenAmount(pendingToAmount)} ${pendingToSymbol}`
            : pendingToSymbol
          : ""
      }
      destinationImageUrl={
        pendingToSymbol
          ? `/logos/${pendingToSymbol.toLowerCase()}-logo.svg`
          : undefined
      }
      elapsedSeconds={elapsedSeconds}
      title={SWAP_COPY.pendingTitle}
      note={SWAP_COPY.pendingNote}
      testId="swap-pending-content"
    />
  );

  const failedBody = (
    <SwapResultContent
      titleId={resultTitleId}
      status="failed"
      title={SWAP_COPY.failedTitle}
      fromSymbol={from?.token ?? ""}
      fromAmount={amount}
      toSymbol={to?.token ?? ""}
      toAmount={resultInfo?.amountReceived ?? ""}
      rows={[]}
      failureMessage={failureMessage}
      onPrimary={resetToForm}
      primaryLabel={SWAP_COPY.tryAgain}
      presentation={successPresentation}
    />
  );

  const statusFailedBody = (
    <SwapResultContent
      titleId={resultTitleId}
      status="failed"
      title={SWAP_COPY.failedTitle}
      fromSymbol={resultInfo?.fromToken ?? ""}
      fromAmount={resultInfo?.amountSent ?? ""}
      toSymbol={resultInfo?.toToken ?? ""}
      toAmount={resultInfo?.amountReceived ?? ""}
      rows={[]}
      failureMessage={
        isRefunded
          ? "The swap couldn't be completed, so your funds were refunded."
          : "The swap failed. Any funds that left your wallet will be refunded."
      }
      explorerLink={explorerLink || undefined}
      onPrimary={handleResultDone}
      primaryLabel={SWAP_COPY.done}
      presentation={successPresentation}
    />
  );

  const successBody = (
    <SwapResultContent
      titleId={resultTitleId}
      status="success"
      title={successPresentation === "overlay" ? SWAP_COPY.successTitle : SWAP_COPY.completeTitle}
      fromSymbol={resultInfo?.fromToken ?? ""}
      fromAmount={resultInfo?.amountSent ?? ""}
      toSymbol={resultInfo?.toToken ?? ""}
      toAmount={resultInfo?.amountReceived ?? ""}
      rows={
        successPresentation === "overlay"
          ? buildResultRows("success", timeSpentSeconds)
          : buildReceiptRows(resultInfo, completedAt)
      }
      explorerLink={explorerLink || undefined}
      onPrimary={handleResultDone}
      primaryLabel={successPresentation === "overlay" ? SWAP_COPY.close : SWAP_COPY.done}
      presentation={successPresentation}
    />
  );

  const statusBody = isDone ? successBody : statusFailedBody;

  if (successPresentation === "inline") {
    if (step === "failed") return failedBody;
    if (step === "status" && isTerminal) return statusBody;
    return (
      <>
        {formBody}
        {pendingModal}
      </>
    );
  }

  // Overlay presentation (Home): the filled form always stays visible behind
  // the dimmed Review / result modals (frame 96/98).
  return (
    <>
      {formBody}

      <AnimatedModal
        isOpen={step === "review"}
        onClose={resetToForm}
        maxWidth="385px"
        dialogPanelClassName="!bg-transparent !shadow-none"
        contentClassName="!rounded-[32px] !border !border-border-light !bg-white !p-5 !shadow-2xl dark:!border-white/10 dark:!bg-[#2b2b2b]"
        ariaLabelledBy={reviewTitleId}
        scrimClassName={drawerModalScrimClasses}
      >
        <SwapReviewContent
          titleId={reviewTitleId}
          onClose={resetToForm}
          onConfirm={() => void handleConfirm()}
          fromSymbol={from?.token ?? ""}
          fromAmount={amount}
          toSymbol={to?.token ?? ""}
          toAmount={quote?.amountOut ?? ""}
          feeLabel={
            quote ? `${bridgeFeeInReceivingToken(quote)} ${to?.token ?? ""}` : "—"
          }
          isSubmitting={isFinalizing}
        />
      </AnimatedModal>

      {pendingModal}

      <AnimatedModal
        isOpen={step === "failed" || (step === "status" && isTerminal)}
        onClose={step === "failed" ? resetToForm : handleResultDone}
        maxWidth="394px"
        dialogPanelClassName="!bg-transparent !shadow-none"
        contentClassName="!rounded-[32px] !border !border-border-light !bg-white !px-5 !pb-5 !pt-[34px] !shadow-2xl dark:!border-white/10 dark:!bg-[#2b2b2b]"
        ariaLabelledBy={resultTitleId}
        scrimClassName={drawerModalScrimClasses}
      >
        {step === "failed" ? failedBody : statusBody}
      </AnimatedModal>
    </>
  );
};
