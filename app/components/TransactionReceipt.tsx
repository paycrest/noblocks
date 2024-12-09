"use client";
import { format } from "date-fns";
import { NoblocksLogo } from "./ImageAssets";
import { formatCurrency, getInstitutionNameByCode } from "../utils";
import { GiCheckMark } from "react-icons/gi";
import { QRCode } from "react-qrcode-logo";
import type { OrderDetailsData, InstitutionProps } from "../types";

const InfoItem = ({ label, value }: { label: string; value: string }) => (
  <div className="space-y-1">
    <p className="text-gray-400">{label}</p>
    <p className="break-all font-normal">{value || "N/A"}</p>
  </div>
);

export const TransactionReceipt = ({
  data,
  formData,
  supportedInstitutions,
}: {
  data: OrderDetailsData;
  formData: {
    recipientName: string;
    accountIdentifier: string;
    institution: string;
    memo: string;
    amountReceived: number;
    currency: string;
  };
  supportedInstitutions: InstitutionProps[];
}) => {
  const {
    recipientName,
    accountIdentifier,
    institution,
    memo,
    amountReceived,
    currency,
  } = formData;

  const institutionName = getInstitutionNameByCode(
    institution,
    supportedInstitutions,
  );

  const formatDate = (dateString: string | number | Date) => {
    const date = new Date(dateString);
    return format(date, "dd MMM, yyyy HH:mm, 'UTC' xxx");
  };

  const infoItems = [
    { label: "To", value: recipientName || "N/A" },
    { label: "Account number", value: accountIdentifier || "N/A" },
    { label: "Bank", value: institutionName || "N/A" },
    { label: "Description", value: memo || "N/A" },
    { label: "Transaction reference", value: data?.orderId || "N/A" },
  ];

  return (
    <div className="mx-auto w-full max-w-2xl border-t-4 border-blue-400 bg-white text-sm text-neutral-900">
      <div className="flex items-center justify-between bg-gray-50 p-4">
        <div className="space-y-2">
          <h1 className="text-base font-medium">Receipt</h1>
          <p className="mb-8 text-gray-400">
            {formatDate(data?.updatedAt || new Date())}
          </p>
        </div>

        <NoblocksLogo className="size-20" />
      </div>

      <div className="p-4">
        <div className="mb-10 mt-5">
          <h2 className="mb-2 text-lg font-semibold">
            {formatCurrency(
              Number(amountReceived || 0),
              currency || "USD",
              `en-${(currency || "USD").slice(0, 2)}`,
            )}
          </h2>
          <div className="flex items-center space-x-1 text-xs font-semibold text-green-700">
            <GiCheckMark />
            <p className="pb-3">Success</p>
          </div>
        </div>

        <div className="mb-10 space-y-3">
          {infoItems.map((item, index) => (
            <InfoItem key={index} label={item.label} value={item.value} />
          ))}
        </div>

        <hr className="w-full border-t-4 border-gray-50" />

        <div className="mb-6 mt-12 flex items-center gap-7">
          <QRCode
            value="https://noblocks.xyz"
            qrStyle="dots"
            eyeRadius={12}
            bgColor="#F9FAFB"
            style={{
              borderRadius: "8px",
              border: "1px solid #EBEBEF",
              maxWidth: "80px",
              width: "100%",
              height: "auto",
            }}
            size={160}
            logoImage="/images/paycrest-qr-logo.svg"
          />

          <div className="text-xl font-bold">
            <p>Make more transactions</p>
            <p>
              on <span className="text-blue-400">noblocks</span>
            </p>
          </div>
        </div>
      </div>

      <p className="bg-gray-50 px-6 py-2.5 text-right text-gray-400">
        noblocks.xyz
      </p>
    </div>
  );
};
