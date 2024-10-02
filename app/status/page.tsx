"use client";
import Image from "next/image";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { PiSpinnerBold } from "react-icons/pi";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

import {
  AnimatedComponent,
  scaleInOut,
  secondaryBtnClasses,
  fadeInOut,
  slideInOut,
  Preloader,
  primaryBtnClasses,
  TransactionReceipt,
} from "../components";
import "../status/page.css";
import { useRouter } from "next/navigation";
import { Checkbox, Field, Label } from "@headlessui/react";
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
import { classNames } from "../utils";

// Mock data
const mockData = {
  recipientName: "John Doe",
  orderId: "23afb1caffcc0fcd29f1fedbf87f4ac8f7319a06084699cf3a135bb4bc958da9",
  createdAt: "2024-09-16T10:00:00Z",
  token: "USDT",
  amount: "13.5",
  completedAt: "2024-09-16T10:05:00Z",
  createdHash: "0x1234567890abcdef",
  currency: "GHS",
  accountIdentifier: "1234567890",
  institution: "Bank of Ghana",
  description: "Payment for goods",
};

export default function TransactionStatus() {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const [transactionStatus, setTransactionStatus] = useState<
    | "idle"
    | "pending"
    | "processing"
    | "fulfilled"
    | "validated"
    | "settled"
    | "refunded"
  >("idle");
  const [enabled, setEnabled] = useState(false);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [isGettingReceipt, setIsGettingReceipt] = useState(false);

  const getImageSrc = () => {
    const base = !["validated", "settled", "refunded", "fulfilled"].includes(
      transactionStatus,
    )
      ? "/images/stepper"
      : "/images/stepper-long";
    const themeSuffix = resolvedTheme === "dark" ? "-dark.svg" : ".svg";
    return base + themeSuffix;
  };

  const receiptRef = useRef<HTMLDivElement | null>(null);

  const handleGetReceipt = async () => {
    setIsGettingReceipt(true);
    if (receiptRef.current) {
      const canvas = await html2canvas(receiptRef.current);
      const imgData = canvas.toDataURL("image/png");

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "px",
        format: [canvas.width, canvas.height],
      });

      pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);

      const pdfBlob = pdf.output("blob");
      const pdfUrl = URL.createObjectURL(pdfBlob);

      window.open(pdfUrl, "_blank");
    }
    setIsGettingReceipt(false);
  };

  useEffect(() => {
    setIsPageLoading(false);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setTransactionStatus((prevStatus) => {
        switch (prevStatus) {
          case "pending":
            return "processing";
          case "processing":
            return "fulfilled";
          case "fulfilled":
            return "refunded";
          case "refunded":
            return "pending";
          default:
            return "pending";
        }
      });
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  const StatusIndicator = () => (
    <AnimatePresence mode="wait">
      {["validated", "settled", "fulfilled"].includes(transactionStatus) ? (
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

  const getPaymentMessage = () => {
    if (transactionStatus === "refunded") {
      return (
        <>
          Your transfer of{" "}
          <span className="text-neutral-900 dark:text-white">
            {mockData.amount} {mockData.token}
          </span>{" "}
          to {mockData.recipientName} was unsuccessful
          <br />
          Token will be refunded to your account
        </>
      );
    } else if (
      !["validated", "settled", "fulfilled"].includes(transactionStatus)
    ) {
      return `Processing payment to ${mockData.recipientName}. Hang on, this will only take a few seconds.`;
    } else {
      return (
        <>
          Your transfer of{" "}
          <span className="text-neutral-900 dark:text-white">
            {mockData.amount} {mockData.token}
          </span>{" "}
          to {mockData.recipientName} has been completed successfully.
        </>
      );
    }
  };

  return (
    <>
      <Preloader isLoading={isPageLoading} />

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
              <Image
                src={`/${mockData.token.toLowerCase()}-logo.svg`}
                alt={`${mockData.token} logo`}
                width={14}
                height={14}
              />
              <p className="whitespace-nowrap pr-4 font-medium">
                {mockData.amount} {mockData.token}
              </p>
            </AnimatedComponent>
            <Image
              src={isPageLoading ? "" : getImageSrc()}
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
              {mockData.recipientName.toLowerCase().split(" ")[0]}
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
              : !["validated", "settled", "fulfilled"].includes(
                    transactionStatus,
                  )
                ? "Processing payment..."
                : "Transaction successful"}
          </AnimatedComponent>

          {!["validated", "settled", "fulfilled"].includes(
            transactionStatus,
          ) && (
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
            {["validated", "settled", "refunded", "fulfilled"].includes(
              transactionStatus,
            ) && (
              <>
                <AnimatedComponent
                  variant={slideInOut}
                  delay={0.5}
                  className="flex w-full gap-3"
                >
                  {["validated", "settled", "fulfilled"].includes(
                    transactionStatus,
                  ) && (
                    <button
                      type="button"
                      onClick={handleGetReceipt}
                      className={`w-fit ${secondaryBtnClasses}`}
                      disabled={isGettingReceipt}
                    >
                      {isGettingReceipt
                        ? "Generating receipt..."
                        : "Get receipt"}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => router.push("/")}
                    className={`w-fit ${primaryBtnClasses}`}
                  >
                    {transactionStatus === "refunded"
                      ? "Retry transaction"
                      : "New payment"}
                  </button>
                </AnimatedComponent>

                <AnimatedComponent
                  variant={slideInOut}
                  delay={0.6}
                  className="flex w-full gap-3"
                >
                  {["validated", "settled", "fulfilled"].includes(
                    transactionStatus,
                  ) && (
                    <Field className="flex items-center gap-2">
                      <Checkbox
                        checked={enabled}
                        onChange={setEnabled}
                        className="group block size-4 rounded bg-gray-200 data-[checked]:bg-primary dark:bg-neutral-800 dark:data-[checked]:bg-primary"
                      >
                        <svg
                          className="stroke-white opacity-0 group-data-[checked]:opacity-100"
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
                      </Checkbox>
                      <Label className="text-gray-500 dark:text-white/50">
                        Add {mockData.recipientName.split(" ")[0]} to your
                        beneficiaries
                      </Label>
                    </Field>
                  )}
                </AnimatedComponent>
              </>
            )}
          </AnimatePresence>

          {["validated", "settled", "fulfilled"].includes(
            transactionStatus,
          ) && (
            <hr className="w-full border-dashed border-gray-200 dark:border-white/10" />
          )}

          <AnimatePresence>
            {["validated", "settled", "fulfilled", "refunded"].includes(
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
                        ? "Refunded"
                        : "Completed"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-1">
                  <p className="flex-1">Time spent</p>
                  <p className="flex-1">12 seconds</p>
                </div>
                <div className="flex items-center justify-between gap-1">
                  <p className="flex-1">Onchain receipt</p>
                  <p className="flex-1">
                    <a
                      href={`https://basescan.io/tx/${mockData.createdHash}`}
                      className="text-primary hover:underline dark:text-primary"
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
            {["validated", "settled", "fulfilled"].includes(
              transactionStatus,
            ) && (
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
                    Yay! I just sent crypto to a bank account in 12 sec on
                    noblocks.xyz
                  </p>
                  <QuotesBgIcon className="absolute -bottom-1 right-4 size-6" />
                </div>

                <div className="flex items-center gap-3">
                  <a
                    aria-label="Share on Twitter"
                    rel="noopener noreferrer"
                    target="_blank"
                    href="https://x.com/intent/tweet?text=I%20just%20sent%20crypto%20to%20a%20bank%20account%20in%2012%20sec%20on%20noblocks.xyz"
                    className={`!rounded-full ${secondaryBtnClasses} flex gap-2 text-neutral-900 dark:text-white/80`}
                  >
                    {!isPageLoading && resolvedTheme === "dark" ? (
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
                    href="https://warpcast.com/compose?text=Yay%21%20I%20just%20sent%20crypto%20to%20a%20bank%20account%20in%2012%20sec%20on%20noblocks.xyz"
                    className={`!rounded-full ${secondaryBtnClasses} flex gap-2 text-neutral-900 dark:text-white/80`}
                  >
                    {!isPageLoading && resolvedTheme === "dark" ? (
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

      <div className="absolute left-[-9999px] top-[-9999px]">
        <div ref={receiptRef}>
          <TransactionReceipt transaction={mockData} />
        </div>
      </div>
    </>
  );
}
