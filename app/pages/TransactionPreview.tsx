"use client";
import Image from "next/image";
import { TbCircleDashed, TbInfoSquareRounded } from "react-icons/tb";

import {
  formatCurrency,
  formatNumberWithCommas,
  getInstitutionNameByCode,
} from "../utils";
import type { TransactionPreviewProps } from "../types";
import { primaryBtnClasses, secondaryBtnClasses } from "../components";

/**
 * Renders a preview of a transaction with the provided details.
 *
 * @param handleBackButtonClick - Function to handle the back button click event.
 * @param handlePaymentConfirmation - Function to handle the payment confirmation button click event.
 * @param stateProps - Object containing the form values, rate, institutions, and loading states.
 */
export const TransactionPreview = ({
  handleBackButtonClick,
  stateProps: { formValues, institutions: supportedInstitutions },
}: TransactionPreviewProps) => {
  const {
    amountSent,
    token,
    currency,
    accountIdentifier,
    institution,
    recipientName,
    memo,
    network,
    amountReceived,
  } = formValues;

  // Rendered transaction information
  const renderedInfo = {
    amount: `${formatNumberWithCommas(amountSent ?? 0)} ${token}`,
    totalValue: `${formatCurrency(amountReceived ?? 0, currency, `en-${currency.slice(0, 2)}`)}`,
    recipient: recipientName
      .toLowerCase()
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" "),
    account: `${accountIdentifier} • ${getInstitutionNameByCode(institution, supportedInstitutions)}`,
    description: memo,
    network: network,
  };
  return (
    <div className="grid gap-6 py-10 text-sm">
      <div className="grid gap-4">
        <h2 className="text-xl font-medium text-neutral-900 dark:text-white/80">
          Review transaction
        </h2>
        <p className="text-gray-500 dark:text-white/50">
          Verify transaction details before you send
        </p>
      </div>

      <div className="grid gap-4">
        {/* Render transaction information */}
        {Object.entries(renderedInfo).map(([key, value]) => (
          <div key={key} className="flex items-center justify-between gap-2">
            <h3 className="w-full max-w-28 capitalize text-gray-500 dark:text-white/50 sm:max-w-40">
              {/* Capitalize the first letter of the key */}
              {key === "totalValue" ? "Total value" : key}
            </h3>
            <p className="flex flex-grow items-center gap-1 text-neutral-900 dark:text-white/80">
              {/* Render token logo for amount and fee */}
              {(key === "amount" || key === "fee") && (
                <Image
                  src={`/${token.toLowerCase()}-logo.svg`}
                  alt={`${token} logo`}
                  width={14}
                  height={14}
                />
              )}

              {/* Render network logo for network */}
              {key === "network" && (
                <Image
                  src={`/${value.toLowerCase()}-logo.svg`}
                  alt={`${value} logo`}
                  width={14}
                  height={14}
                />
              )}
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Transaction detail disclaimer */}
      <div className="flex gap-2.5 rounded-xl border border-gray-200 bg-gray-50 p-3 text-gray-500 dark:border-white/10 dark:bg-white/5 dark:text-white/50">
        <TbInfoSquareRounded className="w-8 text-xl" />
        <p>
          Ensure the details above are correct. Failed transaction due to wrong
          details may attract a refund fee
        </p>
      </div>

      <hr className="w-full border-dashed border-gray-200 dark:border-white/10" />

      {/* Confirm and Approve */}

      <p className="text-gray-500 dark:text-white/50">
        To confirm order, you&apos;ll be required to approve these two
        permissions from your wallet
      </p>

      <div className="flex flex-wrap items-center justify-between gap-y-4 text-gray-500 dark:text-white/50">
        <p>
          {/* replace 1 with 2 when the approve state is set to complete */}
          <span>{/* {isGatewayApproved ? 2 : 1} */} 1</span> of 2
        </p>
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2 rounded-full bg-gray-50 px-2 py-1 dark:bg-white/5">
            {/* {isGatewayApproved ? (
                <PiCheckCircleFill className="text-lg text-green-700 dark:text-green-500" />
              ) : ( */}
            <TbCircleDashed className="text-lg" />
            {/* )} */}
            <p className="pr-1">Approve Gateway</p>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-gray-50 px-2 py-1 dark:bg-white/5">
            {/* {isOrderCreated ? (
                <PiCheckCircleFill className="text-lg text-green-700 dark:text-green-500" />
              ) : ( */}
            <TbCircleDashed
              className="text-lg"
              // className={`text-lg ${
              // isGatewayApproved ? "animate-spin" : ""
              // }`}
            />
            {/* )} */}
            <p className="pr-1">Create Order</p>
          </div>
        </div>
      </div>

      {/* CTAs */}
      <div className="flex gap-6">
        <button
          type="button"
          onClick={handleBackButtonClick}
          className={`w-fit ${secondaryBtnClasses}`}
        >
          Back
        </button>
        <button
          type="submit"
          className={`w-full ${primaryBtnClasses}`}
          // disabled={isConfirming}
        >
          {/* {isConfirming ? "Confirming..." : "Confirm payment"} */}
          Confirm payment
        </button>
      </div>
    </div>
  );
};
