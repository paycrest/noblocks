"use client";
import { useEffect, useState } from "react";
import { Copy01Icon } from "hugeicons-react";
import { PiCheck } from "react-icons/pi";
import {
    classNames,
    formatCurrency,
    formatNumberWithCommas,
    copyToClipboard,
} from "../utils";
import { primaryBtnClasses, secondaryBtnClasses } from "../components";
import type { TransactionPreviewProps } from "../types";
import { useStep } from "../context";

interface PaymentAccountDetails {
    provider: string;
    accountNumber: string;
    amount: number;
    currency: string;
    expiresAt: Date;
}

export const MakePayment = ({
    stateProps,
    handleBackButtonClick,
}: {
    stateProps: TransactionPreviewProps["stateProps"];
    handleBackButtonClick: () => void;
}) => {
    const { formValues, rate } = stateProps;
    const { setCurrentStep } = useStep();
    const { amountSent, currency, token, amountReceived } = formValues;

    // Mock payment account details - will be replaced with actual API call
    const [paymentDetails, setPaymentDetails] = useState<PaymentAccountDetails>({
        provider: "(4Bay7 Enterprise)",
        accountNumber: "952157815",
        amount: amountSent || 29000,
        currency: currency || "KES",
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes from now
    });

    const [timeRemaining, setTimeRemaining] = useState<string>("");
    const [isPaymentSent, setIsPaymentSent] = useState(false);
    const [isAccountNumberCopied, setIsAccountNumberCopied] = useState(false);
    const [isAmountCopied, setIsAmountCopied] = useState(false);

    // Calculate time remaining
    useEffect(() => {
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
    }, [paymentDetails.expiresAt]);


    const handlePaymentSent = () => {
        setIsPaymentSent(true);
        // Navigate to status page after payment is sent
        setCurrentStep("status");
    };

    const formattedAmount = `${paymentDetails.currency} ${formatNumberWithCommas(paymentDetails.amount)}`;

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
                        Send to {formattedAmount} to the account below
                    </p>
                </div>

                {/* Fields Container */}
                <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white dark:border-white/10 dark:bg-surface-canvas">
                    {/* Provider */}
                    <div className="grid gap-2 px-4 pb-4 pt-4">
                        <label className="text-sm font-normal text-text-secondary dark:text-white/50">
                            Provider
                        </label>
                        <p className="text-sm font-medium text-text-body dark:text-white/80">
                            Provider Bank {paymentDetails.provider}
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
                    className={classNames(primaryBtnClasses, "w-full")}
                >
                    I have sent the money
                </button>
            </div>
        </div>
    );
};