"use client";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useTheme } from "next-themes";
import { useEffect, useState, useRef } from "react";
import { ImSpinner } from "react-icons/im";
import { Checkbox } from "@headlessui/react";

import { secondaryBtnClasses } from "../components/Styles";
import {
  FarcasterIconDarkTheme,
  FarcasterIconLightTheme,
  QuotesBgIcon,
  XIconDarkTheme,
  XIconLightTheme,
  YellowHeart,
} from "../components/ImageAssets";
import {
  calculateDuration,
  classNames,
  formatCurrency,
  formatNumberWithCommas,
  formatRecipientNameFirstWordForPill,
  getInstitutionNameByCode,
  getKesMpesaInstitutionLabel,
  KES_MPESA_INSTITUTION_CODE,
  normalizeSavedRecipientChannel,
  isSameSavedRecipient,
  getRpcUrl,
} from "../utils";
import {
  fetchOrderDetails,
  fetchV2SenderPaymentOrderById,
  isOnrampUnderReview,
  resolveOnrampOrderStatusFromV2Response,
  updateTransactionDetails,
  unwrapV2SenderOrderEnvelope,
  fetchSavedRecipients,
  saveRecipient,
  deleteSavedRecipient,
} from "../api/aggregator";
import {
  isKnownAggregatorOrderStatus,
  onrampRefundExplanation,
} from "../lib/order-status";
import { reindexSingleTransaction } from "../lib/reindex";
import {
  STEPS,
  type OrderDetailsData,
  type TransactionStatusProps,
  type KesMpesaChannel,
} from "../types";
import { toast } from "sonner";
import { trackEvent } from "../hooks/analytics/client";
import { CheckmarkCircle01Icon } from "hugeicons-react";
import {
  useBalance,
  useInjectedWallet,
  useNetwork,
  useTokens,
  useEmbed,
} from "../context";
import { useSmartWalletTransfer } from "../hooks/useSmartWalletTransfer";
import config from "../lib/config";
import { formatUnits } from "viem";
import {
  decideForwardAction,
  toAmountWei,
  dustWeiForDecimals,
  DEFAULT_STALENESS_MS,
} from "../lib/onrampForwarding/decideForwardAction";
import {
  getForwardRecord,
  upsertForwardRecord,
} from "../lib/onrampForwarding/forwardRecordStore";
import { readForwardBalanceWei } from "../lib/onrampForwarding/readForwardBalanceWei";
import type { Token } from "../types";
import { usePrivy } from "@privy-io/react-auth";
import { useApiAuth } from "../hooks/useApiAuth";
import { useConfetti } from "../hooks/useConfetti";
import { useRocketStatus } from "../context/RocketStatusContext";
import {
  ActionProgress,
  ActionReceiptFailed,
  ActionReceiptSuccess,
  ActionSubmitButton,
  showActionSuccessToast,
} from "../components/drawer";
import { DrawerPoweredByFooter } from "../components/drawer/DrawerPoweredByFooter";
import {
  buildDefaultReceiptRows,
  ReceiptDashedRule,
  ReceiptMetaRows,
} from "../components/drawer/ReceiptMetaRows";
import { SuccessCheckmark } from "../components/drawer/SuccessCheckmark";
import {
  drawerBodyText,
  drawerReceiptTitleClasses,
  drawerSecondaryText,
  drawerStepHeadingClasses,
} from "../components/drawer/drawerStyles";
import type { ActionProgressStep } from "../components/drawer/types";

/**
 * Renders the transaction status component.
 *
 * @param transactionStatus - The status of the transaction.
 * @param recipientName - The name of the recipient.
 * @param errorMessage - The error message, if any.
 * @param createdAt - The creation date of the transaction.
 * @param clearForm - Function to clear the form.
 * @param clearTransactionStatus - Function to clear the transaction status.
 * @param setTransactionStatus - Function to set the transaction status.
 * @param setCurrentStep - Function to set the current step.
 * @param formMethods - The form methods.
 */

/**
 * The Buy "watching for your transfer" card (Figma b17/b19/b20) — shared so
 * MakePayment's post-confirm UI-only "watching" state (Figma also b17, shown
 * the instant the user clicks "I have sent the money", before the backend
 * has actually confirmed anything) renders the identical markup instead of a
 * second copy of it.
 */
export function renderBuyWatchingCard(steps: ActionProgressStep[]) {
  return (
    <div className="flex w-full flex-col gap-6">
      <ActionProgress
        heading="Watching for your transfer"
        subheading="Transfers usually arrive within a few minutes."
        steps={steps}
      />
      <DrawerPoweredByFooter />
    </div>
  );
}

export function TransactionStatus({
  transactionStatus,
  orderId,
  createdAt,
  setTransactionStatus,
  setCurrentStep,
  clearForm,
  clearTransactionStatus,
  formMethods,
  supportedInstitutions,
  setOrderId,
  refetchRate,
  isOnramp = false,
}: TransactionStatusProps) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const { selectedNetwork } = useNetwork();
  const { isEmbed } = useEmbed();
  const { allTokens } = useTokens();
  const {
    refreshBalance,
    smartWalletBalance,
    injectedWalletBalance,
    starknetWalletBalance,
    tronWalletBalance,
  } = useBalance();
  const { isInjectedWallet, injectedAddress } = useInjectedWallet();
  const { user, getAccessToken } = usePrivy();
  const { resolveAuth } = useApiAuth();
  const { setRocketStatus } = useRocketStatus();

  const embeddedWallet = user?.linkedAccounts.find(
    (account) =>
      account.type === "wallet" && account.connectorType === "embedded",
  ) as { address: string } | undefined;

  const [orderDetails, setOrderDetails] = useState<OrderDetailsData>();
  const [completedAt, setCompletedAt] = useState<string>("");
  /** On-ramp: set once when status leaves `pending` so "Time spent" measures from processing start. */
  const [processingStartedAt, setProcessingStartedAt] = useState<string>("");
  const [createdHash, setCreatedHash] = useState("");
  const [isGettingReceipt, setIsGettingReceipt] = useState(false);
  const [addToBeneficiaries, setAddToBeneficiaries] = useState(false);
  const [isTracked, setIsTracked] = useState(false);
  const [hasShownConfetti, setHasShownConfetti] = useState(false);
  const [isSavingRecipient, setIsSavingRecipient] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [hasReindexed, setHasReindexed] = useState(false);
  const reindexTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const latestRequestIdRef = useRef<number>(0);
  const lastPersistedOrderStatusRef = useRef<string | null>(null);
  const lastFulfillPersistKeyRef = useRef<string | null>(null);
  /**
   * DB row id for THIS order, pinned once per order. `currentTransactionId` in localStorage is a
   * global key that any wallet transfer (including the leg-2 forward) overwrites — status writes
   * must keep targeting the order's own row, not whatever the key holds later.
   */
  const transactionDbIdRef = useRef<string | null>(null);

  const fireConfetti = useConfetti();

  useEffect(() => {
    lastPersistedOrderStatusRef.current = null;
    lastFulfillPersistKeyRef.current = null;
    transactionDbIdRef.current =
      typeof window !== "undefined"
        ? localStorage.getItem("currentTransactionId")
        : null;
    setProcessingStartedAt("");
  }, [orderId]);

  useEffect(
    function recordOnrampProcessingStart() {
      if (!isOnramp || processingStartedAt) return;
      const isProcessing =
        transactionStatus === "fulfilling" ||
        transactionStatus === "fulfilled" ||
        ["validated", "settling"].includes(transactionStatus);
      if (!isProcessing) return;
      setProcessingStartedAt(new Date().toISOString());
    },
    [isOnramp, transactionStatus, processingStartedAt],
  );

  const { watch } = formMethods;
  const token = watch("token") || "";
  const currency = String(watch("currency")) || "USD";
  const amount = watch("amountSent") || 0;
  const fiat = Number(watch("amountReceived")) || 0;
  const recipientName = String(watch("recipientName")) || "";
  const accountIdentifier = watch("accountIdentifier") || "";
  const institution = watch("institution") || "";
  const watchedKesChannel = watch("kesChannel") || "";
  const watchedBusinessNumber = watch("businessNumber") || "";
  const recipientWalletAddress = String(watch("walletAddress") || "");
  const amountReceivedCrypto = Number(watch("amountReceived")) || 0;

  /**
   * Leg 2: once an onramp settles into the user's Noblocks wallet, forward the funds to the user's
   * chosen destination (if different) using the SAME sponsored EIP-7702 transfer flow as a normal
   * Noblocks transfer (`useSmartWalletTransfer`).
   *
   * Leg 2 is client-signed, so it can only run while a tab is open. To make it idempotent and
   * resumable, the decision is centralized in the pure `decideForwardAction` and backed by a durable
   * localStorage record (`forwardRecordStore`) plus the wallet's FRESH on-chain balance:
   *   - the order amount is the user's received crypto (form), persisted so a reload doesn't lose it;
   *   - the on-chain balance is the hard cap (never forward more than arrived) and the idempotency
   *     signal (a drained balance means the funds already left → finalize, never re-forward);
   *   - a staleness window distinguishes an in-flight transfer (wait) from a dropped one (resubmit).
   * Any failure resolves silently — funds simply stay in the Noblocks wallet and no notice is shown.
   */
  type ForwardingStatus =
    | "idle"
    | "pending"
    | "forwarding"
    | "completed"
    | "skipped"
    | "failed";
  const [forwardingStatus, setForwardingStatus] =
    useState<ForwardingStatus>("idle");
  // Leg-2 tx hash for the receipt row, persisted so it survives a reload of the status page.
  const [storedForwardTxHash, setStoredForwardTxHash] = useState<string | null>(
    null,
  );
  // Re-entrancy guards (the durable record handles cross-reload idempotency; these are per-session):
  const forwardEvalRef = useRef(false); // an evaluation is in flight — don't overlap
  const forwardStartedRef = useRef(false); // this tab kicked off the transfer — don't re-forward
  const forwardDoneRef = useRef(false); // a terminal state was reached — stop evaluating
  const recheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [forwardRecheckTick, setForwardRecheckTick] = useState(0);
  const FORWARD_RECHECK_MS = 15_000;
  const scheduleRecheck = () => {
    if (recheckTimerRef.current) clearTimeout(recheckTimerRef.current);
    recheckTimerRef.current = setTimeout(() => {
      setForwardRecheckTick((t) => t + 1);
    }, FORWARD_RECHECK_MS);
  };

  // Per-order reset: forwarding state must not leak from a previous onramp into the next one.
  useEffect(() => {
    setForwardingStatus("idle");
    setStoredForwardTxHash(null);
    forwardEvalRef.current = false;
    forwardStartedRef.current = false;
    forwardDoneRef.current = false;
    if (recheckTimerRef.current) {
      clearTimeout(recheckTimerRef.current);
      recheckTimerRef.current = null;
    }
  }, [orderId]);

  // Clear any pending re-check on unmount.
  useEffect(
    () => () => {
      if (recheckTimerRef.current) clearTimeout(recheckTimerRef.current);
    },
    [],
  );

  const {
    transfer: forwardTransfer,
    isSuccess: isForwardTransferSuccess,
    error: forwardTransferError,
    txHash: forwardTxHash,
  } = useSmartWalletTransfer({
    selectedNetwork,
    user,
    supportedTokens: allTokens[selectedNetwork.chain.name] || [],
    getAccessToken,
    refreshBalance,
    // Can't auto-forward if the wallet still needs migration — fail silently; funds stay in wallet.
    onRequireMigration: () => {
      forwardDoneRef.current = true;
      if (orderId) upsertForwardRecord(orderId, { status: "failed" });
      setForwardingStatus("failed");
    },
  });

  // Leg-2 evaluation: durable record + fresh on-chain balance → decideForwardAction. Re-runs on a
  // recheck tick while waiting for an in-flight transfer started in another session/tab.
  useEffect(() => {
    if (!config.onrampChainedForwardingEnabled) return;
    if (!isOnramp) return;
    if (transactionStatus !== "settled") return;
    if (!orderId) return;
    if (forwardDoneRef.current) return; // already terminal
    if (forwardStartedRef.current) return; // this tab is mid-forward
    if (forwardEvalRef.current) return; // an evaluation is already running

    // Permanent unsupported / misconfig cases: fail closed to a terminal state so the settled onramp
    // resolves (funds stay safe in the Noblocks wallet) instead of spinning forever.
    // Injected mode has no Noblocks (Privy embedded) wallet — leg 1 already paid the user's own
    // wallet directly, so there is nothing to forward. Without this the `!noblocksWallet` wait
    // below would never resolve and the settled onramp would show "processing" forever.
    if (isInjectedWallet) {
      forwardDoneRef.current = true;
      setForwardingStatus("skipped");
      return;
    }
    // EVM-only for now; Starknet forwarding isn't supported by this flow.
    if (selectedNetwork.chain.name === "Starknet") {
      forwardDoneRef.current = true;
      setForwardingStatus("skipped");
      return;
    }
    const rpcUrl = getRpcUrl(selectedNetwork.chain.name);
    if (!rpcUrl) {
      forwardDoneRef.current = true;
      setForwardingStatus("skipped");
      return;
    }

    // Transient: embedded wallet not hydrated yet — schedule a recheck so a slow Privy hydration
    // re-evaluates instead of stalling (a bare return would only retry if something else re-rendered).
    const noblocksWallet = embeddedWallet?.address ?? "";
    if (!noblocksWallet) {
      scheduleRecheck();
      return;
    }

    forwardEvalRef.current = true;
    let cancelled = false;

    (async () => {
      try {
        const existing = getForwardRecord(orderId);
        const destination = (
          existing?.destination ||
          recipientWalletAddress ||
          ""
        ).trim();
        const tokenSymbol = existing?.token || String(token);

        const tokens: Token[] = allTokens[selectedNetwork.chain.name] || [];
        const tokenData = tokens.find(
          (t) => t.symbol.toUpperCase() === tokenSymbol.toUpperCase(),
        );
        if (!tokenData || tokenData.decimals === undefined) {
          if (tokens.length === 0) {
            // Token list not loaded yet — transient; re-evaluate shortly.
            if (!cancelled) scheduleRecheck();
          } else {
            // Token list is loaded but this symbol isn't supported here — permanent; resolve
            // terminally so the settled onramp doesn't spin forever. Funds stay in the wallet.
            forwardDoneRef.current = true;
            setForwardingStatus("skipped");
          }
          return;
        }
        const decimals = tokenData.decimals;

        const orderAmountWei = existing?.amountWei
          ? BigInt(existing.amountWei)
          : toAmountWei(amountReceivedCrypto, decimals);

        const balanceWei = await readForwardBalanceWei({
          chain: selectedNetwork.chain,
          rpcUrl,
          owner: noblocksWallet as `0x${string}`,
          token: { address: tokenData.address, isNative: tokenData.isNative },
        });
        if (cancelled) return;

        const decision = decideForwardAction({
          record: existing,
          orderAmountWei,
          balanceWei,
          destination,
          noblocksWallet,
          now: Date.now(),
          stalenessMs: DEFAULT_STALENESS_MS,
          dustWei: dustWeiForDecimals(decimals),
        });

        switch (decision.action) {
          case "skip": {
            // Reloading after a successful leg 2 must NOT downgrade the completed record (which
            // would also hide the transfer receipt) — restore the completed state instead.
            if (decision.reason === "already-completed") {
              const hash = existing?.txHash;
              if (hash) setStoredForwardTxHash(hash);
              forwardDoneRef.current = true;
              setForwardingStatus("completed");
              return;
            }
            // Persist a terminal skip for self-destination so a reload short-circuits via the record.
            if (decision.reason === "self-destination") {
              upsertForwardRecord(orderId, {
                status: "skipped",
                destination,
                token: tokenSymbol,
              });
            }
            forwardDoneRef.current = true;
            setForwardingStatus("skipped");
            return;
          }
          case "complete": {
            const hash = decision.txHash ?? existing?.txHash;
            upsertForwardRecord(orderId, { status: "completed", txHash: hash });
            if (hash) setStoredForwardTxHash(hash);
            forwardDoneRef.current = true;
            setForwardingStatus("completed");
            return;
          }
          case "wait": {
            // Another session is mid-transfer; keep the spinner and re-check shortly.
            setForwardingStatus("forwarding");
            scheduleRecheck();
            return;
          }
          case "forward": {
            // Claim durably BEFORE signing. If we can't persist the claim (storage disabled), a
            // reload could resubmit while this transfer is in flight — fail closed and don't forward.
            const claim = upsertForwardRecord(orderId, {
              status: "pending",
              destination,
              token: tokenSymbol,
              amountWei: decision.amountWei.toString(),
            });
            if (!claim) {
              forwardDoneRef.current = true;
              setForwardingStatus("failed");
              return;
            }
            forwardStartedRef.current = true;
            // Privy-only by construction: the injected-mode guard above resolves before we can
            // get here, so the Noblocks embedded wallet (and its Privy token) always exists.
            const accessToken = await getAccessToken();
            if (cancelled) return;
            if (!accessToken) {
              upsertForwardRecord(orderId, { status: "failed" });
              forwardDoneRef.current = true;
              setForwardingStatus("failed");
              return;
            }
            upsertForwardRecord(orderId, { status: "forwarding" });
            setForwardingStatus("forwarding");
            // Forward exactly the capped amount via the standard sponsored transfer flow.
            await forwardTransfer({
              amount: Number(formatUnits(decision.amountWei, decimals)),
              token: tokenSymbol,
              recipientAddress: destination,
            });
            // Success/failure is finalized by the resolution effect below.
            return;
          }
        }
      } catch (err) {
        // A read error (RPC/balance) is not a forwarding failure — never mark failed (or forward) on
        // incomplete information. Schedule a retry so a transient RPC blip doesn't strand the spinner.
        console.error("[onramp] forwarding evaluation failed:", err);
        if (
          !cancelled &&
          !forwardDoneRef.current &&
          !forwardStartedRef.current
        ) {
          scheduleRecheck();
        }
      } finally {
        forwardEvalRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
      forwardEvalRef.current = false;
    };
  }, [
    isOnramp,
    isInjectedWallet,
    transactionStatus,
    orderId,
    forwardRecheckTick,
    recipientWalletAddress,
    allTokens,
    selectedNetwork.chain,
    selectedNetwork.chain.name,
    token,
    amountReceivedCrypto,
    embeddedWallet?.address,
    getAccessToken,
    forwardTransfer,
  ]);

  // Finalize a transfer THIS tab initiated (the hook reports success/error asynchronously).
  useEffect(() => {
    if (forwardingStatus !== "forwarding") return;
    if (!forwardStartedRef.current) return; // ignore the "wait" spinner for another session's tx
    if (isForwardTransferSuccess) {
      upsertForwardRecord(orderId, {
        status: "completed",
        txHash: forwardTxHash ?? undefined,
      });
      if (forwardTxHash) setStoredForwardTxHash(forwardTxHash);
      forwardDoneRef.current = true;
      setForwardingStatus("completed");
    } else if (forwardTransferError) {
      upsertForwardRecord(orderId, { status: "failed" });
      forwardDoneRef.current = true;
      setForwardingStatus("failed");
    }
  }, [
    forwardingStatus,
    isForwardTransferSuccess,
    forwardTransferError,
    forwardTxHash,
    orderId,
  ]);

  // When chained forwarding is active, an onramp isn't "done" until leg 2 resolves (forwarded,
  // skipped, or failed). Until then — while pending/forwarding — the page must not present final
  // success. A failed forward resolves silently; funds stay in the Noblocks wallet.
  const isOnrampForwardingResolved =
    !config.onrampChainedForwardingEnabled ||
    !isOnramp ||
    forwardingStatus === "completed" ||
    forwardingStatus === "skipped" ||
    forwardingStatus === "failed";

  /** Off-ramp: success visuals for validated | settling | settled. On-ramp: only `settled` (loading/processing until then). */
  const showSuccessVisual =
    (!isOnramp &&
      ["validated", "settling", "settled"].includes(transactionStatus)) ||
    (isOnramp && transactionStatus === "settled" && isOnrampForwardingResolved);

  /** Fire the "funds added" toast once per transition into on-ramp success. */
  const successToastFiredRef = useRef(false);
  useEffect(() => {
    if (!isOnramp) return;
    if (showSuccessVisual && !successToastFiredRef.current) {
      successToastFiredRef.current = true;
      showActionSuccessToast(
        `${formatNumberWithCommas(fiat)} ${token} added`,
        "Funds have been added to your balance.",
      );
    }
    if (!showSuccessVisual) {
      successToastFiredRef.current = false;
    }
  }, [isOnramp, showSuccessVisual, fiat, token]);

  /** Order meta / dashed hr: off-ramp unchanged; on-ramp only after final or terminal failure. */
  const showOrderMetaSection =
    (!isOnramp &&
      ["validated", "settling", "settled", "refunded", "expired"].includes(
        transactionStatus,
      )) ||
    (isOnramp &&
      ((transactionStatus === "settled" && isOnrampForwardingResolved) ||
        ["refunded", "expired"].includes(transactionStatus)));

  /** Off-ramp: show during validated|settling|settled. On-ramp: only after order is done or terminal failure. */
  const showNewPaymentButton =
    !isOnramp || ["settled", "refunded", "expired"].includes(transactionStatus);

  /** PDF receipt is offramp-only for now (uses order-level isOnramp snapshot). */
  const showGetReceiptButton =
    !isOnramp &&
    ["validated", "settling", "settled"].includes(transactionStatus);

  /** Off-ramp: same as always — order created → completed. */
  const offRampTimeSpentLabel = calculateDuration(createdAt, completedAt);
  /** On-ramp only — from first processing status (fulfilling / fulfilled / validated / settling). */
  const onRampTimeSpentLabel = calculateDuration(
    processingStartedAt || createdAt,
    completedAt,
  );
  const timeSpentLabel = isOnramp
    ? onRampTimeSpentLabel
    : offRampTimeSpentLabel;

  // Check if recipient is already saved in the database
  const [isRecipientInBeneficiaries, setIsRecipientInBeneficiaries] =
    useState(false);

  // Check if recipient exists in saved beneficiaries
  useEffect(() => {
    const checkRecipientExists = async () => {
      if (!accountIdentifier || !institution) {
        setIsRecipientInBeneficiaries(false);
        return;
      }

      try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          setIsRecipientInBeneficiaries(false);
          return;
        }

        const savedRecipients = await fetchSavedRecipients(accessToken);
        const exists = savedRecipients.some(
          (r) =>
            r.type !== "wallet" &&
            isSameSavedRecipient(r, {
              accountIdentifier: String(accountIdentifier),
              institutionCode: String(institution),
              channel: String(watchedKesChannel) as KesMpesaChannel | "",
              businessNumber: String(watchedBusinessNumber),
            }),
        );
        setIsRecipientInBeneficiaries(exists);
      } catch (error) {
        console.error("Error checking if recipient exists:", error);
        setIsRecipientInBeneficiaries(false);
      }
    };

    checkRecipientExists();
  }, [
    accountIdentifier,
    institution,
    watchedKesChannel,
    watchedBusinessNumber,
    getAccessToken,
  ]);

  /**
   * Updates transaction status in the backend
   * Uses a request ID system to handle race conditions when multiple updates are triggered
   * Only the latest update attempt will complete, older ones will be skipped
   */
  const saveTransactionData = async (
    statusOverride?: string,
    txHashOverride?: string,
  ) => {
    const persistWalletAddress = isInjectedWallet
      ? injectedAddress
      : embeddedWallet?.address;
    if (!persistWalletAddress) return;

    const effectiveAggregatorStatus = statusOverride ?? transactionStatus;
    const effectiveTxHash =
      txHashOverride !== undefined
        ? txHashOverride
        : effectiveAggregatorStatus === "refunded"
          ? orderDetails?.txHash
          : effectiveAggregatorStatus === "expired"
            ? undefined
            : createdHash;

    // Increment request ID to mark this as the latest request
    const requestId = ++latestRequestIdRef.current;

    try {
      const { accessToken, injectedToken } = await resolveAuth({
        interactive: false,
      });
      if (!accessToken && !injectedToken) {
        throw new Error("No access token available");
      }

      // Pin the order's own DB row on first use; the localStorage key is global and may already
      // point at a later transfer's row (e.g. the leg-2 forward).
      transactionDbIdRef.current ??= localStorage.getItem(
        "currentTransactionId",
      );
      const transactionId = transactionDbIdRef.current;
      if (!transactionId) {
        console.error("No transaction ID found");
        return;
      }

      // If this is no longer the latest request, skip saving
      if (requestId !== latestRequestIdRef.current) {
        return;
      }

      // Calculate time spent
      const timeSpent = calculateDuration(createdAt, new Date().toISOString());

      // Check again before making the API call
      if (requestId !== latestRequestIdRef.current) {
        return;
      }

      const response = await updateTransactionDetails({
        transactionId,
        status: effectiveAggregatorStatus,
        txHash: effectiveTxHash,
        timeSpent,
        accessToken,
        injectedToken,
        walletAddress: persistWalletAddress,
        isOnramp: isOnramp === true,
      });

      if (!response.success) {
        throw new Error("Failed to update transaction details");
      }
    } catch (error: unknown) {
      // Only log if this is still the latest request
      if (requestId === latestRequestIdRef.current) {
        console.error("Error updating transaction:", error);
      }
    }
  };

  /**
   * Polls the order details endpoint every 5 seconds to check transaction status
   * Updates local state when status changes
   * Saves transaction data when status is final (validated/settling/settled/refunded)
   */
  useEffect(
    function pollOrderDetails() {
      let intervalId: NodeJS.Timeout | null = null;
      let cancelled = false;
      let tokenlessCycles = 0;
      let hasShownSessionToast = false;

      const stopPollingLoop = () => {
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      };

      const persistIfStatusChanged = (s: string) => {
        if (lastPersistedOrderStatusRef.current === s) return;
        lastPersistedOrderStatusRef.current = s;
        void saveTransactionData(s);
      };

      const persistFulfillment = (h?: string) => {
        const key = `fulfilling:${h ?? ""}`;
        if (lastFulfillPersistKeyRef.current === key) return;
        lastFulfillPersistKeyRef.current = key;
        void saveTransactionData("fulfilling", h);
      };

      const sessionExpiredMessage =
        "Session expired. Please refresh to continue tracking your transaction.";

      const getOrderDetails = async () => {
        if (cancelled) return;
        try {
          const { accessToken, injectedToken } = await resolveAuth({
            interactive: false,
          });
          if (cancelled) return;
          if (!accessToken && !injectedToken) {
            // A missing token can be a transient blip (refresh, backgrounded tab). Skip this
            // cycle and keep polling — killing the interval here strands the status forever.
            tokenlessCycles += 1;
            if (tokenlessCycles >= 6 && !hasShownSessionToast) {
              hasShownSessionToast = true;
              toast.error(sessionExpiredMessage);
            }
            return;
          }
          tokenlessCycles = 0;

          let responseData: OrderDetailsData;

          if (isOnramp) {
            const res = await fetchV2SenderPaymentOrderById(
              orderId,
              accessToken,
              injectedToken,
            );
            const resolvedStatus = resolveOnrampOrderStatusFromV2Response(res);
            responseData =
              unwrapV2SenderOrderEnvelope(res) ??
              (res as unknown as { data?: OrderDetailsData }).data ??
              (res as unknown as OrderDetailsData);
            if (resolvedStatus !== undefined && responseData) {
              responseData = { ...responseData, status: resolvedStatus };
            }
          } else {
            const orderDetailsResponse = await fetchOrderDetails(
              orderId,
              accessToken,
              { network: selectedNetwork.chain.name, injectedToken },
            );
            responseData = orderDetailsResponse.data;
          }

          if (cancelled) return;

          // The envelope fallback can surface `"success"`/`"error"` (HTTP envelope, not an order
          // status) — never let those flow into UI state or DB persistence.
          const rawStatus = responseData?.status;
          if (!isKnownAggregatorOrderStatus(rawStatus)) {
            console.warn(
              "[TransactionStatus] Skipping unknown order status:",
              rawStatus,
            );
            return;
          }
          // Canonicalize before anything reads it: the guard matches case-insensitively, but
          // every comparison below (and the persisted value) is lowercase, so a mixed-case
          // terminal status would otherwise poll forever and be stored non-canonically.
          responseData = { ...responseData, status: rawStatus.toLowerCase() };

          setOrderDetails(responseData);

          if (responseData.status === "pending") {
            return;
          }

          const status = responseData.status;

          if (status === "expired") {
            const doneAt =
              responseData.updatedAt ||
              String((responseData as Record<string, unknown>).timestamp ?? "");
            setCompletedAt(doneAt);
            setTransactionStatus("expired");
            stopPollingLoop();
            persistIfStatusChanged("expired");
            return;
          }

          setTransactionStatus(
            status as
            | "fulfilling"
            | "validated"
            | "settling"
            | "settled"
            | "refunding"
            | "refunded"
            | "expired",
          );

          if (status === "refunded") {
            setCompletedAt(
              responseData.updatedAt ||
              String(
                (responseData as Record<string, unknown>).timestamp ?? "",
              ),
            );
            refreshBalance();
            setRocketStatus("pending");
            stopPollingLoop();
            persistIfStatusChanged(status);
            return;
          }

          if (status === "fulfilling") {
            const createdReceipt = responseData.txReceipts?.find(
              (txReceipt) => txReceipt.status === "pending",
            );
            const h = createdReceipt?.txHash;
            if (h) {
              setCreatedHash(h);
            }
            persistFulfillment(h);
            setRocketStatus("processing");
            return;
          }

          if (status === "fulfilled") {
            setRocketStatus("fulfilled");
            return;
          }

          if (["validated", "settling", "settled"].includes(status)) {
            const doneAt =
              responseData.updatedAt ||
              String((responseData as Record<string, unknown>).timestamp ?? "");
            if (!isOnramp) {
              setCompletedAt(doneAt);
            } else if (status === "settled") {
              setCompletedAt(doneAt);
            }

            if (isOnramp && ["validated", "settling"].includes(status)) {
              setRocketStatus("processing");
            } else {
              setRocketStatus("settled");
            }

            const stopPolling =
              (!isOnramp &&
                ["validated", "settling", "settled"].includes(status)) ||
              (isOnramp && status === "settled");

            const hashFromOrder =
              responseData.txHash ||
              responseData.txReceipts?.find((r) => r.txHash)?.txHash ||
              responseData.txReceipts?.[0]?.txHash;

            if (stopPolling) {
              stopPollingLoop();
              if (hashFromOrder) {
                setCreatedHash(hashFromOrder);
              }
            }

            if (lastPersistedOrderStatusRef.current !== status) {
              lastPersistedOrderStatusRef.current = status;
              void saveTransactionData(status, hashFromOrder);
            }
            return;
          }
        } catch (error) {
          // fail silently
        }
      };

      // Create the interval synchronously so a cleanup from an effect re-run (every status
      // change) can never race an in-flight async bootstrap and orphan it.
      void getOrderDetails();
      intervalId = setInterval(getOrderDetails, 5000);

      return () => {
        cancelled = true;
        stopPollingLoop();
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orderId, transactionStatus],
  );

  /**
   * Tracks transaction events for analytics
   * Only tracks once per transaction when status is final
   */
  useEffect(
    function trackTransactionEvents() {
      // Only track if we haven't tracked yet and have all required data
      if (!isTracked && transactionStatus && completedAt) {
        const bankName = getInstitutionNameByCode(
          String(formMethods.watch("institution")),
          supportedInstitutions,
        );

        const balance = isInjectedWallet
          ? injectedWalletBalance?.balances[token] || 0
          : selectedNetwork.chain.name === "Starknet"
            ? starknetWalletBalance?.balances[token] || 0
            : selectedNetwork.chain.name === "Tron"
              ? tronWalletBalance?.balances[token] || 0
              : smartWalletBalance?.balances[token] || 0;

        const eventData = {
          Amount: amount,
          "Send token": token,
          "Receive currency": currency,
          "Recipient bank": bankName,
          "Wallet balance": balance,
          "Swap date": createdAt,
          "Transaction duration": isOnramp
            ? calculateDuration(processingStartedAt || createdAt, completedAt)
            : calculateDuration(createdAt, completedAt),
          "Wallet type": isInjectedWallet ? "Injected" : "Smart wallet",
        };

        if (
          (!isOnramp &&
            ["validated", "settling", "settled"].includes(transactionStatus)) ||
          (isOnramp && transactionStatus === "settled")
        ) {
          trackEvent("Swap completed", eventData);
          setIsTracked(true);
        } else if (transactionStatus === "refunded") {
          trackEvent("Swap failed", {
            ...eventData,
            "Reason for failure": "Transaction failed and refunded",
          });
          setIsTracked(true);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isTracked, transactionStatus, completedAt],
  );

  /**
   * Shows confetti animation when transaction is successful
   * Only shows once per transaction
   */
  useEffect(
    function fireConfettiOnSuccess() {
      const shouldCelebrate =
        (!isOnramp &&
          ["validated", "settling", "settled"].includes(transactionStatus)) ||
        (isOnramp && transactionStatus === "settled");
      if (shouldCelebrate && !hasShownConfetti) {
        fireConfetti();
        setHasShownConfetti(true);
      }
    },
    [transactionStatus, fireConfetti, hasShownConfetti, isOnramp],
  );

  /**
   * Reindexes transaction if it has been pending for more than 30 seconds
   * Only calls reindex once per transaction
   */
  useEffect(
    function reindexPendingTransaction() {
      // Only proceed if:
      // 1. Transaction status is "pending"
      // 2. We haven't already reindexed
      // 3. We have order details with network
      if (
        transactionStatus !== "pending" ||
        hasReindexed ||
        !orderDetails ||
        !orderDetails.network
      ) {
        return;
      }

      // Get txHash from orderDetails.txHash or from txReceipts
      let txHash = orderDetails.txHash;
      if (
        !txHash &&
        orderDetails.txReceipts &&
        orderDetails.txReceipts.length > 0
      ) {
        // Try to find a pending receipt first, otherwise use the first one
        const pendingReceipt = orderDetails.txReceipts.find(
          (receipt) => receipt.status === "pending",
        );
        txHash = pendingReceipt?.txHash || orderDetails.txReceipts[0]?.txHash;
      }

      // If we still don't have a txHash, we can't reindex
      if (!txHash) {
        return;
      }

      // Reindex transaction to sync with blockchain state
      const callReindex = async (): Promise<void> => {
        try {
          await reindexSingleTransaction(txHash, orderDetails.network);
          setHasReindexed(true);
        } catch (error) {
          console.error("Error reindexing transaction:", error);
          // Prevent infinite retry loops on persistent errors
          setHasReindexed(true);
        }
      };

      // Calculate time elapsed since transaction creation
      const createdAtTime = new Date(createdAt).getTime();
      const currentTime = Date.now();
      const timeElapsed = currentTime - createdAtTime;
      const thirtySecondsInMs = 30 * 1000;

      // If 30 seconds haven't elapsed yet, schedule a check for when they will
      if (timeElapsed <= thirtySecondsInMs) {
        const remainingTime = thirtySecondsInMs - timeElapsed;
        reindexTimeoutRef.current = setTimeout(() => {
          callReindex();
        }, remainingTime);
      } else {
        // 30 seconds have elapsed, call reindex immediately
        callReindex();
      }

      // Cleanup function to clear timeout on unmount or dependency change
      return () => {
        if (reindexTimeoutRef.current) {
          clearTimeout(reindexTimeoutRef.current);
          reindexTimeoutRef.current = null;
        }
      };
    },
    [transactionStatus, hasReindexed, orderDetails, createdAt],
  );

  /**
   * Handles the back button click event.
   *
   * "Retry transaction" (refunded/expired) keeps the form values so the user can resubmit.
   * "New payment" (success) starts a clean order — it used to `window.location.reload()`, but a
   * reload destroys the injected wallet's SIWE session (memory-only by design, see
   * InjectedWalletContext), which signed embed users out and left KYC unable to reload, so the
   * form then treated a verified user as unverified. Reset in-app instead: this component
   * unmounts on the step change, so only shared state needs clearing here.
   */
  const handleBackButtonClick = () => {
    if (transactionStatus === "refunded" || transactionStatus === "expired") {
      refetchRate?.();
      clearTransactionStatus();
      setCurrentStep(STEPS.FORM);
      return;
    }

    clearForm();
    clearTransactionStatus();
    setOrderId("");
    setRocketStatus("pending");
    try {
      // Pinned per order; a stale id must not follow the next one into status updates.
      localStorage.removeItem("currentTransactionId");
    } catch {
      // Storage can be unavailable (private mode / blocked) — nothing else depends on this.
    }
    setCurrentStep(STEPS.FORM);
  };

  const handleAddToBeneficiariesChange = async (checked: boolean) => {
    setAddToBeneficiaries(checked);
    if (checked) {
      const saved = await addBeneficiary();
      if (!saved) {
        setAddToBeneficiaries(false);
      }
    } else {
      await removeRecipient();
    }
  };

  /** @returns true when recipient was saved and success UI is shown; false on early exit, API failure, or missing auth. */
  const addBeneficiary = async (): Promise<boolean> => {
    setIsSavingRecipient(true);

    const institutionCode = formMethods.watch("institution");
    if (!institutionCode) {
      setIsSavingRecipient(false);
      return false;
    }

    const kesChannel = formMethods.watch("kesChannel") as
      | KesMpesaChannel
      | ""
      | undefined;
    const businessNumber = String(
      formMethods.watch("businessNumber") || "",
    ).trim();
    const savedChannel = normalizeSavedRecipientChannel(kesChannel);

    const institutionName =
      String(institutionCode) === KES_MPESA_INSTITUTION_CODE && kesChannel
        ? getKesMpesaInstitutionLabel(kesChannel)
        : getInstitutionNameByCode(
            String(institutionCode),
            supportedInstitutions,
          );

    if (!institutionName) {
      console.error("Institution name not found");
      setIsSavingRecipient(false);
      return false;
    }

    const newRecipient = {
      name: recipientName,
      institution: institutionName,
      institutionCode: String(institutionCode),
      accountIdentifier: String(formMethods.watch("accountIdentifier") || ""),
      type:
        (formMethods.watch("accountType") as "bank" | "mobile_money") || "bank",
      currency: String(formMethods.watch("currency") || ""),
      // Send Money normalizes away so it matches pre-channel saved recipients.
      ...(savedChannel ? { channel: savedChannel } : {}),
      ...(businessNumber ? { businessNumber } : {}),
    };

    const accessToken = await getAccessToken();
    if (!accessToken) {
      setIsSavingRecipient(false);
      return false;
    }

    try {
      const success = await saveRecipient(newRecipient, accessToken);
      if (success) {
        setIsSavingRecipient(false);
        setShowSaveSuccess(true);

        setTimeout(() => {
          setShowSaveSuccess(false);
          setTimeout(() => {
            setIsRecipientInBeneficiaries(true);
          }, 300);
        }, 2000);
        return true;
      }
      setIsSavingRecipient(false);
      return false;
    } catch (error) {
      console.error("Error saving recipient:", error);
      setIsSavingRecipient(false);
      return false;
    }
  };

  const removeRecipient = async () => {
    const accountIdentifier = formMethods.watch("accountIdentifier");
    const institutionCode = formMethods.watch("institution");
    const channel = formMethods.watch("kesChannel") || "";
    const businessNumber = formMethods.watch("businessNumber") || "";

    if (!accountIdentifier || !institutionCode) {
      console.error("Missing account identifier or institution code");
      return;
    }

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        console.error("No access token available");
        return;
      }

      // Fetch saved recipients to find the recipient ID
      const savedRecipients = await fetchSavedRecipients(accessToken);
      const recipientToDelete = savedRecipients.find(
        (r) =>
          r.type !== "wallet" &&
          isSameSavedRecipient(r, {
            accountIdentifier: String(accountIdentifier),
            institutionCode: String(institutionCode),
            channel: String(channel) as KesMpesaChannel | "",
            businessNumber: String(businessNumber),
          }),
      );

      if (!recipientToDelete) {
        console.error("Recipient not found in saved recipients");
        return;
      }

      // Delete the recipient using its ID
      const success = await deleteSavedRecipient(
        recipientToDelete.id,
        accessToken,
      );
      if (success) {
        // Update state to show the checkbox again since recipient is now removed
        setIsRecipientInBeneficiaries(false);
        console.log("Recipient removed successfully");
      }
    } catch (error) {
      console.error("Error removing recipient:", error);
    }
  };

  const getPaymentMessage = () => {
    const formattedRecipientName = recipientName
      ? recipientName
        .toLowerCase()
        .split(" ")
        .map((name) => name.charAt(0).toUpperCase() + name.slice(1))
        .join(" ")
      : "";

    const amountDisplay = isOnramp
      ? `${formatCurrency(Number(amount) || 0, currency, `en-${currency.slice(0, 2)}`)} (${token} ${formatNumberWithCommas(fiat)})`
      : `${formatNumberWithCommas(amount)} ${token} (${formatCurrency(fiat ?? 0, currency, `en-${currency.slice(0, 2)}`)})`;

    if (transactionStatus === "refunded") {
      return (
        <>
          Your transfer of{" "}
          <span className="text-text-body dark:text-white">
            {amountDisplay}
          </span>{" "}
          to {formattedRecipientName} was unsuccessful.
          <br />
          <br />
          {isOnramp
            ? (onrampRefundExplanation(orderDetails?.refundReason) ??
              "The fiat payment could not be processed.")
            : "The stablecoin has been refunded to your account."}
        </>
      );
    }

    if (transactionStatus === "expired") {
      return (
        <>
          The time to pay for{" "}
          <span className="text-text-body dark:text-white">
            {amountDisplay}
          </span>{" "}
          {isOnramp
            ? " has passed. This order is no longer active."
            : " has expired."}
        </>
      );
    }

    // On-ramp: the payment arrived and is held for a compliance review. It does not expire.
    if (
      isOnramp &&
      transactionStatus === "pending" &&
      isOnrampUnderReview(orderDetails)
    ) {
      return (
        <>
          We received your payment of{" "}
          <span className="text-text-body dark:text-white">
            {amountDisplay}
          </span>{" "}
          and are reviewing it. Your money is safe: we&apos;ll either complete
          your order or send the money back to the account it came from.
          Don&apos;t pay again.
        </>
      );
    }

    // On-ramp: waiting for fiat — show with provider / VA details (not "processing" yet)
    if (isOnramp && transactionStatus === "pending") {
      return (
        <>
          Send{" "}
          <span className="text-text-body dark:text-white">
            {amountDisplay}
          </span>{" "}
          using the payment details below. This order stays pending until we
          receive your bank transfer.
        </>
      );
    }

    // On-ramp: backend moved past pending (fulfilling, fulfilled, validated, settling, etc.)
    const refundingNote = onrampRefundExplanation(orderDetails?.refundReason, {
      inProgress: true,
    });
    if (
      isOnramp &&
      ![
        "validated",
        "settling",
        "settled",
        "refunded",
        "expired",
        "pending",
      ].includes(transactionStatus)
    ) {
      return (
        <>
          {transactionStatus === "refunding" ? "Refunding" : "Processing"} your
          on-ramp payment of{" "}
          <span className="text-text-body dark:text-white">
            {amountDisplay}
          </span>
          {transactionStatus === "refunding"
            ? refundingNote
              ? `. ${refundingNote}`
              : "."
            : ". We're confirming your transfer and sending crypto to your wallet."}
        </>
      );
    }

    // On-ramp: validated / settling = still processing (loading), not completion copy
    if (isOnramp && ["validated", "settling"].includes(transactionStatus)) {
      return (
        <>
          Processing payment of{" "}
          <span className="text-text-body dark:text-white">
            {amountDisplay}
          </span>
          . Hang on, this will only take a few seconds.
        </>
      );
    }

    // Off-ramp only: original non-success copy
    if (
      !isOnramp &&
      !["validated", "settling", "settled"].includes(transactionStatus)
    ) {
      return (
        <>
          {transactionStatus === "refunding" ? "Refunding" : "Processing"}{" "}
          payment of{" "}
          <span className="text-text-body dark:text-white">
            {amountDisplay}
          </span>{" "}
          {`to ${formattedRecipientName}. Hang on, this will only take a few seconds`}
        </>
      );
    }

    if (showSuccessVisual) {
      return (
        <>
          Your transfer of{" "}
          <span className="text-text-body dark:text-white">
            {amountDisplay}
          </span>{" "}
          {isOnramp
            ? "has been completed successfully."
            : `to ${formattedRecipientName} has been completed successfully.`}
        </>
      );
    }

    // On-ramp: unexpected non-terminal status
    if (isOnramp) {
      return (
        <>
          Processing your on-ramp payment of{" "}
          <span className="text-text-body dark:text-white">
            {amountDisplay}
          </span>
          . Hang on, this will only take a few seconds.
        </>
      );
    }

    return null;
  };

  const handleGetReceipt = async () => {
    if (isOnramp) return;
    setIsGettingReceipt(true);
    try {
      if (orderDetails) {
        // Lazy-load PDF renderer (heavy, ~MBs of fontkit/pdfkit) only on demand
        // so it never enters the first-load JS bundle for the transaction status page.
        const [{ pdf }, { PDFReceipt }] = await Promise.all([
          import("@react-pdf/renderer"),
          import("../components/PDFReceipt"),
        ]);

        const blob = await pdf(
          <PDFReceipt
            data={orderDetails as OrderDetailsData}
            formData={{
              recipientName,
              accountIdentifier: String(accountIdentifier),
              institution: String(institution),
              memo: String(formMethods.watch("memo") || ""),
              amountReceived: Number(formMethods.watch("amountReceived") || 0),
              currency,
            }}
            supportedInstitutions={supportedInstitutions}
          />,
        ).toBlob();
        const pdfUrl = URL.createObjectURL(blob);
        window.open(pdfUrl, "_blank");
      }
    } catch (error) {
      toast.error("Error generating receipt. Please try again.");
      console.error("Error generating receipt:", error);
    } finally {
      setIsGettingReceipt(false);
    }
  };

  const networkName = selectedNetwork.chain.name;
  const resolvedTxHash = `${
    orderDetails?.status === "refunded" ? orderDetails?.txHash : createdHash
  }`;
  const tokenAmountLabel = `${formatNumberWithCommas(isOnramp ? fiat : amount)} ${token}`;
  // Figma bsuccess: the Buy success title reads "{token} {amount} added" —
  // token first, the one spot that differs from `tokenAmountLabel`'s order.
  const addedAmountLabel = `${token} ${formatNumberWithCommas(fiat)}`;
  const fiatAmountLabel = formatCurrency(
    Number(isOnramp ? amount : fiat) || 0,
    currency,
    `en-${currency.slice(0, 2)}`,
  );
  const fundStatusLabel = isOnramp ? "Transferred" : "Deposited";

  if (showSuccessVisual && isOnramp) {
    return (
      <div className="flex w-full flex-col items-center">
        <ActionReceiptSuccess
          variant="drawer"
          title={`${addedAmountLabel} added`}
          subtitle="Your money is in your balance and ready to use."
          fundStatusLabel={fundStatusLabel}
          timeSpentLabel={timeSpentLabel}
          networkName={networkName}
          txHash={resolvedTxHash}
          secondaryActionLabel="Done"
          onSecondaryAction={handleBackButtonClick}
          primaryActionLabel="Earn"
          onPrimaryAction={() => router.push("/earn")}
        />
      </div>
    );
  }

  if (showSuccessVisual) {
    // Sell success — Figma s42: title/subtitle, then the action buttons,
    // then the beneficiaries checkbox, then the dashed-rule/details/
    // dashed-rule block, then the share section. `ActionReceiptSuccess`'s
    // own internal order (details, *then* buttons) matches Buy's bsuccess
    // frame exactly — Buy keeps using it unchanged above; Sell's different
    // order is built here from the same primitives instead of adding a
    // layout-order flag to that shared component.
    const rows = buildDefaultReceiptRows({
      transactionStatusLabel: "Completed",
      transactionStatusTone: "success",
      fundStatusLabel,
      timeSpentLabel,
    });
    return (
      <div className="flex w-full flex-col items-center pt-5">
        <SuccessCheckmark size={54} strokeWidth={2.7} />
        <div className="mt-4 w-full space-y-1 text-center">
          <p className={drawerReceiptTitleClasses}>Transaction successful</p>
          <p className={classNames("text-sm", drawerSecondaryText)}>
            Your transfer of {tokenAmountLabel} to {recipientName} has been
            completed successfully.
          </p>
        </div>

        <div className="mt-5 flex w-full gap-3">
          <ActionSubmitButton
            label="Get receipt"
            variant="secondary"
            onClick={handleGetReceipt}
            className="!min-h-[42px] flex-1"
          />
          <ActionSubmitButton
            label="New payment"
            onClick={handleBackButtonClick}
            className="!min-h-[42px] flex-1"
          />
        </div>

        {!isRecipientInBeneficiaries ? (
          <div className="mt-5 flex w-full items-start gap-2 text-sm">
            {isSavingRecipient ? (
              <>
                <ImSpinner className="mt-0.5 size-4 shrink-0 animate-spin text-text-body dark:text-white/80" />
                <span className={drawerBodyText}>
                  Saving to beneficiaries...
                </span>
              </>
            ) : showSaveSuccess ? (
              <>
                <CheckmarkCircle01Icon className="mt-0.5 size-4 shrink-0 text-green-500" />
                <span className="text-green-600 dark:text-green-400">
                  Saved to beneficiaries!
                </span>
              </>
            ) : (
              <Checkbox
                checked={addToBeneficiaries}
                onChange={handleAddToBeneficiariesChange}
                className="group flex cursor-pointer items-start gap-2 text-left outline-none"
              >
                <span className="group mt-0.5 block size-4 shrink-0 cursor-pointer rounded border-2 border-gray-300 bg-transparent data-[checked]:border-lavender-500 data-[checked]:bg-lavender-500 dark:border-white/30 dark:data-[checked]:border-lavender-500">
                  <svg
                    className="stroke-white/50 opacity-0 group-data-[checked]:opacity-100 dark:stroke-neutral-800"
                    viewBox="0 0 14 14"
                    fill="none"
                  >
                    <path
                      d="M3 8L6 11L11 3.5"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className={drawerBodyText}>
                  Add{" "}
                  {(recipientName ?? "").split(" ")[0].charAt(0).toUpperCase() +
                    (recipientName ?? "")
                      .toLowerCase()
                      .split(" ")[0]
                      .slice(1)}{" "}
                  to beneficiaries
                </span>
              </Checkbox>
            )}
          </div>
        ) : null}

        <ReceiptDashedRule className="mt-5" />
        <div className="mt-5 w-full">
          <ReceiptMetaRows
            rows={rows}
            networkName={networkName}
            txHash={resolvedTxHash}
            layout="drawer"
          />
        </div>

        {!isEmbed ? (
          <div className="mt-5 w-full space-y-4">
            <ReceiptDashedRule />
            <p className={classNames("text-sm", drawerSecondaryText)}>
              Help spread the word
            </p>
            <div className="relative flex items-center gap-3 overflow-hidden rounded-xl bg-gray-50 px-4 py-2 dark:bg-white/5">
              <YellowHeart className="size-8 flex-shrink-0" />
              <p className={classNames("text-sm", drawerSecondaryText)}>
                Yay! I just swapped {token} for {currency} in {timeSpentLabel}{" "}
                on noblocks.xyz
              </p>
              <QuotesBgIcon className="absolute -bottom-1 right-4 size-6" />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <a
                aria-label="Share on Twitter"
                rel="noopener noreferrer"
                target="_blank"
                href={`https://x.com/intent/tweet?text=I%20just%20swapped%20${token}%20for%20${currency}%20in%20${offRampTimeSpentLabel}%20on%20noblocks.xyz`}
                className={`min-h-9 !rounded-full ${secondaryBtnClasses} flex gap-2 text-neutral-900 dark:text-white/80`}
              >
                {resolvedTheme === "dark" ? (
                  <XIconDarkTheme className="size-5 text-text-secondary dark:text-white/50" />
                ) : (
                  <XIconLightTheme className="size-5 text-text-secondary dark:text-white/50" />
                )}
                X (Twitter)
              </a>
              <a
                aria-label="Share on Warpcast"
                rel="noopener noreferrer"
                target="_blank"
                href={`https://warpcast.com/~/compose?text=Yay%21%20I%20just%20swapped%20${token}%20for%20${currency}%20in%20${encodeURIComponent(offRampTimeSpentLabel)}%20on%20noblocks.xyz`}
                className={`min-h-9 !rounded-full ${secondaryBtnClasses} flex gap-2 text-neutral-900 dark:text-white/80`}
              >
                {resolvedTheme === "dark" ? (
                  <FarcasterIconDarkTheme className="size-5 text-text-secondary dark:text-white/50" />
                ) : (
                  <FarcasterIconLightTheme className="size-5 text-text-secondary dark:text-white/50" />
                )}
                Farcaster
              </a>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  if (transactionStatus === "refunded" || transactionStatus === "expired") {
    return (
      <ActionReceiptFailed
        title={
          transactionStatus === "expired"
            ? isOnramp
              ? "Order no longer active"
              : "Order expired"
            : undefined
        }
        body={getPaymentMessage()}
        fundStatusLabel={fundStatusLabel}
        timeSpentLabel={timeSpentLabel}
        networkName={networkName}
        txHash={resolvedTxHash}
        onRetry={handleBackButtonClick}
      />
    );
  }

  if (isOnramp) {
    // Order received a payment and is held for compliance review — not part
    // of the normal 3-step watching UI Figma draws (b17/b19/b20), and not
    // drawn by Figma at all; keep v1's existing copy, just hosted in the drawer.
    if (transactionStatus === "pending" && isOnrampUnderReview(orderDetails)) {
      return (
        <div className="flex w-full flex-col gap-6">
          <div>
            <p className={drawerStepHeadingClasses}>Payment under review</p>
            <p className={classNames("text-sm leading-5", drawerSecondaryText)}>
              {getPaymentMessage()}
            </p>
          </div>
          <ActionSubmitButton
            label="I have sent the money"
            disabled
            onClick={() => {}}
          />
          <DrawerPoweredByFooter />
        </div>
      );
    }

    const steps: ActionProgressStep[] = [
      {
        id: "waiting",
        label: "Waiting for your transfer",
        state: transactionStatus === "pending" ? "active" : "done",
      },
      {
        id: "received",
        label: "Payment received",
        state:
          transactionStatus === "pending"
            ? "pending"
            : transactionStatus === "fulfilling"
              ? "active"
              : "done",
      },
      {
        id: "adding",
        label: `Adding ${tokenAmountLabel} to your balance`,
        state: [
          "fulfilled",
          "validated",
          "settling",
          "settled",
          "refunding",
        ].includes(transactionStatus)
          ? "active"
          : "pending",
      },
    ];

    return renderBuyWatchingCard(steps);
  }

  // Sell processing/indexing — Figma s41 (top-aligned, left-aligned content —
  // unlike every other status screen here, this one isn't centred or
  // center-text; it reads top-to-bottom like the Form/Review steps).
  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-background-neutral px-2 py-1 text-sm font-medium text-text-body dark:bg-white/5 dark:text-white/80">
          <Image
            src={`/logos/${String(token)?.toLowerCase()}-logo.svg`}
            alt={`${token} logo`}
            width={14}
            height={14}
          />
          {tokenAmountLabel}
        </span>
        <span
          aria-hidden
          className="h-px min-w-6 flex-1 border-t border-dashed border-[#b0e8be] dark:border-[#2a6b3c]"
        />
        <span className="size-1.5 shrink-0 rounded-full bg-[#39c65d]" />
        <span className="shrink-0 rounded-full bg-[#f7f7f8] px-2 py-1 text-sm text-text-body dark:bg-white/5 dark:text-white/80">
          {formatRecipientNameFirstWordForPill(recipientName)}
        </span>
      </div>

      <div className="flex flex-col items-start gap-4">
        <span className="inline-flex items-center gap-1 rounded-full bg-[#fef9e8] px-2 py-1 text-sm text-[#61500b] dark:bg-[#61500b]/20 dark:text-[#f2c71c]">
          <ImSpinner className="size-4 animate-spin" />
          indexing
        </span>

        <p className="font-general-sans text-xl font-medium leading-7 text-text-body dark:text-white/80">
          Indexing by aggregator...
        </p>

        <ReceiptDashedRule />

        <p className={classNames("text-sm", drawerSecondaryText)}>
          Processing payment of{" "}
          <span className="text-text-body dark:text-white/80">
            {fiatAmountLabel}
          </span>{" "}
          to {recipientName}. Hang on, this will only take a few seconds
        </p>
      </div>
    </div>
  );
}
