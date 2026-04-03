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
} from "../utils";
import { primaryBtnClasses, secondaryBtnClasses } from "../components";
import type { TransactionPreviewProps, V2FiatProviderAccountDTO } from "../types";
import { useStep, useNetwork } from "../context";
import { fetchOrderDetails, fetchV2SenderPaymentOrderById } from "../api/aggregator";

interface PaymentAccountDetails {
    provider: string;
    accountNumber: string;
    amount: number;
    currency: string;
    expiresAt: Date;
}

function mapProviderAccountToDetails(
    a: V2FiatProviderAccountDTO,
    fallbackCurrency: string,
    fallbackAmount: number,
): PaymentAccountDetails {
    const raw = a.amountToTransfer?.replace(/,/g, "") ?? "";
    const parsed = raw ? parseFloat(raw) : fallbackAmount;
    return {
        provider: a.institution && a.accountName
            ? `${a.institution} | ${a.accountName}`
            : a.institution || a.accountName,
        accountNumber: a.accountIdentifier,
        amount: Number.isFinite(parsed) ? parsed : fallbackAmount,
        currency: a.currency || fallbackCurrency,
        expiresAt: new Date(a.validUntil),
    };
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
    const { selectedNetwork } = useNetwork();
    const { amountSent, currency } = formValues;

    const [paymentDetails, setPaymentDetails] = useState<PaymentAccountDetails | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [timeRemaining, setTimeRemaining] = useState<string>("");
    const [isPaymentSent, setIsPaymentSent] = useState(false);
    const [isCheckingPayment, setIsCheckingPayment] = useState(false);
    const [isAccountNumberCopied, setIsAccountNumberCopied] = useState(false);
    const [isAmountCopied, setIsAmountCopied] = useState(false);
    const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoadError(null);
            const fallbackAmount = Number(amountSent) || 0;
            const fallbackCurrency = currency || "NGN";

            if (onrampPaymentAccount) {
                if (cancelled) return;
                setPaymentDetails(
                    mapProviderAccountToDetails(
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
                setPaymentDetails(
                    mapProviderAccountToDetails(
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

    // Calculate time remaining
    useEffect(() => {
        if (!paymentDetails?.expiresAt) {
            setTimeRemaining("--:--");
            return;
        }
        const updateTimer = () => {
            const now = new Date();
            const diff = paymentDetails.expiresAt.getTime() - now.getTime();

            if (diff <= 0) {
                setTimeRemaining("00:00");
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
    }, [paymentDetails]);

    const handlePaymentSent = async () => {
        setIsPaymentSent(true);
        setIsCheckingPayment(true);

        // Mark the transaction as pending while the aggregator indexes the deposit
        setTransactionStatus("pending");
        setCreatedAt(new Date().toISOString());

        // If no orderId, navigate immediately (shouldn't happen, but safety check)
        if (!orderId) {
            setCurrentStep("status");
            setIsCheckingPayment(false);
            return;
        }

        // Poll backend to check if payment has been detected
        const checkPaymentStatus = async () => {
            try {
                let status: string;

                if (onrampPaymentAccount) {
                    // Onramp: use v2 endpoint
                    const accessToken = await getAccessToken();
                    if (!accessToken) throw new Error("No access token");
                    const res = await fetchV2SenderPaymentOrderById(orderId, accessToken);
                    status = res.data?.status;
                } else {
                    // Offramp: use v1 endpoint
                    const orderDetailsResponse = await fetchOrderDetails(
                        selectedNetwork.chain.id,
                        orderId,
                    );
                    status = orderDetailsResponse.data.status;
                }

                // If status is no longer "pending", payment has been detected
                if (status !== "pending") {
                    // TODO: Validate amount - compare UI input with backend amount
                    // Once backend response structure is known, add validation here:
                    // - Extract fiat amount from orderDetailsResponse.data (check which field contains it)
                    // - Compare with amountSent from UI (Number(amountSent))
                    // Example structure (to be updated based on actual backend response):
                    // const backendAmount = /* extract from backend response */;
                    // const uiAmount = Number(amountSent) || 0;
                    // if (Math.abs(backendAmount - uiAmount) > tolerance) {
                    //     // Handle mismatch
                    // }

                    // Clear polling
                    if (pollingIntervalRef.current) {
                        clearInterval(pollingIntervalRef.current);
                        pollingIntervalRef.current = null;
                    }
                    if (pollingTimeoutRef.current) {
                        clearTimeout(pollingTimeoutRef.current);
                        pollingTimeoutRef.current = null;
                    }

                    // Update status and navigate
                    setTransactionStatus(
                        status as
                        | "fulfilling"
                        | "validated"
                        | "settling"
                        | "settled"
                        | "refunding"
                        | "refunded",
                    );
                    setIsCheckingPayment(false);
                    setCurrentStep("status");
                }
            } catch (error) {
                console.error("Error checking payment status:", error);
                // On error, still navigate to status page (it will handle polling there)
                setIsCheckingPayment(false);
                setCurrentStep("status");
            }
        };

        // Start polling every 3 seconds
        checkPaymentStatus(); // Check immediately
        pollingIntervalRef.current = setInterval(checkPaymentStatus, 3000);

        // Set a timeout to stop polling after 30 seconds and navigate anyway
        pollingTimeoutRef.current = setTimeout(() => {
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
                pollingIntervalRef.current = null;
            }
            setIsCheckingPayment(false);
            setCurrentStep("status");
        }, 30000);
    };

    // Cleanup polling on unmount
    useEffect(() => {
        return () => {
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
            }
            if (pollingTimeoutRef.current) {
                clearTimeout(pollingTimeoutRef.current);
            }
        };
    }, []);

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
                                onClick={() => {
                                    copyToClipboard(
                                        paymentDetails.accountNumber,
                                        "Account number",
                                    );
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
                                onClick={() => {
                                    copyToClipboard(
                                        paymentDetails.amount.toString(),
                                        "Amount",
                                    );
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

            {/* Action Buttons */}
            <div className="flex gap-4 xsm:gap-6">
                <button
                    type="button"
                    disabled
                    className={classNames(
                        secondaryBtnClasses,
                        "w-full cursor-not-allowed text-sm font-normal !bg-yellow-50 !text-yellow-600 opacity-100 dark:!bg-white/10 dark:!text-yellow-500",
                    )}
                >
                    Awaiting payment
                </button>
                <button
                    type="button"
                    onClick={handlePaymentSent}
                    disabled={isPaymentSent}
                    className={classNames(
                        primaryBtnClasses,
                        "w-full",
                        isPaymentSent ? "cursor-not-allowed opacity-50" : "",
                    )}
                >
                    {isPaymentSent ? (
                        <span className="flex items-center justify-center gap-2">
                            <ImSpinner className="animate-spin text-lg" />
                            {isCheckingPayment ? "Checking payment..." : "Processing..."}
                        </span>
                    ) : (
                        "I have sent the money"
                    )}
                </button>
            </div>
        </div>
    );
};