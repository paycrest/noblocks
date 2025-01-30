import type {
  InstitutionProps,
  RecipientDetails,
  RecipientDetailsFormProps,
} from "@/app/types";

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
}

export { type RecipientDetails, type RecipientDetailsFormProps };

export const LOCAL_STORAGE_KEY_RECIPIENTS = "savedRecipients";
