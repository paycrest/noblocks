"use client";
import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { InformationSquareIcon } from "hugeicons-react";
import { SearchInput } from "@/app/components/recipient/SearchInput";
import { SelectBankModalProps } from "@/app/components/recipient/types";
import { KES_MPESA_INSTITUTION_CODE } from "@/app/utils";

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
  const selectedKey =
    selectedInstitution?.uiKey ?? selectedInstitution?.code ?? "";

  const popoverRef = useRef<HTMLDivElement>(null);

  // Figma Sell 31/32: an in-drawer popover anchored under the Select bank
  // field (no backdrop, no close button) — it closes on outside click or Esc.
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target)) return;
      // The anchor field toggles the popover itself.
      if ((target as Element).closest?.("[data-select-bank-anchor]")) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={popoverRef}
          role="dialog"
          aria-label="Select bank"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
          className="absolute inset-x-0 top-full z-50 mt-2 flex flex-col gap-3 overflow-hidden rounded-[20px] border-[0.3px] border-border-light bg-white px-4 pb-2 pt-4 font-general-sans shadow-[0px_25px_50px_-12px_rgba(18,18,23,0.25)] dark:border-white/5 dark:bg-surface-overlay"
        >
          <p className="px-1 text-base font-medium leading-6 text-text-body dark:text-white">
            Select bank
          </p>

          <div>
            <SearchInput
              value={bankSearchTerm}
              onChange={setBankSearchTerm}
              placeholder="Search banks"
              autoFocus={isOpen}
            />
          </div>

          {/* Scrollable container for bank list */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2 }}
            className="-mx-2.5 h-[208px] overflow-y-auto"
          >
            {isFetchingInstitutions ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="pt-1 text-center text-sm dark:text-white/50"
              >
                Loading banks...
              </motion.div>
            ) : (
              <motion.ul
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-1"
              >
                {currency ? (
                  filteredInstitutions && filteredInstitutions.length > 0 ? (
                    filteredInstitutions.map((inst) => {
                      const key = inst.uiKey ?? inst.code;
                      return (
                        <motion.li
                          key={key}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2 }}
                          onClick={() => {
                            setSelectedInstitution(inst);
                            onClose();
                            // Always submit the real institution code (SAFAKEPC for all M-Pesa rails).
                            setValue("institution", inst.code, {
                              shouldValidate: true,
                            });
                            setValue("accountType", inst.type, {
                              shouldValidate: true,
                            });
                            if (
                              inst.code === KES_MPESA_INSTITUTION_CODE &&
                              inst.channel
                            ) {
                              setValue("kesChannel", inst.channel, {
                                shouldValidate: true,
                              });
                            } else {
                              setValue("kesChannel", "", {
                                shouldValidate: true,
                              });
                            }
                            setValue("businessNumber", "", {
                              shouldValidate: true,
                            });
                            setIsManualEntry(true);
                          }}
                          className={`flex h-8 cursor-pointer items-center whitespace-nowrap rounded-lg px-3 font-inter text-sm leading-6 text-text-body transition-colors hover:bg-gray-50 dark:text-white/80 dark:hover:bg-white/5 ${
                            selectedKey === key
                              ? "bg-gray-100 dark:bg-white/5"
                              : ""
                          }`}
                        >
                          {inst.name}
                        </motion.li>
                      );
                    })
                  ) : (
                    <motion.li
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-text-secondary dark:text-white/50"
                    >
                      <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm">
                        <InformationSquareIcon className="size-5" />
                        <p className="font-medium">No exact match found</p>
                        <p>
                          No bank with that name found. Please try another
                          search input
                        </p>
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
        </motion.div>
      )}
    </AnimatePresence>
  );
};
