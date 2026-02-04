import type { ReactNode } from "react";

import type {
  FieldErrors,
  UseFormRegister,
  UseFormHandleSubmit,
  UseFormReturn,
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
  | "fulfilling"
  | "fulfilled"
  | "validated"
  | "settling"
  | "settled"
  | "refunding"
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
  network?: string;
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
  cancellationReasons?: string[];
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
  setFormValues: (values: FormData) => void;
  rate: number;
  setRate: (rate: number) => void;
  isFetchingRate: boolean;
  setIsFetchingRate: (fetching: boolean) => void;
  institutions: InstitutionProps[];
  setInstitutions: (institutions: InstitutionProps[]) => void;
  isFetchingInstitutions: boolean;
  setIsFetchingInstitutions: (fetching: boolean) => void;
  selectedRecipient: RecipientDetails | null;
  setSelectedRecipient: (recipient: RecipientDetails | null) => void;
  setCreatedAt: (createdAt: string) => void;
  orderId: string;
  setOrderId: (orderId: string) => void;
  setTransactionStatus: (status: TransactionStatusType) => void;
  rateError: string | null;
  setRateError: (error: string | null) => void;
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
  isNative?: boolean;
};

export type APIToken = {
  symbol: string;
  contractAddress: string;
  decimals: number;
  baseCurrency: string;
  network: string;
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
  thirdwebClientId: string;
  mixpanelToken: string;
  hotjarSiteId: number;
  googleVerificationCode: string;
  noticeBannerText?: string; // Optional, for dynamic notice banner text
  brevoConversationsId: string; // Brevo chat widget ID
  brevoConversationsGroupId?: string; // Brevo chat widget group ID for routing
  blockfestEndDate: string; // BlockFest campaign end date
};

export type Network = {
  chain: any;
  imageUrl:
  | string
  | {
    light: string;
    dark: string;
  };
};

export interface TransactionResponse {
  success: boolean;
  data: {
    total: number;
    page: number;
    limit: number;
    transactions: TransactionHistory[];
  };
}

export interface SaveTransactionResponse {
  success: boolean;
  data: TransactionHistory;
}

// tx history API endpoints types
export type TransactionStatus =
  | "completed"
  | "pending"
  | "processing"
  | "fulfilled"
  | "refunding"
  | "refunded";
export type TransactionHistoryType = "swap" | "transfer";

export interface Recipient {
  account_name: string;
  institution: string;
  account_identifier: string;
  memo?: string;
}

export interface TransactionHistory {
  id: string;
  wallet_address: string;
  transaction_type: TransactionHistoryType;
  from_currency: string;
  to_currency: string;
  amount_sent: number;
  amount_received: number;
  fee: number;
  recipient: Recipient;
  status: TransactionStatus;
  network: string;
  tx_hash?: string;
  time_spent?: string;
  created_at: string;
  updated_at: string;
  order_id?: string;
  refund_reason?: string | null;
}

export interface TransactionCreateInput {
  walletAddress: string;
  transactionType: TransactionHistoryType;
  fromCurrency: string;
  toCurrency: string;
  amountSent: number;
  amountReceived: number;
  fee: number;
  recipient: Recipient;
  status: TransactionStatus;
  network: string;
  txHash?: string;
  timeSpent?: string;
  orderId?: string;
  refundReason?: string | null;
}

export interface TransactionUpdateInput {
  status: TransactionStatus;
  timeSpent?: string;
  txHash?: string;
  refundReason?: string | null;
}

export type JWTProvider = "privy" | "thirdweb";

export interface JWTProviderConfig {
  provider: JWTProvider;
  privy?: {
    jwksUrl: string;
    issuer: string;
    algorithms: string[];
  };
  thirdweb?: {
    clientId: string;
    domain: string;
  };
}

export interface JWTPayload {
  sub: string; // User ID (e.g., did:privy:...) or wallet address
  [key: string]: any;
}

export interface VerifyJWTResult {
  payload: JWTPayload;
  provider: JWTProvider;
}

export interface UpdateTransactionStatusPayload {
  transactionId: string;
  status: string;
  accessToken: string;
  walletAddress: string;
}

export interface UpdateTransactionDetailsPayload
  extends UpdateTransactionStatusPayload {
  txHash?: string;
  timeSpent?: string;
  refundReason?: string | null;
}

export type Currency = {
  imageUrl: string;
  name: string;
  label: string;
  disabled?: boolean;
};

// Saved Recipients API Types
export interface RecipientDetailsWithId extends RecipientDetails {
  id: string;
}

export interface SavedRecipientsResponse {
  success: boolean;
  data: RecipientDetailsWithId[];
  error?: string;
}

export interface SaveRecipientResponse {
  success: boolean;
  data: RecipientDetailsWithId;
}

declare global {
  interface Window {
    BrevoConversationsID?: string;
    BrevoConversationsSetup?: {
      groupId: string;
    };
  }
}
