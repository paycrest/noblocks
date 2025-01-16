"use client";
import Image from "next/image";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { PiSpinnerBold } from "react-icons/pi";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { Checkbox } from "@headlessui/react";

import {
  AnimatedComponent,
  scaleInOut,
  secondaryBtnClasses,
  fadeInOut,
  slideInOut,
  primaryBtnClasses,
  TransactionReceipt,
} from "../components";
import {
  CheckIcon,
  FarcasterIconDarkTheme,
  FarcasterIconLightTheme,
  QuotesBgIcon,
  XFailIcon,
  XIconDarkTheme,
  XIconLightTheme,
  YellowHeart,
} from "../components/ImageAssets";
import {
  calculateDuration,
  classNames,
  formatCurrency,
  getExplorerLink,
  getInstitutionNameByCode,
  getSavedRecipients,
} from "../utils";
import { fetchOrderDetails } from "../api/aggregator";
import type { OrderDetailsData, TransactionStatusProps } from "../types";
import { useNetwork } from "../context/NetworksContext";
import { useBalance } from "../context/BalanceContext";
import { toast } from "sonner";
import { trackEvent } from "../hooks/analytics";
import { format } from "date-fns";
import { PDFReceipt } from "../components/PDFReceipt";
import { pdf } from "@react-pdf/renderer";

const LOCAL_STORAGE_KEY_RECIPIENTS = "savedRecipients";

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
export function TransactionStatus({
  transactionStatus,
  orderId,
  createdAt,
  clearForm,
  clearTransactionStatus,
  setTransactionStatus,
  setCurrentStep,
  formMethods,
  supportedInstitutions,
}: TransactionStatusProps) {
  const { resolvedTheme } = useTheme();
  const { selectedNetwork } = useNetwork();
  const { refreshBalance } = useBalance();
  const [orderDetails, setOrderDetails] = useState<OrderDetailsData>();
  const [completedAt, setCompletedAt] = useState<string>("");
  const [createdHash, setCreatedHash] = useState("");

  const [isGettingReceipt, setIsGettingReceipt] = useState(false);
  const [addToBeneficiaries, setAddToBeneficiaries] = useState(false);
  const [isTracked, setIsTracked] = useState(false);

  const { watch } = formMethods;
  const token = watch("token");
  const currency = watch("currency");
  const amount = watch("amountSent");
  const recipientName = String(watch("recipientName"));

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (["validated", "settled", "refunded"].includes(transactionStatus)) {
      // If order is completed, we can stop polling
      return;
    }

    const getOrderDetails = async () => {
      try {
        const orderDetailsResponse = await fetchOrderDetails(orderId);
        setOrderDetails(orderDetailsResponse.data);

        if (orderDetailsResponse.data.status !== "pending") {
          if (transactionStatus !== orderDetailsResponse.data.status) {
            setTransactionStatus(
              orderDetailsResponse.data.status as
                | "processing"
                | "fulfilled"
                | "validated"
                | "settled"
                | "refunded",
            );
          }

          if (
            ["validated", "settled", "refunded"].includes(
              orderDetailsResponse.data.status,
            )
          ) {
            if (orderDetailsResponse.data.status === "refunded") {
              refreshBalance();
            }
            setCompletedAt(orderDetailsResponse.data.updatedAt);
          }

          if (orderDetailsResponse.data.status === "processing") {
            const createdReceipt = orderDetailsResponse.data.txReceipts.find(
              (txReceipt) => txReceipt.status === "pending",
            );

            if (createdReceipt) {
              setCreatedHash(createdReceipt.txHash);
            }
          }
        }
      } catch (error) {
        console.error("Error fetching order status:", error);
      }
    };

    getOrderDetails();
    intervalId = setInterval(getOrderDetails, 3000);

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [orderId, transactionStatus]);

  // Check if the recipient is saved in the beneficiaries list
  useEffect(() => {
    const savedRecipients = getSavedRecipients(LOCAL_STORAGE_KEY_RECIPIENTS);
    const isRecipientSaved = savedRecipients.some(
      (r: { accountIdentifier: string; institutionCode: string }) =>
        r.accountIdentifier === formMethods.watch("accountIdentifier") &&
        r.institutionCode === formMethods.watch("institution"),
    );
    setAddToBeneficiaries(isRecipientSaved);
  }, [formMethods]);

  useEffect(() => {
    if (!isTracked) {
      if (["validated", "settled"].includes(transactionStatus)) {
        trackEvent("swap_completed", {
          recipient: recipientName,
          amount,
          token,
          network: selectedNetwork.chain.name,
        });

        trackEvent("transaction_completed", {
          recipient: recipientName,
          amount,
          token,
          network: selectedNetwork.chain.name,
        });
      } else if (transactionStatus === "refunded") {
        trackEvent("swap_failed", {
          recipient: recipientName,
          amount,
          token,
          network: selectedNetwork.chain.name,
        });
      }

      trackEvent("transaction_status", {
        status: transactionStatus,
        timestamp: new Date().toISOString(),
      });

      setIsTracked(true);
    }
  }, [transactionStatus, isTracked]);

  const StatusIndicator = () => (
    <AnimatePresence mode="wait">
      {["validated", "settled"].includes(transactionStatus) ? (
        <AnimatedComponent variant={scaleInOut} key="settled">
          <CheckIcon className="size-10" />
        </AnimatedComponent>
      ) : transactionStatus === "refunded" ? (
        <AnimatedComponent variant={scaleInOut} key="refunded">
          <XFailIcon className="size-10" />
        </AnimatedComponent>
      ) : (
        <AnimatedComponent
          variant={fadeInOut}
          key="pending"
          className={`flex items-center gap-1 rounded-full px-2 py-1 dark:bg-white/10 ${
            transactionStatus === "pending"
              ? "bg-orange-50 text-orange-400"
              : transactionStatus === "processing"
                ? "bg-yellow-50 text-yellow-400"
                : "bg-gray-50"
          }`}
        >
          <PiSpinnerBold className="animate-spin" />
          <p>{transactionStatus}</p>
        </AnimatedComponent>
      )}
    </AnimatePresence>
  );

  /**
   * Handles the back button click event.
   * Clears the transaction status if it's refunded, otherwise clears the form and transaction status.
   */
  const handleBackButtonClick = () => {
    if (transactionStatus === "refunded") {
      clearTransactionStatus();

      trackEvent("retry_swap", {
        recipient: recipientName,
        amount,
        token,
        network: selectedNetwork.chain.name,
      });

      trackEvent("post_swap_action", {
        action: "Retried transaction",
      });
    } else {
      clearForm();
      clearTransactionStatus();

      trackEvent("post_swap_action", {
        action: "Returned to swap interface",
      });
    }
    setCurrentStep("form");
  };

  // Add or remove the recipient from the beneficiaries list
  const handleAddToBeneficiariesChange = (checked: boolean) => {
    setAddToBeneficiaries(checked);
    if (checked) {
      addBeneficiary();

      trackEvent("beneficiary_added", {
        recipient: recipientName,
      });
      trackEvent("post_swap_action", {
        action: "Added recipient to beneficiaries",
      });
    } else {
      removeRecipient();

      trackEvent("beneficiary_removed", {
        recipient: recipientName,
      });
      trackEvent("post_swap_action", {
        action: "Removed recipient from beneficiaries",
      });
    }
  };

  const addBeneficiary = () => {
    const institutionCode = formMethods.watch("institution");
    if (!institutionCode) return;
    const institutionName = getInstitutionNameByCode(
      String(institutionCode),
      supportedInstitutions,
    );

    const newRecipient = {
      name: recipientName,
      institution: institutionName,
      institutionCode: institutionCode,
      accountIdentifier: formMethods.watch("accountIdentifier") || "",
      type: formMethods.watch("accountType") || "bank",
    };

    const savedRecipients = getSavedRecipients(LOCAL_STORAGE_KEY_RECIPIENTS);
    const isDuplicate = savedRecipients.some(
      (r: {
        accountIdentifier: string | number;
        institutionCode: string | number;
      }) =>
        r.accountIdentifier === newRecipient.accountIdentifier &&
        r.institutionCode === newRecipient.institutionCode,
    );

    if (!isDuplicate) {
      const updatedRecipients = [...savedRecipients, newRecipient];
      localStorage.setItem(
        LOCAL_STORAGE_KEY_RECIPIENTS,
        JSON.stringify(updatedRecipients),
      );
    }
  };

  const removeRecipient = () => {
    const accountIdentifier = formMethods.watch("accountIdentifier");
    const institutionCode = formMethods.watch("institution");

    const savedRecipients = getSavedRecipients(LOCAL_STORAGE_KEY_RECIPIENTS);

    const updatedRecipients = savedRecipients.filter(
      (r: { accountIdentifier: string; institutionCode: string }) =>
        !(
          r.accountIdentifier === accountIdentifier &&
          r.institutionCode === institutionCode
        ),
    );

    localStorage.setItem(
      LOCAL_STORAGE_KEY_RECIPIENTS,
      JSON.stringify(updatedRecipients),
    );
  };

  const getPaymentMessage = () => {
    const formattedRecipientName =
      recipientName ??
      ""
        .toLowerCase()
        .split(" ")
        .map((name) => name.charAt(0).toUpperCase() + name.slice(1))
        .join(" ");

    if (transactionStatus === "refunded") {
      return (
        <>
          Your transfer of{" "}
          <span className="text-neutral-900 dark:text-white">
            {amount} {token}
          </span>{" "}
          to {formattedRecipientName} was unsuccessful.
          <br />
          <br />
          The stablecoin has been refunded to your account.
        </>
      );
    }

    if (!["validated", "settled"].includes(transactionStatus)) {
      return `Processing payment to ${formattedRecipientName}. Hang on, this will only take a few seconds.`;
    }

    return (
      <>
        Your transfer of{" "}
        <span className="text-neutral-900 dark:text-white">
          {amount} {token}
        </span>{" "}
        to {formattedRecipientName} has been completed successfully.
      </>
    );
  };

  const getImageSrc = () => {
    const base = !["validated", "settled", "refunded"].includes(
      transactionStatus,
    )
      ? "/images/stepper"
      : "/images/stepper-long";
    const themeSuffix = resolvedTheme === "dark" ? "-dark.svg" : ".svg";
    return base + themeSuffix;
  };

  const handleGetReceipt = async () => {
    setIsGettingReceipt(true);
    try {
      // if (orderDetails) {
      const blob = await pdf(
        <PDFReceipt
          data={orderDetails as OrderDetailsData}
          formData={{
            recipientName,
            accountIdentifier: formMethods.watch("accountIdentifier") as string,
            institution: formMethods.watch("institution") as string,
            memo: formMethods.watch("memo") as string,
            amountReceived: formMethods.watch("amountReceived") as number,
            currency: formMethods.watch("currency") as string,
          }}
          supportedInstitutions={supportedInstitutions}
        />,
      ).toBlob();
      const pdfUrl = URL.createObjectURL(blob);
      window.open(pdfUrl, "_blank");
      // }
    } catch (error) {
      toast.error("Error generating receipt. Please try again.");
      console.error("Error generating receipt:", error);
    } finally {
      setIsGettingReceipt(false);
    }
  };

  return (
    <>
      <AnimatedComponent
        variant={slideInOut}
        className="flex w-full justify-between gap-10 text-sm"
      >
        <div className="flex flex-col gap-2">
          <div className="flex w-fit flex-col items-end gap-2 text-neutral-900 dark:text-white/80">
            <AnimatedComponent
              variant={slideInOut}
              delay={0.2}
              className="flex items-center gap-1 rounded-full bg-gray-50 px-2 py-1 dark:bg-white/5"
            >
              {token && (
                <Image
                  src={`/logos/${String(token)?.toLowerCase()}-logo.svg`}
                  alt={`${token} logo`}
                  width={14}
                  height={14}
                />
              )}
              <p className="whitespace-nowrap pr-4 font-medium">
                {amount} {token}
              </p>
            </AnimatedComponent>
            <Image
              src={getImageSrc()}
              alt="Progress"
              width={200}
              height={200}
              className="w-auto"
            />
            <AnimatedComponent
              variant={slideInOut}
              delay={0.4}
              className="whitespace-nowrap rounded-full bg-gray-50 px-2 py-1 capitalize dark:bg-white/5"
            >
              {(recipientName ?? "").toLowerCase().split(" ")[0]}
            </AnimatedComponent>
          </div>
        </div>

        <div className="flex flex-col items-start gap-4">
          <StatusIndicator />

          <AnimatedComponent
            variant={slideInOut}
            delay={0.2}
            className="text-xl font-medium text-neutral-900 dark:text-white/80"
          >
            {transactionStatus === "refunded"
              ? "Oops! Transaction failed"
              : !["validated", "settled"].includes(transactionStatus)
                ? "Processing payment..."
                : "Transaction successful"}
          </AnimatedComponent>

          {!["validated", "settled"].includes(transactionStatus) && (
            <hr className="w-full border-dashed border-gray-200 dark:border-white/10" />
          )}

          <AnimatedComponent
            variant={slideInOut}
            delay={0.4}
            className="font-light leading-normal text-gray-500 dark:text-white/50"
          >
            {getPaymentMessage()}
          </AnimatedComponent>

          <AnimatePresence>
            {["validated", "settled", "refunded"].includes(
              transactionStatus,
            ) && (
              <>
                <AnimatedComponent
                  variant={slideInOut}
                  delay={0.5}
                  className="flex w-full flex-wrap gap-3"
                >
                  {["validated", "settled"].includes(transactionStatus) && (
                    <button
                      type="button"
                      onClick={handleGetReceipt}
                      className={`w-fit ${secondaryBtnClasses}`}
                      disabled={isGettingReceipt}
                    >
                      {isGettingReceipt ? "Generating..." : "Get receipt"}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleBackButtonClick}
                    className={`w-fit ${primaryBtnClasses}`}
                  >
                    {transactionStatus === "refunded"
                      ? "Retry transaction"
                      : "New payment"}
                  </button>
                </AnimatedComponent>
                {["validated", "settled"].includes(transactionStatus) && (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={addToBeneficiaries}
                      onChange={handleAddToBeneficiariesChange}
                      className="group block size-4 flex-shrink-0 cursor-pointer rounded border-2 border-gray-300 bg-transparent data-[checked]:border-lavender-500 data-[checked]:bg-lavender-500 dark:border-white/30 dark:data-[checked]:border-lavender-500"
                    >
                      <svg
                        className="stroke-white/50 opacity-0 group-data-[checked]:opacity-100 dark:stroke-neutral-800"
                        viewBox="0 0 14 14"
                        fill="none"
                      >
                        <title>
                          {addToBeneficiaries
                            ? "Remove from beneficiaries"
                            : "Add to beneficiaries"}
                        </title>
                        <path
                          d="M3 8L6 11L11 3.5"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </Checkbox>
                    <label className="text-gray-500 dark:text-white/50">
                      Add{" "}
                      {(recipientName ?? "")
                        .split(" ")[0]
                        .charAt(0)
                        .toUpperCase() +
                        (recipientName ?? "")
                          .toLowerCase()
                          .split(" ")[0]
                          .slice(1)}{" "}
                      to beneficiaries
                    </label>
                  </div>
                )}
              </>
            )}
          </AnimatePresence>

          {["validated", "settled"].includes(transactionStatus) && (
            <hr className="w-full border-dashed border-gray-200 dark:border-white/10" />
          )}

          <AnimatePresence>
            {["validated", "settled", "refunded"].includes(
              transactionStatus,
            ) && (
              <AnimatedComponent
                variant={{
                  ...fadeInOut,
                  animate: { opacity: 1, height: "auto" },
                  initial: { opacity: 0, height: 0 },
                  exit: { opacity: 0, height: 0 },
                }}
                delay={0.7}
                className="flex w-full flex-col gap-4 text-gray-500 dark:text-white/50"
              >
                <div className="flex items-center justify-between gap-1">
                  <p className="flex-1">Status</p>
                  <div className="flex flex-1 items-center gap-1">
                    {transactionStatus === "refunded" ? (
                      <XFailIcon className="size-4" />
                    ) : (
                      <CheckIcon className="size-4" />
                    )}
                    <p
                      className={classNames(
                        transactionStatus === "refunded"
                          ? "text-red-600"
                          : "text-green-600",
                      )}
                    >
                      {transactionStatus === "refunded"
                        ? "Failed"
                        : "Completed"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-1">
                  <p className="flex-1">Time spent</p>
                  <p className="flex-1">
                    {calculateDuration(createdAt, completedAt)}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-1">
                  <p className="flex-1">Onchain receipt</p>
                  <p className="flex-1">
                    <a
                      href={getExplorerLink(
                        selectedNetwork.chain.name,
                        `${orderDetails?.status === "refunded" ? orderDetails?.txHash : createdHash}`,
                      )}
                      className="text-lavender-500 hover:underline dark:text-lavender-500"
                      target="_blank"
                      rel="noreferrer"
                    >
                      View in explorer
                    </a>
                  </p>
                </div>
              </AnimatedComponent>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {["validated", "settled"].includes(transactionStatus) && (
              <AnimatedComponent
                variant={slideInOut}
                delay={0.8}
                className="w-full space-y-4 text-gray-500 dark:text-white/50"
              >
                <hr className="w-full border-dashed border-gray-200 dark:border-white/10" />

                <p>Help spread the word</p>

                <div className="relative flex items-center gap-3 overflow-hidden rounded-xl bg-gray-50 px-4 py-2 dark:bg-white/5">
                  <YellowHeart className="size-8 flex-shrink-0" />
                  <p>
                    Yay! I just swapped {token} for {currency} in{" "}
                    {calculateDuration(createdAt, completedAt)} on noblocks.xyz
                  </p>
                  <QuotesBgIcon className="absolute -bottom-1 right-4 size-6" />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <a
                    aria-label="Share on Twitter"
                    rel="noopener noreferrer"
                    target="_blank"
                    href={`https://x.com/intent/tweet?text=I%20just%20swapped%20${token}%20for%20${currency}%20in%20${calculateDuration(createdAt, completedAt)}%20on%20noblocks.xyz`}
                    className={`!rounded-full ${secondaryBtnClasses} flex gap-2 text-neutral-900 dark:text-white/80`}
                    onClick={() => {
                      trackEvent("social_share_clicked", {
                        platform: "Twitter",
                      });
                      trackEvent("post_swap_action", {
                        action: "Shared transaction on Twitter",
                      });
                    }}
                  >
                    {resolvedTheme === "dark" ? (
                      <XIconDarkTheme className="size-5" />
                    ) : (
                      <XIconLightTheme className="size-5" />
                    )}
                    X (Twitter)
                  </a>
                  <a
                    aria-label="Share on Warpcast"
                    rel="noopener noreferrer"
                    target="_blank"
                    href={`https://warpcast.com/~/compose?text=Yay%21%20I%20just%20swapped%20${token}%20for%20${currency}%20in%20${calculateDuration(createdAt, completedAt)}%20on%20noblocks.xyz`}
                    className={`!rounded-full ${secondaryBtnClasses} flex gap-2 text-neutral-900 dark:text-white/80`}
                    onClick={() => {
                      trackEvent("social_share_clicked", {
                        platform: "Warpcast",
                      });
                      trackEvent("post_swap_action", {
                        action: "Shared transaction on Warpcast",
                      });
                    }}
                  >
                    {resolvedTheme === "dark" ? (
                      <FarcasterIconDarkTheme className="size-5" />
                    ) : (
                      <FarcasterIconLightTheme className="size-5" />
                    )}
                    Warpcast
                  </a>
                </div>
              </AnimatedComponent>
            )}
          </AnimatePresence>
        </div>
      </AnimatedComponent>
    </>
  );
}
