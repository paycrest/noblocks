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
    <AnimatePresence>
      {isOpen && (
        <Dialog
          open={isOpen}
          as="div"
          className="relative z-20 focus:outline-none"
          onClose={onClose}
        >
          <DialogBackdrop className="fixed inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="fixed inset-0 w-screen overflow-y-auto">
            <div className="flex min-h-full w-full items-end justify-center sm:items-center sm:p-4">
              <motion.div
                initial={{ y: 20 }}
                animate={{ y: 0 }}
                exit={{ y: 20 }}
                transition={{ duration: 0.3 }}
                className="w-full sm:max-w-md"
              >
                <DialogPanel className="relative h-[28.5rem] w-full max-w-full overflow-hidden rounded-t-[20px] border border-border-light bg-white px-5 pb-6 pt-6 shadow-xl dark:border-white/5 dark:bg-surface-overlay max-sm:pb-12 sm:max-w-md sm:rounded-[20px]">
                  <Button
                    className="flex w-full items-center justify-between"
                    onClick={onClose}
                  >
                    <p>Saved beneficiaries</p>
                    <ArrowUp01Icon
                      className={classNames(
                        "size-5 text-gray-400 transition-transform dark:text-white/50",
                      )}
                    />
                  </Button>

                  <div className="scrollbar-hide mt-4 max-h-80 space-y-2 overflow-y-auto">
                    <SearchInput
                      value={beneficiarySearchTerm}
                      onChange={setBeneficiarySearchTerm}
                      placeholder="Search by name or account number"
                      autoFocus={isOpen}
                    />

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
                          className="py-4 text-center text-gray-500 dark:text-white/50"
                        >
                          No recipients found
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </DialogPanel>
              </motion.div>
            </div>
          </div>
        </Dialog>
      )}
    </AnimatePresence>
  );
};
