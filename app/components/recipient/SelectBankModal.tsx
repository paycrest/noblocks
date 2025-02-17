"use client";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft02Icon,
  ArrowUp01Icon,
  Cancel01Icon,
  InformationSquareIcon,
} from "hugeicons-react";
import { SearchInput } from "./SearchInput";
import { InstitutionProps } from "@/app/types";
import { UseFormSetValue } from "react-hook-form";

export interface SelectBankModalProps {
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
}

export const SelectBankModal = ({
  isOpen,
  onClose,
  filteredInstitutions,
  selectedInstitution,
  setSelectedInstitution,
  setValue,
  setIsManualEntry,
  currency,
  bankSearchTerm,
  setBankSearchTerm,
  isFetchingInstitutions,
}: SelectBankModalProps) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <Dialog
          static
          open={isOpen}
          onClose={onClose}
          className="relative z-[53]"
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm"
          />
          <div className="fixed inset-0 flex w-screen items-end justify-center sm:items-center sm:p-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{
                opacity: 1,
                y: 0,
                transition: { type: "spring", stiffness: 300, damping: 30 },
              }}
              exit={{
                opacity: 0,
                y: 20,
                transition: { type: "spring", stiffness: 300, damping: 30 },
              }}
              className="w-full sm:max-w-md"
            >
              <DialogPanel className="relative h-[28.5rem] w-full overflow-hidden rounded-t-[20px] border border-border-light bg-white shadow-xl dark:border-white/5 dark:bg-surface-overlay sm:h-[20.25rem] sm:rounded-[20px]">
                <motion.div
                  layout
                  transition={{ duration: 0.2, type: "spring" }}
                  className="flex h-full flex-col px-5 pb-12 pt-6 sm:p-4"
                >
                  <div className="flex items-center justify-between">
                    <DialogTitle className="text-lg font-semibold dark:text-white sm:text-base">
                      Select Bank
                    </DialogTitle>
                    <button
                      type="button"
                      title="Close"
                      onClick={onClose}
                      className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10"
                    >
                      <Cancel01Icon className="size-5 text-outline-gray dark:text-white/50" />
                    </button>
                  </div>

                  <div className="mt-3">
                    <SearchInput
                      value={bankSearchTerm}
                      onChange={setBankSearchTerm}
                      placeholder="Search banks..."
                      autoFocus={isOpen}
                    />
                  </div>

                  {/* Scrollable container for bank list */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    transition={{ duration: 0.2 }}
                    className="mt-2 max-h-full overflow-y-auto"
                  >
                    {isFetchingInstitutions ? (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="pt-1 text-center dark:text-white/50"
                      >
                        Loading banks...
                      </motion.div>
                    ) : (
                      <motion.ul
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="space-y-2 pt-1"
                      >
                        {currency ? (
                          filteredInstitutions &&
                          filteredInstitutions.length > 0 ? (
                            filteredInstitutions.map((inst) => (
                              <motion.li
                                key={inst.code}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.2 }}
                                onClick={() => {
                                  setSelectedInstitution(inst);
                                  onClose();
                                  setValue("institution", inst.code, {
                                    shouldValidate: true,
                                  });
                                  setIsManualEntry(true);
                                }}
                                className={`cursor-pointer rounded-lg px-3 py-1.5 text-sm transition-colors hover:bg-gray-100 dark:hover:bg-white/5 ${
                                  selectedInstitution?.code === inst.code
                                    ? "bg-gray-100 dark:bg-white/5"
                                    : ""
                                }`}
                              >
                                {inst.name}
                              </motion.li>
                            ))
                          ) : (
                            <motion.li
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className="mt-8 flex flex-col items-center gap-2 text-center dark:text-white/50"
                            >
                              <InformationSquareIcon className="size-5" />
                              <p className="font-medium">
                                No exact match found
                              </p>
                              <p>Please try another search input</p>
                            </motion.li>
                          )
                        ) : (
                          <motion.li
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="mt-6 text-center dark:text-white/50"
                          >
                            No bank with that name found <br />
                            Please select a currency first
                          </motion.li>
                        )}
                      </motion.ul>
                    )}
                  </motion.div>
                </motion.div>
              </DialogPanel>
            </motion.div>
          </div>
        </Dialog>
      )}
    </AnimatePresence>
  );
};
