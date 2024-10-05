import type { ReactNode } from "react";
import type { UseFormReturn } from "react-hook-form";

export type InstitutionProps = {
  name: string;
  code: string;
  type: string;
};

export type FormData = {
  network: string;
  token: string;
  currency: string;
  institution: string;
  accountIdentifier: string;
  recipientName: string;
  memo: string;

  amountSent: number;
  amountReceived: number;
};

export type TransactionFormProps = {
  onSubmit: any;
  formMethods: UseFormReturn<FormData, any, undefined>;
  stateProps: StateProps;
};

export type TransactionPreviewProps = {
  handleBackButtonClick: () => void;
  stateProps: StateProps;
};

export type RecipientDetailsFormProps = {
  formMethods: UseFormReturn<FormData, any, undefined>;
  stateProps: StateProps;
};

export type RecipientDetails = {
  name: string;
  institution: string;
  institutionCode: string;
  accountIdentifier: string;
};

export type TransactionStatusProps = {
  transactionStatus:
    | "idle"
    | "pending"
    | "processing"
    | "fulfilled"
    | "validated"
    | "settled"
    | "refunded";
  recipientName: string;
  orderId: string;
  createdAt: string;
  clearForm: () => void;
  clearTransactionStatus: () => void;
  setTransactionStatus: (
    status:
      | "idle"
      | "pending"
      | "processing"
      | "fulfilled"
      | "validated"
      | "settled"
      | "refunded",
  ) => void;
  formMethods: UseFormReturn<FormData, any, undefined>;
};

export type SelectFieldProps = {
  id: string;
  label: string;
  options: { value: string; label: string; disabled?: boolean }[];
  validation: any;
  errors: any;
  register: any;
  isLoading?: boolean;
  value?: string | number | undefined;
  defaultValue?: string;
  title?: string;
};

export type VerifyAccountPayload = {
  institution: string;
  accountIdentifier: string;
};

export type RatePayload = {
  token: string;
  amount?: number;
  currency: string;
};

export type RateResponse = {
  status: string;
  data: number;
  message: string;
};

export type PubkeyResponse = {
  status: string;
  data: string;
  message: string;
};

type OrderStatusData = {
  orderId: string;
  amount: string;
  token: string;
  network: string;
  settlePercent: string;
  status: string;
  txHash: string;
  settlements: Settlement[];
  txReceipts: TxReceipt[];
  updatedAt: string;
};

type Settlement = {
  splitOrderId: string;
  amount: string;
  rate: string;
  orderPercent: string;
};

type TxReceipt = {
  status: string;
  txHash: string;
  timestamp: string;
};

export type OrderStatusResponse = {
  status: string;
  message: string;
  data: OrderStatusData;
};

export type StateProps = {
  formValues: FormData;
  rate: number;
  isFetchingRate: boolean;
  institutions: InstitutionProps[];
  isFetchingInstitutions: boolean;
  selectedRecipient: RecipientDetails | null;
  setSelectedRecipient: (recipient: RecipientDetails | null) => void;
};

export type NetworkButtonProps = {
  network: string;
  logo: string;
  alt: string;
  selectedNetwork: string;
  handleNetworkChange: (network: string) => void;
  disabled?: boolean;
};

export type TabButtonProps = {
  tab: string;
  selectedTab: string;
  handleTabChange: (tab: string) => void;
};

export type AnimatedComponentProps = {
  children: ReactNode;
  variant?: { initial: any; animate: any; exit: any };
  className?: string;
  delay?: number;
};

export type Token = {
  name: string;
  symbol: string;
  decimals: number;
  address: string;
};

export type InitiateKYCPayload = {
  signature: string;
  walletAddress: string;
  nonce: string;
};

export type InitiateKYCResponse = {
  status: string;
  message: string;
  data: {
    url: string;
    expiresAt: string;
  };
};

export type KYCStatusResponse = {
  status: string;
  message: string;
  data: {
    status: string;
  };
};
