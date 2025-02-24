"use client";
import Image from "next/image";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { PiSpinnerBold } from "react-icons/pi";
import { Checkbox } from "@headlessui/react";

import {
  AnimatedComponent,
  scaleInOut,
  secondaryBtnClasses,
  fadeInOut,
  slideInOut,
  primaryBtnClasses,
} from "../components";
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
  getExplorerLink,
  getInstitutionNameByCode,
  getSavedRecipients,
} from "../utils";
import { fetchOrderDetails } from "../api/aggregator";
import {
  STEPS,
  type OrderDetailsData,
  type TransactionStatusProps,
} from "../types";
import { useNetwork } from "../context/NetworksContext";
import { useBalance } from "../context/BalanceContext";
import { toast } from "sonner";
import { trackEvent } from "../hooks/analytics";
import { PDFReceipt } from "../components/PDFReceipt";
import { pdf } from "@react-pdf/renderer";
import { LOCAL_STORAGE_KEY_RECIPIENTS } from "../components/recipient/types";
import { CancelCircleIcon, CheckmarkCircle01Icon } from "hugeicons-react";

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
  setTransactionStatus,
  setCurrentStep,
  formMethods,
  supportedInstitutions,
  setOrderId,
}: TransactionStatusProps) {
  const { resolvedTheme } = useTheme();
  const { selectedNetwork } = useNetwork();
  const { refreshBalance, smartWalletBalance } = useBalance();
  const [orderDetails, setOrderDetails] = useState<OrderDetailsData>();
  const [completedAt, setCompletedAt] = useState<string>("");
  const [createdHash, setCreatedHash] = useState("");

  const [isGettingReceipt, setIsGettingReceipt] = useState(false);
  const [addToBeneficiaries, setAddToBeneficiaries] = useState(false);
  const [isTracked, setIsTracked] = useState(false);

  const { watch } = formMethods;
  const token = watch("token") || "";
  const currency = String(watch("currency")) || "USD";
  const amount = watch("amountSent") || 0;
  const fiat = Number(watch("amountReceived")) || 0;
  const recipientName = String(watch("recipientName")) || "";

  useEffect(
    function pollOrderDetails() {
      let intervalId: NodeJS.Timeout;

      const getOrderDetails = async () => {
        try {
          const orderDetailsResponse = await fetchOrderDetails(
            selectedNetwork.chain.id,
            orderId,
          );
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
              clearInterval(intervalId);
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
          // fail silently
        }
      };

      getOrderDetails();
      intervalId = setInterval(getOrderDetails, 5000);

      return () => {
        if (intervalId) clearInterval(intervalId);
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orderId, transactionStatus],
  );

  // Check if the recipient is saved in the beneficiaries list
  useEffect(
    function checkRecipientInBeneficiaries() {
      const savedRecipients = getSavedRecipients(LOCAL_STORAGE_KEY_RECIPIENTS);
      const isRecipientSaved = savedRecipients.some(
        (r: { accountIdentifier: string; institutionCode: string }) =>
          r.accountIdentifier === formMethods.watch("accountIdentifier") &&
          r.institutionCode === formMethods.watch("institution"),
      );
      setAddToBeneficiaries(isRecipientSaved);
    },
    [formMethods],
  );

  useEffect(
    function trackTransactionEvents() {
      if (!isTracked) {
        if (["validated", "settled"].includes(transactionStatus)) {
          trackEvent("Swap completed", {
            Amount: amount,
            "Send token": token,
            "Receive currency": currency,
            "Recipient name": recipientName,
            "Recipient bank": getInstitutionNameByCode(
              String(formMethods.watch("institution")),
              supportedInstitutions,
            ),
            "Noblocks balance": smartWalletBalance?.balances[token] || 0,
            "Swap date": createdAt,
            "Transaction duration": calculateDuration(createdAt, completedAt),
          });
        } else if (transactionStatus === "refunded") {
          trackEvent("Swap failed", {
            Amount: amount,
            "Send token": token,
            "Receive currency": currency,
            "Recipient name": recipientName,
            "Recipient bank": getInstitutionNameByCode(
              String(formMethods.watch("institution")),
              supportedInstitutions,
            ),
            "Noblocks balance": smartWalletBalance?.balances[token] || 0,
            "Swap date": createdAt,
            "Reason for failure": "Transaction failed and refunded",
            "Transaction duration": calculateDuration(createdAt, completedAt),
          });
        }

        setIsTracked(true);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactionStatus, isTracked],
  );

  const StatusIndicator = () => (
    <AnimatePresence mode="wait">
      {["validated", "settled"].includes(transactionStatus) ? (
        <AnimatedComponent variant={scaleInOut} key="settled">
          <CheckmarkCircle01Icon className="size-10" color="#39C65D" />
        </AnimatedComponent>
      ) : transactionStatus === "refunded" ? (
        <AnimatedComponent variant={scaleInOut} key="refunded">
          <CancelCircleIcon className="size-10" color="#F53D6B" />
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
                : transactionStatus === "fulfilled"
                  ? "bg-green-50 text-green-400"
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
    setOrderId("");
    if (transactionStatus === "refunded") {
      setCurrentStep(STEPS.FORM);
    } else {
      window.location.reload();
    }
  };

  // Add or remove the recipient from the beneficiaries list
  const handleAddToBeneficiariesChange = (checked: boolean) => {
    setAddToBeneficiaries(checked);
    if (checked) {
      addBeneficiary();
    } else {
      removeRecipient();
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
    const formattedRecipientName = recipientName
      ? recipientName
          .toLowerCase()
          .split(" ")
          .map((name) => name.charAt(0).toUpperCase() + name.slice(1))
          .join(" ")
      : "";

    if (transactionStatus === "refunded") {
      return (
        <>
          Your transfer of{" "}
          <span className="text-text-body dark:text-white">
            {formatNumberWithCommas(amount)} {token} (
            {formatCurrency(fiat ?? 0, currency, `en-${currency.slice(0, 2)}`)})
          </span>{" "}
          to {formattedRecipientName} was unsuccessful.
          <br />
          <br />
          The stablecoin has been refunded to your account.
        </>
      );
    }

    if (!["validated", "settled"].includes(transactionStatus)) {
      return (
        <>
          Processing payment of{" "}
          <span className="text-text-body dark:text-white">
            {formatNumberWithCommas(amount)} {token} (
            {formatCurrency(fiat ?? 0, currency, `en-${currency.slice(0, 2)}`)})
          </span>{" "}
          to {formattedRecipientName}. Hang on, this will only take a few
          seconds
        </>
      );
    }

    return (
      <>
        Your transfer of{" "}
        <span className="text-text-body dark:text-white">
          {formatNumberWithCommas(amount)} {token} (
          {formatCurrency(fiat ?? 0, currency, `en-${currency.slice(0, 2)}`)})
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
      if (orderDetails) {
        const blob = await pdf(
          <PDFReceipt
            data={orderDetails as OrderDetailsData}
            formData={{
              recipientName,
              accountIdentifier: formMethods.watch(
                "accountIdentifier",
              ) as string,
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
      }
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
        className="flex w-full justify-center gap-[4.5rem]"
      >
        <div className="hidden flex-col gap-2 sm:flex">
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
                {formatNumberWithCommas(amount)} {token}
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
              className="max-w-60 truncate whitespace-nowrap rounded-full bg-gray-50 px-3 py-1 capitalize dark:bg-white/5"
            >
              {(recipientName ?? "").toLowerCase().split(" ")[0]}
            </AnimatedComponent>
          </div>
        </div>

        <div className="flex max-w-xs flex-col items-start gap-4">
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

          <div className="flex w-full items-center gap-2 text-neutral-900 dark:text-white/80 sm:hidden">
            <AnimatedComponent
              variant={slideInOut}
              delay={0.2}
              className="flex items-center gap-2 rounded-full bg-gray-50 px-2 py-1 dark:bg-white/5"
            >
              {token && (
                <Image
                  src={`/logos/${String(token)?.toLowerCase()}-logo.svg`}
                  alt={`${token} logo`}
                  width={14}
                  height={14}
                />
              )}
              <p className="whitespace-nowrap pr-0.5 font-medium">
                {amount} {token}
              </p>
            </AnimatedComponent>
            <Image
              src={`/images/horizontal-stepper${resolvedTheme === "dark" ? "-dark" : ""}.svg`}
              alt="Progress"
              width={200}
              height={200}
              className="-mr-1.5 mt-1 size-auto"
            />
            <AnimatedComponent
              variant={slideInOut}
              delay={0.4}
              className="max-w-28 truncate rounded-full bg-gray-50 px-3 py-1 capitalize dark:bg-white/5"
            >
              {(recipientName ?? "").toLowerCase().split(" ")[0]}
            </AnimatedComponent>
          </div>

          <hr className="w-full border-dashed border-border-light dark:border-white/10 sm:hidden" />

          <AnimatedComponent
            variant={slideInOut}
            delay={0.4}
            className="text-sm leading-normal text-gray-500 dark:text-white/50"
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
                  className="flex w-full flex-wrap gap-3 max-sm:hidden"
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
                  <div className="flex gap-2">
                    <Checkbox
                      checked={addToBeneficiaries}
                      onChange={handleAddToBeneficiariesChange}
                      className="group mt-1 block size-4 flex-shrink-0 cursor-pointer rounded border-2 border-gray-300 bg-transparent data-[checked]:border-lavender-500 data-[checked]:bg-lavender-500 dark:border-white/30 dark:data-[checked]:border-lavender-500"
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
                    <label className="text-text-body dark:text-white/80">
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

          {["validated", "settled", "refunded"].includes(transactionStatus) && (
            <hr className="w-full border-dashed border-border-light dark:border-white/10" />
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
                <hr className="w-full border-dashed border-border-light dark:border-white/10" />

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
                    className={`min-h-9 !rounded-full ${secondaryBtnClasses} flex gap-2 text-neutral-900 dark:text-white/80`}
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
                    className={`min-h-9 !rounded-full ${secondaryBtnClasses} flex gap-2 text-neutral-900 dark:text-white/80`}
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

          <AnimatePresence>
            {["validated", "settled", "refunded"].includes(
              transactionStatus,
            ) && (
              <>
                <AnimatedComponent
                  variant={slideInOut}
                  delay={0.5}
                  className="mt-10 w-full space-y-4 sm:hidden"
                >
                  <div className="flex w-full flex-col gap-3">
                    {["validated", "settled"].includes(transactionStatus) && (
                      <button
                        type="button"
                        onClick={handleGetReceipt}
                        className={classNames(
                          secondaryBtnClasses,
                          "w-full flex-1",
                        )}
                        disabled={isGettingReceipt}
                      >
                        {isGettingReceipt ? "Generating..." : "Get receipt"}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleBackButtonClick}
                      className={classNames(primaryBtnClasses, "w-full flex-1")}
                    >
                      {transactionStatus === "refunded"
                        ? "Retry transaction"
                        : "New payment"}
                    </button>
                  </div>
                </AnimatedComponent>
              </>
            )}
          </AnimatePresence>
        </div>
      </AnimatedComponent>
    </>
  );
}
