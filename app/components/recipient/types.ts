import type {
  InstitutionProps,
  RecipientDetails,
  RecipientDetailsFormProps,
} from "@/app/types";
import { UseFormSetValue } from "react-hook-form";

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

export interface RecipientListItemProps {
  recipient: RecipientDetails;
  onSelect: (recipient: RecipientDetails) => void;
  onDelete: (recipient: RecipientDetails) => void;
  isBeingDeleted: boolean;
  index?: number;
}

export interface SavedBeneficiariesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectRecipient: (recipient: RecipientDetails) => void;
  savedRecipients: RecipientDetails[];
  onDeleteRecipient: (recipient: RecipientDetails) => void;
  recipientToDelete: RecipientDetails | null;
  currency: string;
  institutions: InstitutionProps[];
  isLoading?: boolean;
  error?: string | null;
  isSwapped?: boolean; // For onramp mode
  networkName?: string; // Network name for wallet recipients
}

export type SelectBankModalProps = {
  isOpen: boolean;
  onClose: () => void;
  filteredInstitutions: InstitutionProps[];
  selectedInstitution: InstitutionProps | null;
  setSelectedInstitution: (inst: InstitutionProps | null) => void;
  setValue: UseFormSetValue<any>;
  setIsManualEntry: (value: boolean) => void;
  currency: string;
  bankSearchTerm: string;
  setBankSearchTerm: (val: string) => void;
  isFetchingInstitutions: boolean;
};

export { type RecipientDetails, type RecipientDetailsFormProps };

export const LOCAL_STORAGE_KEY_RECIPIENTS = "savedRecipients";
