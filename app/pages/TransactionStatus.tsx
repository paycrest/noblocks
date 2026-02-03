"use client";
import Image from "next/image";
import { useTheme } from "next-themes";
import { useEffect, useState, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import { ImSpinner } from "react-icons/im";
import { Checkbox } from "@headlessui/react";

import {
  AnimatedComponent,
  scaleInOut,
  secondaryBtnClasses,
  fadeInOut,
  slideInOut,
  fadeUpAnimation,
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
} from "../utils";
import {
  fetchOrderDetails,
  updateTransactionDetails,
  fetchSavedRecipients,
  saveRecipient,
  deleteSavedRecipient,
} from "../api/aggregator";
import { reindexSingleTransaction } from "../lib/reindex";
import {
  STEPS,
  type OrderDetailsData,
  type TransactionStatusProps,
} from "../types";
import { toast } from "sonner";
import { trackEvent } from "../hooks/analytics/client";
import { PDFReceipt } from "../components/PDFReceipt";
import { pdf } from "@react-pdf/renderer";
import { CancelCircleIcon, CheckmarkCircle01Icon } from "hugeicons-react";
import { useBalance, useInjectedWallet, useNetwork } from "../context";
import { usePrivy } from "@privy-io/react-auth";
import { TransactionHelperText } from "../components/TransactionHelperText";
import { useConfetti } from "../hooks/useConfetti";
import { BlockFestCashbackComponent } from "../components/blockfest";
import { useBlockFestClaim } from "../context/BlockFestClaimContext";
import { useRocketStatus } from "../context/RocketStatusContext";
import { isBlockFestActive } from "../utils";

// Allowed tokens for BlockFest cashback
const ALLOWED_CASHBACK_TOKENS = new Set(["USDC", "USDT"]);

// Helper function to check BlockFest eligibility
const isBlockFestEligible = (
  transactionStatus: string,
  claimed: boolean | null,
  orderDetails: any,
  orderId: string | null,
) => {
  const isCampaignActive = isBlockFestActive();
  const isTransactionComplete = ["validated", "settling", "settled"].includes(
    transactionStatus,
  );
  const isUserClaimed = claimed === true;
  const isBaseNetwork = orderDetails?.network?.toLowerCase() === "base";
  const hasValidOrder = Boolean(orderId && orderDetails?.token);
  const isEligibleToken =
    orderDetails?.token && ALLOWED_CASHBACK_TOKENS.has(orderDetails.token);

  return (
    isCampaignActive &&
    isTransactionComplete &&
    isUserClaimed &&
    isBaseNetwork &&
    hasValidOrder &&
    isEligibleToken
  );
};

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
  clearTransactionStatus,
  formMethods,
  supportedInstitutions,
  setOrderId,
}: TransactionStatusProps) {
  const { claimed } = useBlockFestClaim();
  const { resolvedTheme } = useTheme();
  const { selectedNetwork } = useNetwork();
  const { refreshBalance, smartWalletBalance, injectedWalletBalance } =
    useBalance();
  const { isInjectedWallet, injectedAddress } = useInjectedWallet();
  const { user, getAccessToken } = usePrivy();
  const { setRocketStatus } = useRocketStatus();

  const embeddedWallet = user?.linkedAccounts.find(
    (account) =>
      account.type === "wallet" && account.connectorType === "embedded",
  ) as { address: string } | undefined;

  const [orderDetails, setOrderDetails] = useState<OrderDetailsData>();
  const [completedAt, setCompletedAt] = useState<string>("");
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

  const fireConfetti = useConfetti();

  const { watch } = formMethods;
  const token = watch("token") || "";
  const currency = String(watch("currency")) || "USD";
  const amount = watch("amountSent") || 0;
  const fiat = Number(watch("amountReceived")) || 0;
  const recipientName = String(watch("recipientName")) || "";
  const accountIdentifier = watch("accountIdentifier") || "";
  const institution = watch("institution") || "";

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
            r.accountIdentifier === accountIdentifier &&
            r.institutionCode === institution,
        );
        setIsRecipientInBeneficiaries(exists);
      } catch (error) {
        console.error("Error checking if recipient exists:", error);
        setIsRecipientInBeneficiaries(false);
      }
    };

    checkRecipientExists();
  }, [accountIdentifier, institution, getAccessToken]);

  /**
   * Updates transaction status in the backend
   * Uses a request ID system to handle race conditions when multiple updates are triggered
   * Only the latest update attempt will complete, older ones will be skipped
   */
  const saveTransactionData = async () => {
    if (!embeddedWallet?.address) return;

    // Increment request ID to mark this as the latest request
    const requestId = ++latestRequestIdRef.current;

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("No access token available");
      }

      // Get the stored transaction ID
      const transactionId = localStorage.getItem("currentTransactionId");
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
        status: transactionStatus,
        txHash:
          transactionStatus !== "refunded" ? createdHash : orderDetails?.txHash,
        timeSpent,
        accessToken,
        walletAddress: embeddedWallet.address,
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
   * Saves transaction data when status is final (validated/settled/refunded)
   */
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
            const status = orderDetailsResponse.data.status;

            // Update transaction status if changed
            if (transactionStatus !== status) {
              setTransactionStatus(
                status as
                  | "fulfilling"
                  | "validated"
                  | "settling"
                  | "settled"
                  | "refunding"
                  | "refunded",
              );
            }

            // Handle final statuses
            if (["validated", "settling", "settled", "refunding", "refunded"].includes(status)) {
              setCompletedAt(orderDetailsResponse.data.updatedAt);

              if (["refunding", "refunded"].includes(status)) {
                refreshBalance();
                setRocketStatus("pending");
              } else {
                setRocketStatus("settled");
              }

              clearInterval(intervalId);

              // Save transaction data only once on validation or refund
              if (["validated", "refunded"].includes(transactionStatus)) {
                saveTransactionData();
              }
              return; // No need to check further statuses
            }

            // Handle processing status
            if (status === "fulfilling") {
              const createdReceipt = orderDetailsResponse.data.txReceipts.find(
                (txReceipt) => txReceipt.status === "pending",
              );
              if (createdReceipt) {
                setCreatedHash(createdReceipt.txHash);
                saveTransactionData();
              }
              setRocketStatus("processing");
              return;
            }

            // Handle fulfilled status
            if (status === "fulfilled") {
              setRocketStatus("fulfilled");
              return;
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
          ? smartWalletBalance?.balances[token] || 0
          : injectedWalletBalance?.balances[token] || 0;

        const eventData = {
          Amount: amount,
          "Send token": token,
          "Receive currency": currency,
          "Recipient bank": bankName,
          "Wallet balance": balance,
          "Swap date": createdAt,
          "Transaction duration": calculateDuration(createdAt, completedAt),
          "Wallet type": isInjectedWallet ? "Injected" : "Smart wallet",
        };


        if (["validated", "settled"].includes(transactionStatus)) {
          trackEvent("Swap completed", {
            ...eventData,
            transaction_status: transactionStatus,
          });
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
      if (
        ["validated", "settling", "settled"].includes(transactionStatus) &&
        !hasShownConfetti
      ) {
        fireConfetti();
        setHasShownConfetti(true);
      }
    },
    [transactionStatus, fireConfetti, hasShownConfetti],
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
   * Renders the appropriate status indicator based on transaction status
   * Shows checkmark for success, X for failure, or spinner for pending states
   */
  const StatusIndicator = () => (
    <AnimatePresence mode="wait">
      {["validated", "settling", "settled"].includes(transactionStatus) ? (
        <AnimatedComponent variant={scaleInOut} key="settled">
          <CheckmarkCircle01Icon className="size-10" color="#39C65D" />
        </AnimatedComponent>
      ) : ["refunding", "refunded"].includes(transactionStatus) ? (
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
              : transactionStatus === "fulfilling"
                ? "bg-yellow-50 text-yellow-400"
                : transactionStatus === "fulfilled"
                  ? "bg-green-50 text-green-400"
                  : transactionStatus === "refunding"
                    ? "bg-purple-50 text-purple-400"
                    : "bg-gray-50"
          }`}
        >
          <ImSpinner className="animate-spin" />
          <p>{transactionStatus === "fulfilling" ? "processing" : transactionStatus}</p>
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
      setCurrentStep(STEPS.FORM);
    } else {
      window.location.reload();
    }
  };

  const handleAddToBeneficiariesChange = async (checked: boolean) => {
    setAddToBeneficiaries(checked);
    if (checked) {
      await addBeneficiary();
    } else {
      await removeRecipient();
    }
  };

  const addBeneficiary = async () => {
    setIsSavingRecipient(true);

    const institutionCode = formMethods.watch("institution");
    if (!institutionCode) {
      setIsSavingRecipient(false);
      return;
    }

    const institutionName = getInstitutionNameByCode(
      String(institutionCode),
      supportedInstitutions,
    );

    if (!institutionName) {
      console.error("Institution name not found");
      setIsSavingRecipient(false);
      return;
    }

    const newRecipient = {
      name: recipientName,
      institution: institutionName,
      institutionCode: String(institutionCode),
      accountIdentifier: String(formMethods.watch("accountIdentifier") || ""),
      type:
        (formMethods.watch("accountType") as "bank" | "mobile_money") || "bank",
    };

    // Save recipient via API
    const accessToken = await getAccessToken();
    if (accessToken) {
      try {
        const success = await saveRecipient(newRecipient, accessToken);
        if (success) {
          // Show success state
          setIsSavingRecipient(false);
          setShowSaveSuccess(true);

          // Hide after 2 seconds with fade out animation
          setTimeout(() => {
            setShowSaveSuccess(false);
            // Add a small delay to allow fade out animation to complete
            setTimeout(() => {
              setIsRecipientInBeneficiaries(true);
            }, 300);
          }, 2000);
        } else {
          setIsSavingRecipient(false);
        }
      } catch (error) {
        console.error("Error saving recipient:", error);
        setIsSavingRecipient(false);
      }
    } else {
      setIsSavingRecipient(false);
    }
  };

  const removeRecipient = async () => {
    const accountIdentifier = formMethods.watch("accountIdentifier");
    const institutionCode = formMethods.watch("institution");

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
          r.accountIdentifier === accountIdentifier &&
          r.institutionCode === institutionCode,
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

    if (transactionStatus === "refunding") {
      return (
        <>
          Refunding{" "}
          <span className="text-text-body dark:text-white">
            {formatNumberWithCommas(amount)} {token} (
            {formatCurrency(fiat ?? 0, currency, `en-${currency.slice(0, 2)}`)})
          </span>{" "}
          to your account. Hang on, this will only take a few seconds.
        </>
      );
    }

    if (!["validated", "settling", "settled"].includes(transactionStatus)) {
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
    <div className="flex w-full justify-center gap-[4.5rem]">
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

      <div className="flex flex-col items-start gap-4 sm:max-w-xs">
        <StatusIndicator />

        <AnimatedComponent
          variant={slideInOut}
          delay={0.2}
          className="text-xl font-medium text-neutral-900 dark:text-white/80"
        >
          {["refunding", "refunded"].includes(transactionStatus)
            ? "Oops! Transaction failed"
            : !["validated", "settling", "settled"].includes(transactionStatus)
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

        {/* Helper text for long-running transactions */}
        <TransactionHelperText
          isVisible={["fulfilling", "fulfilled", "refunding"].includes(
            transactionStatus,
          )}
          title="Taking longer than expected?"
          message="Your transaction is still processing. You can safely
                  refresh or leave this page - your funds will either be
                  settled or automatically refunded if the transaction
                  fails."
          showAfterMs={60000}
          className="w-full space-y-4"
        />

        <AnimatePresence>
          {["validated", "settled", "refunded"].includes(transactionStatus) && (
            <>
              {/* BlockFest Cashback Component - only when validated/settled and claimed and on Base network */}
              {isBlockFestEligible(
                transactionStatus,
                claimed,
                orderDetails,
                orderId,
              ) && (
                  <AnimatedComponent
                    variant={slideInOut}
                    delay={0.45}
                    className="flex justify-center"
                  >
                    <BlockFestCashbackComponent
                      transactionId={orderId}
                      cashbackPercentage="1%"
                    />
                  </AnimatedComponent>
                )}

              <AnimatedComponent
                variant={slideInOut}
                delay={0.5}
                className="flex w-full flex-wrap gap-3 max-sm:*:flex-1"
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

              {["validated", "settled"].includes(transactionStatus) &&
                !isRecipientInBeneficiaries && (
                  <AnimatePresence mode="wait">
                    {isSavingRecipient ? (
                      <AnimatedComponent
                        key="saving"
                        variant={fadeUpAnimation}
                        className="flex items-center gap-2"
                      >
                        <div className="mt-1 flex h-4 w-4 items-center justify-center">
                          <ImSpinner className="h-4 w-4 animate-spin text-text-body dark:text-white/80" />
                        </div>
                        <span className="text-text-body dark:text-white/80">
                          Saving to beneficiaries...
                        </span>
                      </AnimatedComponent>
                    ) : showSaveSuccess ? (
                      <AnimatedComponent
                        key="success"
                        variant={slideInOut}
                        className="flex items-center gap-2"
                      >
                        <div className="mt-1 flex h-4 w-4 items-center justify-center">
                          <CheckmarkCircle01Icon className="h-4 w-4 text-green-500" />
                        </div>
                        <span className="text-green-600 dark:text-green-400">
                          Saved to beneficiaries!
                        </span>
                      </AnimatedComponent>
                    ) : (
                      <AnimatedComponent
                        key="checkbox"
                        variant={fadeUpAnimation}
                        className="flex gap-2"
                      >
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
                                : "Add to your beneficiaries"}
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
                      </AnimatedComponent>
                    )}
                  </AnimatePresence>
                )}
            </>
          )}
        </AnimatePresence>

        {["validated", "settled", "refunded"].includes(transactionStatus) && (
          <hr className="w-full border-dashed border-border-light dark:border-white/10" />
        )}

        <AnimatePresence>
          {["validated", "settling", "settled", "refunded"].includes(transactionStatus) && (
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
                <p className="flex-1">Transaction status</p>
                <div className="flex flex-1 items-center gap-1">
                  <p
                    className={classNames(
                      transactionStatus === "refunded"
                        ? "text-red-600"
                        : "text-green-600",
                    )}
                  >
                    {transactionStatus === "refunded" ? "Failed" : "Completed"}
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
          {["validated", "settling", "settled"].includes(transactionStatus) &&
            !isBlockFestEligible(
              transactionStatus,
              claimed,
              orderDetails,
              orderId,
            ) && (
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
                    href={`https://warpcast.com/~/compose?text=Yay%21%20I%20just%20swapped%20${token}%20for%20${currency}%20in%20${calculateDuration(createdAt, completedAt)}%20on%20noblocks.xyz`}
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
              </AnimatedComponent>
            )}
        </AnimatePresence>
      </div>
    </div>
  );
}
