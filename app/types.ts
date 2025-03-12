import type { ReactNode } from "react";

import type {
  FieldErrors,
  UseFormRegister,
  UseFormHandleSubmit,
  UseFormReturn,
  UseFormSetValue,
} from "react-hook-form";

export type InstitutionProps = {
  name: string;
  code: string;
  type: "bank" | "mobile_money";
};

export type FormData = {
  network: string;
  token: string;
  currency: string;
  institution: string;
  accountIdentifier: string;
  recipientName: string;
  accountType: "bank" | "mobile_money";
  memo: string;
  amountSent: number;
  amountReceived: number;
};

export const STEPS = {
  FORM: "form",
  PREVIEW: "preview",
  STATUS: "status",
} as const;

export type Step = (typeof STEPS)[keyof typeof STEPS];

export type TransactionFormProps = {
  onSubmit: any;
  formMethods: UseFormReturn<FormData, any, undefined>;
  stateProps: StateProps;
};

export type TransactionPreviewProps = {
  handleBackButtonClick: () => void;
  stateProps: StateProps;
  createdAt: string;
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
  type: "bank" | "mobile_money";
};

export type FormMethods = {
  handleSubmit: UseFormHandleSubmit<FormData, undefined>;
  register: UseFormRegister<FormData>;
  watch: (name: string) => string | number | undefined;
  formState: {
    errors: FieldErrors<FormData>;
    isValid: boolean;
    isDirty: boolean;
    isSubmitting: boolean;
  };
};

export type TransactionStatusType =
  | "idle"
  | "pending"
  | "processing"
  | "fulfilled"
  | "validated"
  | "settled"
  | "refunded";

export type TransactionStatusProps = {
  transactionStatus: TransactionStatusType;
  orderId: string;
  createdAt: string;
  clearForm: () => void;
  clearTransactionStatus: () => void;
  setTransactionStatus: (status: TransactionStatusType) => void;
  setCurrentStep: (step: Step) => void;
  formMethods: FormMethods;
  supportedInstitutions: InstitutionProps[];
  setOrderId: (orderId: string) => void;
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
  providerId?: string;
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
  setTransactionStatus: (status: TransactionStatusType) => void;
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
  mixpanelToken: string;
  hotjarSiteId: number;
  contactSupportUrl: string;
};

export type Network = {
  chain: any;
  imageUrl: string;
};
