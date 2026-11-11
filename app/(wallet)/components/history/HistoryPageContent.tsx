"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { ArrowDown01Icon, Cancel01Icon, Search01Icon } from "hugeicons-react";
import { FlexibleDropdown, type DropdownItem } from "@/app/components/FlexibleDropdown";
import TransactionList from "@/app/components/transaction/TransactionList";
import { TransactionDetails } from "@/app/components/transaction/TransactionDetails";
import { useTransactions } from "@/app/context/TransactionsContext";
import type { TransactionHistory } from "@/app/types";
import {
  HISTORY_FILTER_CHIPS,
  HISTORY_FILTER_TYPES,
  HISTORY_STATUS_OPTIONS,
  sanitizeHistorySearch,
  type HistoryFilterChip,
  type TransactionHistoryFilters,
} from "@/app/lib/transactionHistoryFilters";
import { classNames } from "@/app/utils";
import { useIsBelowMd } from "../useIsBelowMd";

const STATUS_DROPDOWN_ITEMS: DropdownItem[] = HISTORY_STATUS_OPTIONS.map(
  (option) => ({ name: option.label, label: option.label }),
);

export function HistoryPageContent() {
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeChip, setActiveChip] = useState<HistoryFilterChip>("All");
  const [statusLabel, setStatusLabel] = useState(HISTORY_STATUS_OPTIONS[0].label);
  const [selectedTransaction, setSelectedTransaction] =
    useState<TransactionHistory | null>(null);

  const { transactions, total, isLoading, error } = useTransactions();
  const columnRef = useRef<HTMLDivElement | null>(null);
  const isBelowMd = useIsBelowMd();
  const [panelPosition, setPanelPosition] = useState<CSSProperties | null>(null);

  useEffect(() => {
    const id = setTimeout(
      () => setDebouncedSearch(sanitizeHistorySearch(searchInput)),
      300,
    );
    return () => clearTimeout(id);
  }, [searchInput]);

  const statusOption = useMemo(
    () =>
      HISTORY_STATUS_OPTIONS.find((option) => option.label === statusLabel) ??
      HISTORY_STATUS_OPTIONS[0],
    [statusLabel],
  );

  const chipTypes = HISTORY_FILTER_TYPES[activeChip];
  const noResults = chipTypes === null;

  const filters: TransactionHistoryFilters = useMemo(
    () => ({
      types: chipTypes ?? undefined,
      statuses: statusOption.statuses,
      search: debouncedSearch,
    }),
    [chipTypes, statusOption, debouncedSearch],
  );

  const hasActiveFilters =
    activeChip !== "All" || statusOption.label !== "All statuses" || !!debouncedSearch;

  // The filter row is hidden only for the cold, unfiltered empty state —
  // once any filter is active, zero results means "filtered empty", not "no history yet".
  const isColdEmpty =
    !hasActiveFilters &&
    !noResults &&
    !isLoading &&
    !error &&
    transactions.length === 0 &&
    total === 0;

  useEffect(() => {
    if (!selectedTransaction || isBelowMd) {
      setPanelPosition(null);
      return;
    }
    const updatePosition = () => {
      if (!columnRef.current) return;
      const rect = columnRef.current.getBoundingClientRect();
      setPanelPosition({ top: 95, left: rect.left + 8 });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [selectedTransaction, isBelowMd]);

  return (
    <div ref={columnRef} className="mx-auto w-full max-w-[797px] pt-[22px]">
      <h1 className="font-sans text-2xl font-semibold leading-6 text-neutral-900 dark:text-white">
        Transactions
      </h1>

      {!isColdEmpty && (
        <div className="mt-11 flex h-8 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-[233px] items-center rounded-xl bg-accent-gray px-3 py-1.5 dark:bg-white/5">
              <Search01Icon className="size-4 shrink-0 text-text-secondary/60 dark:text-white/30" />
              <input
                type="text"
                aria-label="Search transactions"
                placeholder="Search by token or address"
                maxLength={64}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full bg-transparent px-2 font-general-sans text-sm leading-5 tracking-[-0.01em] text-text-accent-gray placeholder:text-text-secondary focus:outline-none dark:text-white/80 dark:placeholder:text-white/30"
              />
            </div>

            <div className="flex items-center gap-[14px]">
              {HISTORY_FILTER_CHIPS.map((chip) => {
                const isActive = chip === activeChip;
                return (
                  <button
                    key={chip}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => setActiveChip(chip)}
                    className={classNames(
                      "font-sans text-sm font-medium leading-5 tracking-[-0.01em] text-neutral-900 dark:text-white",
                      isActive
                        ? "flex h-8 items-center rounded-xl bg-gray-100 px-2 py-1.5 dark:bg-white/10"
                        : "h-6 py-0.5 hover:opacity-80",
                    )}
                  >
                    {isActive ? <span className="px-1">{chip}</span> : chip}
                  </button>
                );
              })}
            </div>
          </div>

          <FlexibleDropdown
            data={STATUS_DROPDOWN_ITEMS}
            selectedItem={statusLabel}
            onSelect={setStatusLabel}
            dropdownWidth={180}
            className="!max-h-none"
            mobileTitle="Status"
          >
            {({ toggleDropdown, isOpen }) => (
              <button
                type="button"
                onClick={toggleDropdown}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                className="flex h-8 w-[120px] items-center justify-center gap-1 rounded-xl bg-gray-100 px-2 py-1.5 font-sans text-sm font-medium leading-5 tracking-[-0.01em] text-neutral-900 dark:bg-white/10 dark:text-white"
              >
                {statusLabel}
                <ArrowDown01Icon
                  className={classNames(
                    "size-4 transition-transform",
                    isOpen && "rotate-180",
                  )}
                />
              </button>
            )}
          </FlexibleDropdown>
        </div>
      )}

      <div className={isColdEmpty ? "mt-[29px]" : "mt-[26px]"}>
        <TransactionList
          filters={filters}
          noResults={noResults}
          onSelectTransaction={setSelectedTransaction}
        />
      </div>

      <AnimatePresence>
        {selectedTransaction && (
          <Dialog
            open={!!selectedTransaction}
            onClose={() => setSelectedTransaction(null)}
            className="relative z-50"
            aria-modal="true"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/30 backdrop-blur-[4px]"
            />
            <DialogPanel
              style={panelPosition ?? undefined}
              className={classNames(
                "fixed flex w-[606px] max-w-[calc(100vw-32px)] flex-col gap-5 overflow-y-auto rounded-t-[30px] border-[0.3px] border-border-light bg-white px-5 py-6 shadow-[0_0_6px_#00000005] dark:border-white/10 dark:bg-[#202020]",
                isBelowMd
                  ? "inset-x-0 bottom-0 max-h-[90dvh] w-full"
                  : panelPosition
                    ? "h-[780px] max-h-[calc(100dvh-95px)]"
                    : "left-1/2 top-1/2 h-[780px] max-h-[calc(100dvh-95px)] -translate-x-1/2 -translate-y-1/2",
              )}
            >
              <div className="flex h-6 items-center justify-between">
                <DialogTitle className="font-sans text-lg font-semibold leading-6 text-neutral-900 dark:text-white">
                  Transaction details
                </DialogTitle>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setSelectedTransaction(null)}
                  className="rounded-lg p-1 hover:bg-accent-gray dark:hover:bg-white/10"
                >
                  <Cancel01Icon
                    className="size-5 text-text-secondary dark:text-white/50"
                    strokeWidth={1.5}
                  />
                </button>
              </div>
              <TransactionDetails transaction={selectedTransaction} />
            </DialogPanel>
          </Dialog>
        )}
      </AnimatePresence>
    </div>
  );
}
