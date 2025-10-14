"use client";
import { DialogTitle } from "@headlessui/react";
import { motion } from "framer-motion";
import { Cancel01Icon, InformationSquareIcon } from "hugeicons-react";
import { AnimatedModal } from "@/app/components/AnimatedComponents";
import { SearchInput } from "@/app/components/recipient/SearchInput";
import { SelectBankModalProps } from "@/app/components/recipient/types";

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
    <AnimatedModal isOpen={isOpen} onClose={onClose} maxWidth="28.5rem">
      <div className="flex items-center justify-between">
        <DialogTitle className="text-lg font-semibold dark:text-white sm:text-base">
          Select institution
        </DialogTitle>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close select institution modal"
          className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10"
        >
          <Cancel01Icon className="size-5 text-outline-gray dark:text-white/50" />
        </button>
      </div>

      <div className="mt-3">
        <SearchInput
          value={bankSearchTerm}
          onChange={setBankSearchTerm}
          placeholder="Search institutions..."
          autoFocus={isOpen}
        />
      </div>

      {/* Scrollable container for bank list */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.2 }}
        className="mt-2 h-84 overflow-y-auto sm:h-56"
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
              filteredInstitutions && filteredInstitutions.length > 0 ? (
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
                  className="text-text-secondary dark:text-white/50"
                >
                  <div className="flex flex-col items-center gap-2 py-12 text-center">
                    <InformationSquareIcon className="size-5" />
                    <p className="font-medium">No banks found</p>
                    <p>Please try another search term</p>
                  </div>
                </motion.li>
              )
            ) : (
              <motion.li
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-6 text-center dark:text-white/50"
              >
                Please select a currency first
              </motion.li>
            )}
          </motion.ul>
        )}
      </motion.div>
    </AnimatedModal>
  );
};
