import type { ReactNode } from "react";
import type { UseFormReturn } from "react-hook-form";

export type InstitutionProps = {
  name: string;
  code: string;
  type: string;
};

export type FormData = {
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

export type TransactionStatus =
  | "idle"
  | "pending"
  | "processing"
  | "fulfilled"
  | "validated"
  | "settled"
  | "refunded";

export type TransactionStatusProps = {
  transactionStatus: TransactionStatus;
  recipientName: string;
  orderId: string;
  createdAt: string;
  clearForm: () => void;
  clearTransactionStatus: () => void;
  setTransactionStatus: (status: TransactionStatus) => void;
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

export type OrderDetailsResponse = {
  status: string;
  message: string;
  data: OrderDetailsData;
};

export type OrderDetailsData = {
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

export type StateProps = {
  formValues: FormData;
  rate: number;
  isFetchingRate: boolean;
  institutions: InstitutionProps[];
  isFetchingInstitutions: boolean;
  selectedRecipient: RecipientDetails | null;
  setSelectedRecipient: (recipient: RecipientDetails | null) => void;
  setCreatedAt: (createdAt: string) => void;
  setOrderId: (orderId: string) => void;
  setTransactionStatus: (status: TransactionStatus) => void;
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
  imageUrl?: string;
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
    url: string;
  };
};

export type Config = {
  aggregatorUrl: string;
  privyAppId: string;
};
