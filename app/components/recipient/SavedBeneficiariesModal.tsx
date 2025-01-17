"use client";
import { Button, Dialog, DialogBackdrop, DialogPanel } from "@headlessui/react";
import { ArrowUp01Icon } from "hugeicons-react";
import { AnimatePresence, motion } from "framer-motion";
import { useState, useMemo } from "react";

import { RecipientListItem } from "./RecipientListItem";
import { SearchInput } from "./SearchInput";
import { SavedBeneficiariesModalProps } from "./types";
import { dropdownVariants } from "../AnimatedComponents";
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
    <Dialog
      open={isOpen}
      as="div"
      className="relative z-20 focus:outline-none"
      onClose={onClose}
    >
      <DialogBackdrop className="fixed inset-0 bg-black/30 backdrop-blur-sm" />

      <div className="fixed inset-0 w-screen overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <DialogPanel
            transition
            className="data-[closed]:transform-[scale(95%)] w-full max-w-md space-y-4 duration-300 ease-out data-[closed]:opacity-0"
          >
            <div className="rounded-2xl bg-white p-4 dark:bg-neutral-900">
              <Button
                className="flex w-full items-center justify-between"
                onClick={onClose}
              >
                <p>Saved beneficiaries</p>
                <ArrowUp01Icon
                  className={classNames(
                    "text-base text-gray-400 transition-transform dark:text-white/50",
                  )}
                />
              </Button>

              <motion.div
                initial="closed"
                animate="open"
                exit="closed"
                variants={dropdownVariants}
                className="scrollbar-hide mt-4 max-h-80 space-y-2 overflow-y-auto"
              >
                {/* Search beneficiaries */}
                <div className="sticky top-0 bg-white pb-2 dark:bg-neutral-900">
                  <SearchInput
                    value={beneficiarySearchTerm}
                    onChange={setBeneficiarySearchTerm}
                    placeholder="Search beneficiaries by name or account number"
                    autoFocus={isOpen}
                  />
                </div>

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
                        transition={{ duration: 0.3 }}
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
                      className="py-4 text-center text-gray-500 dark:text-white/50"
                    >
                      No recipients found
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
};
