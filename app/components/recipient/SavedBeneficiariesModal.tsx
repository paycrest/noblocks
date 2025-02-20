"use client";
import { Button, DialogTitle } from "@headlessui/react";
import { InformationSquareIcon, Cancel01Icon } from "hugeicons-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useMemo } from "react";
import { AnimatedModal } from "../AnimatedComponents";

import { RecipientListItem } from "./RecipientListItem";
import { SearchInput } from "./SearchInput";
import { SavedBeneficiariesModalProps } from "./types";
import { classNames } from "@/app/utils";

export const SavedBeneficiariesModal = ({
  isOpen,
  onClose,
  onSelectRecipient,
  savedRecipients,
  onDeleteRecipient,
  recipientToDelete,
  currency,
  institutions,
}: SavedBeneficiariesModalProps) => {
  const [beneficiarySearchTerm, setBeneficiarySearchTerm] = useState("");

  const filteredSavedRecipients = useMemo(() => {
    if (!currency) return [];
    const allRecipients = [...savedRecipients];

    const uniqueRecipients = allRecipients.filter(
      (recipient, index, self) =>
        index ===
        self.findIndex(
          (r) =>
            r.accountIdentifier === recipient.accountIdentifier &&
            r.institutionCode === recipient.institutionCode,
        ),
    );

    const currentBankCodes = institutions.map(
      (institution) => institution.code,
    );
    return uniqueRecipients
      .filter(
        (recipient) =>
          recipient.name
            .toLowerCase()
            .includes(beneficiarySearchTerm.toLowerCase()) ||
          recipient.accountIdentifier.includes(beneficiarySearchTerm),
      )
      .filter((recipient) =>
        currentBankCodes.includes(recipient.institutionCode),
      );
  }, [savedRecipients, beneficiarySearchTerm, currency, institutions]);

  return (
    <AnimatedModal isOpen={isOpen} onClose={onClose} maxWidth="28.5rem">
      <div className="flex items-center justify-between">
        <DialogTitle className="text-lg font-semibold dark:text-white sm:text-base">
          Saved beneficiaries
        </DialogTitle>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close saved beneficiaries modal"
          className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10"
        >
          <Cancel01Icon className="size-5 text-outline-gray dark:text-white/50" />
        </button>
      </div>

      <div className="mt-3">
        <SearchInput
          value={beneficiarySearchTerm}
          onChange={setBeneficiarySearchTerm}
          placeholder="Search by name or account number"
          autoFocus={isOpen}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.2 }}
        className="mt-2 h-[21rem] overflow-y-auto sm:h-[14rem]"
      >
        <AnimatePresence>
          {filteredSavedRecipients.length > 0 ? (
            filteredSavedRecipients.map((recipient, index) => (
              <motion.div
                key={`${recipient.accountIdentifier}-${index}`}
                initial={{ opacity: 1, height: "auto" }}
                exit={{
                  opacity: 0,
                  height: 0,
                  backgroundColor: "#4D2121",
                }}
              >
                <RecipientListItem
                  recipient={recipient}
                  onSelect={onSelectRecipient}
                  onDelete={onDeleteRecipient}
                  isBeingDeleted={recipientToDelete === recipient}
                />
              </motion.div>
            ))
          ) : (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="text-text-secondary dark:text-white/50"
            >
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <InformationSquareIcon className="size-5" />
                <p className="font-medium">No saved beneficiaries found</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatedModal>
  );
};
