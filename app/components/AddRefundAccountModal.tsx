"use client";

import { useEffect, useMemo, useState } from "react";
import { DialogTitle } from "@headlessui/react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown01Icon, ArrowLeft02Icon, Tick02Icon } from "hugeicons-react";
import { ImSpinner } from "react-icons/im";
import { AnimatedModal, AnimatedFeedbackItem } from "@/app/components/AnimatedComponents";
import { SearchInput } from "@/app/components/recipient/SearchInput";
import { InputError } from "@/app/components/InputError";
import type { InstitutionProps, RefundAccountDetails } from "@/app/types";
import { classNames } from "@/app/utils";
import { fetchAccountName } from "@/app/api/aggregator";
import { primaryBtnClasses, secondaryBtnClasses } from "@/app/components/Styles";

export type { RefundAccountDetails };

type Step = "form" | "bank";

type AddRefundAccountModalProps = {
  isOpen: boolean;
  onClose: () => void;
  institutions: InstitutionProps[];
  isFetchingInstitutions: boolean;
  currency: string;
  initial: RefundAccountDetails | null;
  onSave: (data: RefundAccountDetails) => Promise<void>;
  /** Called after the add modal closes following a successful save. */
  onSaved?: () => void;
};

export function AddRefundAccountModal({
  isOpen,
  onClose,
  institutions,
  isFetchingInstitutions,
  currency,
  initial,
  onSave,
  onSaved,
}: AddRefundAccountModalProps) {
  const [step, setStep] = useState<Step>("form");
  const [bankSearchTerm, setBankSearchTerm] = useState("");
  const [selectedInstitution, setSelectedInstitution] =
    useState<InstitutionProps | null>(null);
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [isFetchingAccountName, setIsFetchingAccountName] = useState(false);
  const [accountNumberError, setAccountNumberError] = useState<string | null>(null);
  const [accountNameError, setAccountNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setStep("form");
    setBankSearchTerm("");
    setFormError(null);
    setAccountNumberError(null);
    setAccountNameError(null);
    if (initial) {
      const fromList = institutions.find(
        (i) => i.code === initial.institutionCode,
      );
      setSelectedInstitution(
        fromList ?? {
          code: initial.institutionCode,
          name: initial.institutionName,
          type: "bank",
        },
      );
      setAccountName(initial.accountName);
      setAccountNumber(initial.accountNumber);
    } else {
      setSelectedInstitution(null);
      setAccountName("");
      setAccountNumber("");
    }
    // institutions intentionally omitted from deps to avoid resetting the form if the list refetches while the modal is open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initial]);

  // Auto-fetch account name when institution + account number are ready
  useEffect(() => {
    setAccountName("");
    setAccountNameError(null);

    if (!selectedInstitution || !accountNumber) {
      setAccountNumberError(null);
      return;
    }

    const digits = accountNumber.replace(/\D/g, "");
    const requiredLen = selectedInstitution.code === "SAFAKEPC" ? 6 : 10;

    if (currency === "NGN") {
      if (digits.length === 0) {
        setAccountNumberError(null);
        return;
      }
      if (digits.length !== requiredLen) {
        setAccountNumberError(
          requiredLen === 6
            ? `Please enter a valid 6-digit account number (${digits.length} entered).`
            : `Please enter a valid 10-digit account number (${digits.length} entered).`,
        );
        return;
      }
    }

    setAccountNumberError(null);
    setIsFetchingAccountName(true);

    const timeoutId = setTimeout(async () => {
      try {
        const name = await fetchAccountName({
          institution: selectedInstitution.code,
          accountIdentifier: digits || accountNumber,
        });
        setAccountName(name);
        setAccountNameError(null);
      } catch {
        setAccountNameError("Account not found. Check the number and bank.");
      } finally {
        setIsFetchingAccountName(false);
      }
    }, 800);

    return () => clearTimeout(timeoutId);
  }, [selectedInstitution, accountNumber, currency]);

  const filteredInstitutions = useMemo(() => {
    const filtered =
      institutions?.filter((item) =>
        item.name.toLowerCase().includes(bankSearchTerm.toLowerCase()),
      ) ?? [];
    return [...filtered].sort((a, b) => {
      if (a.type === "mobile_money" && b.type !== "mobile_money") return -1;
      if (a.type !== "mobile_money" && b.type === "mobile_money") return 1;
      return a.name.localeCompare(b.name);
    });
  }, [institutions, bankSearchTerm]);

  const handleAddAccount = async () => {
    setFormError(null);
    if (!selectedInstitution) {
      setFormError("Please select a bank.");
      return;
    }
    const raw = accountNumber.trim();
    if (!raw) {
      setFormError("Please enter an account number.");
      return;
    }
    const name = accountName.trim();
    if (!name) {
      setFormError("Account name could not be verified. Check the account number.");
      return;
    }

    const payload: RefundAccountDetails = {
      institutionCode: selectedInstitution.code,
      institutionName: selectedInstitution.name,
      accountName: name,
      accountNumber: currency === "NGN" ? raw.replace(/\D/g, "") : raw,
    };

    setIsSaving(true);
    try {
      await onSave(payload);
      onClose();
      requestAnimationFrame(() => onSaved?.());
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Could not save refund account.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const allFieldsFilled =
    selectedInstitution !== null &&
    accountNumber.trim().length > 0 &&
    !accountNumberError &&
    accountName.trim().length > 0 &&
    !isFetchingAccountName &&
    !accountNameError;

  const hasChanges = initial
    ? selectedInstitution?.code !== initial.institutionCode ||
      accountName.trim() !== initial.accountName.trim() ||
      accountNumber.trim() !== initial.accountNumber.trim()
    : true;

  return (
    <AnimatedModal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="27.3125rem"
      contentClassName="!p-6 max-sm:!rounded-t-[28px] sm:!rounded-[28px] dark:!bg-[#202020]"
    >
      {step === "form" ? (
        <>
          <DialogTitle className="text-lg font-semibold leading-snug text-neutral-900 dark:text-white">
            {initial ? "Edit your refund account" : "Add your refund account"}
          </DialogTitle>
          <p className="mt-2 max-w-[22rem] text-sm leading-relaxed text-neutral-500 dark:text-white/50">
            This is where your money returns if a payment fails.
          </p>

          <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 dark:border-white/[0.08] dark:bg-[#202020]">
            <div className="space-y-5">
              {/* 1. Bank */}
              <div>
                <label
                  htmlFor="refund-bank-trigger"
                  className="mb-2 block text-sm font-semibold text-neutral-900 dark:text-white"
                >
                  Bank
                </label>
                <button
                  id="refund-bank-trigger"
                  type="button"
                  onClick={() => {
                    setBankSearchTerm("");
                    setStep("bank");
                  }}
                  className="flex w-full items-center justify-between rounded-xl border border-neutral-200 bg-white px-3.5 py-3 text-left text-sm text-neutral-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25 dark:border-white/[0.12] dark:bg-[#202020] dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-500/35"
                >
                  <span
                    className={
                      selectedInstitution
                        ? "text-neutral-900 dark:text-white"
                        : "text-neutral-400 dark:text-white/40"
                    }
                  >
                    {selectedInstitution?.name ?? "Select bank"}
                  </span>
                  <ArrowDown01Icon
                    className="size-4 shrink-0 text-neutral-400 dark:text-white/45"
                    aria-hidden
                  />
                </button>
              </div>

              {/* 2. Account number */}
              <div>
                <label
                  htmlFor="refund-account-number"
                  className="mb-2 block text-sm font-semibold text-neutral-900 dark:text-white"
                >
                  Account number
                </label>
                <input
                  id="refund-account-number"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="Account number"
                  className={classNames(
                    "w-full rounded-xl border bg-white px-3.5 py-3 text-base text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:ring-2 dark:bg-[#202020] dark:text-white dark:placeholder:text-white/35",
                    accountNumberError
                      ? "border-red-400 focus:border-red-400 focus:ring-red-400/25 dark:border-red-500 dark:focus:border-red-500 dark:focus:ring-red-500/20"
                      : "border-neutral-200 focus:border-blue-500 focus:ring-blue-500/25 dark:border-white/[0.12] dark:focus:border-blue-500 dark:focus:ring-blue-500/35",
                  )}
                />
                {accountNumberError && (
                  <InputError message={accountNumberError} />
                )}
              </div>

              {/* 3. Account name — auto-fetched */}
              <AnimatePresence mode="wait">
                {isFetchingAccountName ? (
                  <div className="flex items-center gap-1 text-gray-400 dark:text-white/50">
                    <AnimatedFeedbackItem className="animate-pulse">
                      <ImSpinner className="size-4 animate-spin" />
                      <p className="text-xs">Verifying account name...</p>
                    </AnimatedFeedbackItem>
                  </div>
                ) : accountName ? (
                  <AnimatedFeedbackItem className="justify-between text-gray-400 dark:text-white/50">
                    <motion.div
                      className="relative overflow-hidden rounded-lg p-0.5"
                      style={{
                        backgroundImage:
                          "linear-gradient(90deg, #CB2DA899, #8250DF46, #FFEB3B99)",
                        backgroundSize: "200% 100%",
                      }}
                      animate={{
                        backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
                      }}
                      transition={{
                        duration: 3,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    >
                      <p className="rounded-md bg-accent-gray px-3 py-1 capitalize text-text-accent-gray dark:bg-surface-overlay dark:text-white/80">
                        {accountName.toLowerCase()}
                      </p>
                    </motion.div>
                    <Tick02Icon className="text-lg text-green-700 dark:text-green-500 max-sm:hidden" />
                  </AnimatedFeedbackItem>
                ) : accountNameError ? (
                  <InputError message={accountNameError} />
                ) : null}
              </AnimatePresence>
            </div>
          </div>

          {formError ? (
            <p
              className="mt-3 text-sm text-red-600 dark:text-red-400"
              role="alert"
            >
              {formError}
            </p>
          ) : null}

          <div className="mt-8 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className={classNames(
                secondaryBtnClasses,
                "flex-1 dark:bg-[#2C2C2C] dark:text-white dark:hover:bg-[#363636]",
              )}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleAddAccount()}
              disabled={isSaving || !allFieldsFilled || !hasChanges}
              className={classNames(primaryBtnClasses, "flex-1")}
            >
              {isSaving ? "Saving…" : initial ? "Save changes" : "Add account"}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-2">
            <button
              type="button"
              aria-label="Back"
              onClick={() => setStep("form")}
              className="rounded-xl p-2 hover:bg-neutral-100 dark:hover:bg-white/10"
            >
              <ArrowLeft02Icon className="size-5 text-neutral-800 dark:text-white" />
            </button>
            <DialogTitle className="text-lg font-semibold text-neutral-900 dark:text-white">
              Select bank
            </DialogTitle>
          </div>

          <SearchInput
            value={bankSearchTerm}
            onChange={setBankSearchTerm}
            placeholder="Search banks..."
            autoFocus
          />

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-1 max-h-[14rem] overflow-y-auto rounded-xl border border-neutral-200 dark:border-white/[0.08] sm:max-h-[18rem]"
          >
            {isFetchingInstitutions ? (
              <p className="py-10 text-center text-sm text-neutral-500 dark:text-white/50">
                Loading banks...
              </p>
            ) : filteredInstitutions.length === 0 ? (
              <p className="py-10 text-center text-sm text-neutral-500 dark:text-white/50">
                No banks found.
              </p>
            ) : (
              <ul className="divide-y divide-neutral-100 dark:divide-white/[0.06]">
                {filteredInstitutions.map((inst) => (
                  <li key={inst.code}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedInstitution(inst);
                        setStep("form");
                      }}
                      className={classNames(
                        "w-full px-3.5 py-3 text-left text-sm text-neutral-900 transition-colors hover:bg-neutral-100 dark:text-white/90 dark:hover:bg-white/[0.06]",
                        selectedInstitution?.code === inst.code
                          ? "bg-neutral-100 dark:bg-white/[0.08]"
                          : "",
                      )}
                    >
                      {inst.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        </>
      )}
    </AnimatedModal>
  );
}
