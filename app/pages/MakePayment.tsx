"use client";
import { useEffect, useState, useRef } from "react";
import { Copy01Icon } from "hugeicons-react";
import { PiCheck } from "react-icons/pi";
import { ImSpinner } from "react-icons/im";
import { usePrivy } from "@privy-io/react-auth";
import {
    classNames,
    formatNumberWithCommas,
    copyToClipboard,
    getCurrencySymbol,
    mapProviderAccountToInstructions,
    ONRAMP_CLIENT_PAYMENT_SESSION_MS,
} from "../utils";
import { secondaryBtnClasses } from "../components";
import type { OnrampPaymentInstructions, TransactionPreviewProps } from "../types";
import { useStep } from "../context";
import {
    fetchV2SenderPaymentOrderById,
    resolveOnrampOrderStatusFromV2Response,
} from "../api/aggregator";
function getOrderStatusFromFetchPayload(body: unknown): string | undefined {
    if (!body || typeof body !== "object") return undefined;
    const o = body as Record<string, unknown>;
    const inner = o.data;
    if (inner && typeof inner === "object" && inner !== null) {
        const st = (inner as { status?: unknown }).status;
        if (typeof st === "string" && st.length > 0) return st;
    }
    if (typeof o.status === "string" && o.status.length > 0) {
        if (o.status === "success" || o.status === "error") {
            return undefined;
        }
        return o.status;
    }
    return undefined;
}

export const MakePayment = ({
    stateProps,
    handleBackButtonClick,
}: {
    stateProps: TransactionPreviewProps["stateProps"];
    handleBackButtonClick: () => void;
}) => {
    const {
        formValues,
        setTransactionStatus,
        setCreatedAt,
        orderId,
        onrampPaymentAccount,
    } = stateProps;
    const { getAccessToken } = usePrivy();
    const { setCurrentStep } = useStep();
    const { amountSent, currency } = formValues;

    const [paymentDetails, setPaymentDetails] =
        useState<OnrampPaymentInstructions | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [timeRemaining, setTimeRemaining] = useState<string>("");
    const [sessionExpired, setSessionExpired] = useState(false);
    const [isAccountNumberCopied, setIsAccountNumberCopied] = useState(false);
    const [isAmountCopied, setIsAmountCopied] = useState(false);
    const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
    /** Wall-clock deadline (ms) for the 30‑minute session; set when payment details first load. */
    const sessionDeadlineMsRef = useRef<number | null>(null);

    useEffect(() => {
        sessionDeadlineMsRef.current = null;
        setSessionExpired(false);

        let cancelled = false;
        const load = async () => {
            setLoadError(null);
            const fallbackAmount = Number(amountSent) || 0;
            const fallbackCurrency = currency || "NGN";

            if (onrampPaymentAccount) {
                if (cancelled) return;
                sessionDeadlineMsRef.current = Date.now() + ONRAMP_CLIENT_PAYMENT_SESSION_MS;
                setPaymentDetails(
                    mapProviderAccountToInstructions(
                        onrampPaymentAccount,
                        fallbackCurrency,
                        fallbackAmount,
                    ),
                );
                return;
            }

            if (!orderId) {
                setLoadError("Missing order. Go back and confirm your payment again.");
                return;
            }

            try {
                const accessToken = await getAccessToken();
                if (!accessToken) {
                    setLoadError("Please sign in to load payment details.");
                    return;
                }
                const res = await fetchV2SenderPaymentOrderById(orderId, accessToken);
                if (cancelled) return;
                if (res.status !== "success" || !res.data?.providerAccount) {
                    throw new Error(res.message || "Could not load payment instructions");
                }
                sessionDeadlineMsRef.current = Date.now() + ONRAMP_CLIENT_PAYMENT_SESSION_MS;
                setPaymentDetails(
                    mapProviderAccountToInstructions(
                        res.data.providerAccount,
                        fallbackCurrency,
                        fallbackAmount,
                    ),
                );
            } catch (e) {
                if (!cancelled) {
                    setLoadError(
                        e instanceof Error ? e.message : "Failed to load payment details",
                    );
                }
            }
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [orderId, onrampPaymentAccount, amountSent, currency, getAccessToken]);

    // Countdown from client session deadline (not API expiresAt)
    useEffect(() => {
        if (!paymentDetails || sessionExpired) return;
        const deadline = sessionDeadlineMsRef.current;
        if (deadline === null) {
            setTimeRemaining("--:--");
            return;
        }

        const updateTimer = () => {
            const diff = deadline - Date.now();

            if (diff <= 0) {
                setTimeRemaining("00:00");
                setSessionExpired(true);
                setTransactionStatus("expired");
                return;
            }

            const minutes = Math.floor(diff / 60000);
            const seconds = Math.floor((diff % 60000) / 1000);
            setTimeRemaining(
                `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`,
            );
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);

        return () => clearInterval(interval);
    }, [paymentDetails, sessionExpired, setTransactionStatus]);

    // Auto-start: poll aggregator for payment detection (no manual "I sent funds" click)
    useEffect(() => {
        if (sessionExpired) return;
        if (!paymentDetails) return;
        if (!orderId) {
            console.warn("[MakePayment] Missing orderId; staying on bank-details step");
            return;
        }

        setTransactionStatus("pending");
        setCreatedAt(new Date().toISOString());

        let cancelled = false;

        const clearPolling = () => {
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
                pollingIntervalRef.current = null;
            }
        };

        const checkPaymentStatus = async () => {
            if (cancelled) return;
            try {
                const accessToken = await getAccessToken();
                if (!accessToken) throw new Error("No access token");
                const res = await fetchV2SenderPaymentOrderById(orderId, accessToken);
                const status =
                    resolveOnrampOrderStatusFromV2Response(res) ??
                    getOrderStatusFromFetchPayload(res);

                // Only advance when we have a real order status (not undefined) and fiat is indexed
                if (
                    typeof status === "string" &&
                    status.length > 0 &&
                    status.toLowerCase() !== "pending"
                ) {
                    clearPolling();
                    if (cancelled) return;
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
                    setCurrentStep("status");
                }
            } catch (error) {
                console.error("Error checking payment status:", error);
                // Keep polling — do not leave Make payment on transient errors
            }
        };

        void checkPaymentStatus();
        pollingIntervalRef.current = setInterval(checkPaymentStatus, 3000);

        return () => {
            cancelled = true;
            clearPolling();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- stable polling for one order load
    }, [paymentDetails, orderId, getAccessToken, sessionExpired]);

    const currencySymbol = paymentDetails
        ? getCurrencySymbol(paymentDetails.currency)
        : getCurrencySymbol(currency || "NGN");
    const formattedAmount = paymentDetails
        ? `${currencySymbol}${formatNumberWithCommas(paymentDetails.amount)}`
        : "—";

    if (loadError) {
        return (
            <div className="mx-auto grid max-w-[26.0625rem] gap-6 py-10 text-sm">
                <div className="grid gap-4">
                    <h2 className="text-xl font-medium text-text-body dark:text-white/80">
                        Make payment
                    </h2>
                    <p className="text-red-600 dark:text-red-400">{loadError}</p>
                    <button
                        type="button"
                        onClick={handleBackButtonClick}
                        className={classNames(secondaryBtnClasses, "w-full")}
                    >
                        Back
                    </button>
                </div>
            </div>
        );
    }

    if (!paymentDetails) {
        return (
            <div className="mx-auto flex min-h-[12rem] max-w-[26.0625rem] flex-col items-center justify-center gap-3 py-10 text-sm">
                <ImSpinner className="animate-spin text-2xl text-lavender-500" />
                <p className="text-text-secondary dark:text-white/50">Loading payment details…</p>
            </div>
        );
    }

    if (sessionExpired) {
        return (
            <div className="mx-auto grid max-w-[26.0625rem] gap-6 py-10 text-sm">
                <div className="grid gap-4 rounded-[20px] bg-background-neutral p-6 dark:bg-[#202121]">
                    <h2 className="text-xl font-medium text-text-body dark:text-white/80">
                        Session expired
                    </h2>
                    <p className="text-text-secondary dark:text-white/50">
                        This payment window has closed. Start again to get new account details.
                    </p>
                    <button
                        type="button"
                        onClick={handleBackButtonClick}
                        className={classNames(secondaryBtnClasses, "w-full")}
                    >
                        Go home
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="mx-auto grid max-w-[26.0625rem] gap-6 py-10 text-sm">
            {/* Header */}
            <div className="grid gap-4">
                <h2 className="text-xl font-medium text-text-body dark:text-white/80">
                    Make payment
                </h2>
                <p className="text-text-secondary dark:text-white/50">
                    Use the payment details below to make payment
                </p>
            </div>

            {/* Account Details Card */}
            <div className="grid gap-6 rounded-[20px] bg-background-neutral p-4 dark:bg-[#202121]">
                <div className="grid gap-4">
                    <h3 className="text-sm font-medium text-text-body dark:text-white/80">
                        Account Details
                    </h3>

                    <p className="text-sm font-normal text-text-secondary dark:text-white/50">
                        Send {formattedAmount} to the account below
                    </p>
                </div>

                {/* Fields Container */}
                <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white dark:border-white/10 dark:bg-surface-canvas">
                    {/* Provider */}
                    <div className="grid gap-2 px-4 pb-4 pt-4">
                        <label className="text-sm font-normal text-text-secondary dark:text-white/50">
                            Provider Bank
                        </label>
                        <p className="text-sm font-medium text-text-body dark:text-white/80">
                            {paymentDetails.provider}
                        </p>
                    </div>
                    <div className="border-b border-gray-100 dark:border-white/10" />

                    {/* Account Number */}
                    <div className="grid gap-2 px-4 py-4">
                        <label className="text-sm font-normal text-text-secondary dark:text-white/50">
                            Account number
                        </label>
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-text-body dark:text-white/80">
                                {paymentDetails.accountNumber}
                            </p>
                            <button
                                type="button"
                                onClick={async () => {
                                    const ok = await copyToClipboard(
                                        paymentDetails.accountNumber,
                                        "Account number",
                                    );
                                    if (!ok) return;
                                    setIsAccountNumberCopied(true);
                                    setTimeout(() => setIsAccountNumberCopied(false), 2000);
                                }}
                                className="flex items-center justify-center rounded-lg p-1.5 transition-colors hover:bg-gray-100 dark:hover:bg-white/10"
                                title="Copy account number"
                            >
                                {isAccountNumberCopied ? (
                                    <PiCheck className="size-4 text-icon-outline-secondary dark:text-white/50" />
                                ) : (
                                    <Copy01Icon className="size-4 text-icon-outline-secondary dark:text-white/50" />
                                )}
                            </button>
                        </div>
                    </div>
                    <div className="border-b border-gray-100 dark:border-white/10" />

                    {/* Amount */}
                    <div className="grid gap-2 px-4 py-4">
                        <label className="text-sm font-normal text-text-secondary dark:text-white/50">
                            Amount
                        </label>
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-text-body dark:text-white/80">
                                {formattedAmount}
                            </p>
                            <button
                                type="button"
                                onClick={async () => {
                                    const ok = await copyToClipboard(
                                        paymentDetails.amount.toString(),
                                        "Amount",
                                    );
                                    if (!ok) return;
                                    setIsAmountCopied(true);
                                    setTimeout(() => setIsAmountCopied(false), 2000);
                                }}
                                className="flex items-center justify-center rounded-lg p-1.5 transition-colors hover:bg-gray-100 dark:hover:bg-white/10"
                                title="Copy amount"
                            >
                                {isAmountCopied ? (
                                    <PiCheck className="size-4 text-icon-outline-secondary dark:text-white/50" />
                                ) : (
                                    <Copy01Icon className="size-4 text-icon-outline-secondary dark:text-white/50" />
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Expiry Timer */}
                <div>
                    <span className="pr-2 text-sm font-normal text-text-secondary dark:text-white/50">
                        This account is only for this payment. Expires in
                    </span>
                    <span className="rounded-full bg-gray-100 px-2 py-1 font-medium text-lavender-500 dark:bg-surface-canvas dark:text-lavender-500">
                        {timeRemaining}
                    </span>
                </div>
            </div>

            <div className="flex gap-4 xsm:gap-2">
                <button
                    type="button"
                    onClick={handleBackButtonClick}
                    className={secondaryBtnClasses}
                >
                    Back
                </button>
                <div
                    className={classNames(
                        secondaryBtnClasses,
                        "min-h-11 min-w-0 flex-1 cursor-default gap-2 text-text-secondary dark:text-white/50",
                    )}
                    role="status"
                    aria-live="polite"
                >
                    <ImSpinner className="size-4 shrink-0 animate-spin text-lavender-500" />
                    <span className="text-center text-sm leading-snug">
                        Checking payment automatically…
                    </span>
                </div>
            </div>
        </div>
    );
};