"use client";
import { ImSpinner } from "react-icons/im";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown01Icon, InformationSquareIcon, Tick02Icon } from "hugeicons-react";

import { AnimatedFeedbackItem } from "../AnimatedComponents";
import { InstitutionProps } from "@/app/types";
import { useOutsideClick } from "@/app/hooks";
import { fetchAccountName } from "@/app/api/aggregator";
import { usePrivy } from "@privy-io/react-auth";
import { InputError } from "@/app/components/InputError";
import { classNames } from "@/app/utils";
import {
  RecipientDetails,
  RecipientDetailsFormProps,
} from "@/app/components/recipient/types";
import type { RecipientDetailsWithId } from "@/app/types";
import {
  fetchSavedRecipients,
  deleteSavedRecipient,
} from "@/app/api/aggregator";
import { SavedBeneficiariesModal } from "@/app/components/recipient/SavedBeneficiariesModal";
import { SelectBankModal } from "@/app/components/recipient/SelectBankModal";

export const RecipientDetailsForm = ({
  formMethods,
  stateProps: {
    isFetchingInstitutions,
    institutions,
    selectedRecipient,
    setSelectedRecipient,
  },
}: RecipientDetailsFormProps) => {
  const {
    watch,
    register,
    setValue,
    formState: { errors },
  } = formMethods;

  const { getAccessToken, ready, authenticated, user } = usePrivy();

  const { currency } = watch();
  const institution = watch("institution");
  const accountIdentifier = watch("accountIdentifier");
  const recipientName = watch("recipientName");

  const [isModalOpen, setIsModalOpen] = useState(false);

  const [isSelectBankModalOpen, setIsSelectBankModalOpen] = useState(false);
  const [bankSearchTerm, setBankSearchTerm] = useState("");

  const [isInstitutionsDropdownOpen, setIsInstitutionsDropdownOpen] =
    useState(false);
  const [selectedInstitution, setSelectedInstitution] =
    useState<InstitutionProps | null>(null);

  const [isFetchingRecipientName, setIsFetchingRecipientName] = useState(false);
  const [recipientNameError, setRecipientNameError] = useState("");
  const [isRecipientNameEditable, setIsRecipientNameEditable] = useState(false);

  const [savedRecipients, setSavedRecipients] = useState<
    RecipientDetailsWithId[]
  >([]);
  const [isLoadingRecipients, setIsLoadingRecipients] = useState(false);
  const [recipientsError, setRecipientsError] = useState<string | null>(null);

  const [recipientToDelete, setRecipientToDelete] =
    useState<RecipientDetails | null>(null);

  const institutionsDropdownRef = useRef<HTMLDivElement>(null);
  useOutsideClick({
    ref: institutionsDropdownRef,
    handler: () => setIsInstitutionsDropdownOpen(false),
  });

  const [isManualEntry, setIsManualEntry] = useState(true);
  const [isReturningFromPreview, setIsReturningFromPreview] = useState(false);

  const prevCurrencyRef = useRef(currency);

  /**
   * Array of institutions filtered and sorted alphabetically based on the bank search term.
   *
   * @type {Array<InstitutionProps>}
   */
  const filteredInstitutions: Array<InstitutionProps> = useMemo(() => {
    const filtered =
      institutions?.filter((item) =>
        item.name.toLowerCase().includes(bankSearchTerm.toLowerCase()),
      ) || [];

    return filtered.sort((a, b) => {
      // Sort mobile money first, then alphabetically within each type
      if (a.type === "mobile_money" && b.type !== "mobile_money") return -1;
      if (a.type !== "mobile_money" && b.type === "mobile_money") return 1;
      if (a.code === "OPAYNGPC" && b.code !== "OPAYNGPC") return -1;
      if (a.code !== "OPAYNGPC" && b.code === "OPAYNGPC") return 1;
      if (a.code === "PALMNGPC" && b.code !== "PALMNGPC") return -1;
      if (a.code !== "PALMNGPC" && b.code === "PALMNGPC") return 1;
      if (a.code === "MONINGPC" && b.code !== "MONINGPC") return -1;
      if (a.code !== "MONINGPC" && b.code === "MONINGPC") return 1;
      if (a.code === "KUDANGPC" && b.code !== "KUDANGPC") return -1;
      if (a.code !== "KUDANGPC" && b.code === "KUDANGPC") return 1;
      return a.name.localeCompare(b.name);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [institutions, bankSearchTerm, currency]);

  const selectSavedRecipient = (recipient: RecipientDetails) => {
    setSelectedRecipient(recipient);
    setSelectedInstitution({
      name: recipient.institution,
      code: recipient.institutionCode,
      type: recipient.type,
    });
    setValue("institution", recipient.institutionCode, { shouldDirty: true });
    setValue("accountIdentifier", recipient.accountIdentifier, {
      shouldDirty: true,
    });
    setValue("accountType", recipient.type, { shouldDirty: true });

    // Remove extra spaces from recipient name
    recipient.name = recipient.name.replace(/\s+/g, " ").trim();
    setValue("recipientName", recipient.name, { shouldDirty: true });
    setIsManualEntry(false);
    setIsRecipientNameEditable(false);
    setIsModalOpen(false);
  };

  const deleteRecipient = async (recipientToDeleteParam: RecipientDetails) => {
    setRecipientToDelete(recipientToDeleteParam);

    try {
      // Find the recipient with ID from the saved recipients
      const recipientWithId = savedRecipients.find(
        (r) =>
          r.accountIdentifier === recipientToDeleteParam.accountIdentifier &&
          r.institutionCode === recipientToDeleteParam.institutionCode,
      );

      if (!recipientWithId) {
        console.error("Recipient not found for deletion");
        return;
      }

      // Delete from API
      const accessToken = await getAccessToken();
      if (!accessToken) {
        console.error("No access token available");
        return;
      }

      const success = await deleteSavedRecipient(
        recipientWithId.id,
        accessToken,
      );

      if (success) {
        // Update local state after successful API deletion
        const updatedRecipients = savedRecipients.filter(
          (r) => r.id !== recipientWithId.id,
        );

        setSavedRecipients(updatedRecipients);

        if (
          selectedRecipient?.accountIdentifier ===
            recipientToDeleteParam.accountIdentifier &&
          selectedRecipient?.institutionCode ===
            recipientToDeleteParam.institutionCode
        ) {
          setSelectedRecipient(null);
        }
      } else {
        setRecipientsError("Failed to delete recipient");
      }
    } catch (error) {
      console.error("Error deleting recipient:", error);
      setRecipientsError("Failed to delete recipient");
    } finally {
      // Always clear deletion loading state
      setRecipientToDelete(null);
    }
  };

  // * USE EFFECTS

  useEffect(() => {
    let isCancelled = false;

    const loadRecipients = async () => {
      // Wait until Privy is ready to avoid false auth errors
      if (!ready) return;

      // If unauthenticated, clear state and exit
      if (!authenticated) {
        if (!isCancelled) {
          setSavedRecipients([]);
          setRecipientsError(null);
          setIsLoadingRecipients(false);
        }
        return;
      }

      if (!isCancelled) {
        setIsLoadingRecipients(true);
        setRecipientsError(null);
      }

      try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          if (!isCancelled) setRecipientsError("Authentication required");
          return;
        }

        const recipients = await fetchSavedRecipients(accessToken);
        if (!isCancelled) setSavedRecipients(recipients);
      } catch (error) {
        console.error("Error loading recipients:", error);
        if (!isCancelled) setRecipientsError("Failed to load saved recipients");
      } finally {
        if (!isCancelled) setIsLoadingRecipients(false);
      }
    };

    loadRecipients();
    return () => {
      isCancelled = true;
    };
  }, [ready, authenticated, user?.id, getAccessToken]);

  useEffect(() => {
    if (selectedInstitution) {
      register("institution", { value: selectedInstitution.code });
      // Only reset fields if this is manual entry
      if (isManualEntry) {
        setValue("recipientName", "");
        setValue("accountIdentifier", "");
        setRecipientNameError("");
        setIsRecipientNameEditable(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInstitution, isManualEntry]);

  // Fetch recipient name based on institution and account identifier
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    const getRecipientName = async () => {
      if (!isManualEntry) return;

      if (
        !institution ||
        !accountIdentifier ||
        accountIdentifier.toString().length <
          (selectedInstitution?.code === "SAFAKEPC" ? 6 : 10)
      )
        return;

      setIsFetchingRecipientName(true);
      setValue("recipientName", "");

      try {
        const accountName = await fetchAccountName({
          institution: institution.toString(),
          accountIdentifier: accountIdentifier.toString(),
        });
        
        // Check if the response is "Ok" which means verification failed but not an error
        if (accountName.toLowerCase() === "ok") {
          setIsRecipientNameEditable(true);
          setValue("recipientName", "");
          setRecipientNameError("");
        } else {
          setIsRecipientNameEditable(false);
          setValue("recipientName", accountName);
        }
        setIsFetchingRecipientName(false);
      } catch (error) {
        setRecipientNameError("No recipient account found.");
        setIsRecipientNameEditable(false);
        setIsFetchingRecipientName(false);
      }
    };

    const debounceFetchRecipientName = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(getRecipientName, 1000);
    };

    debounceFetchRecipientName();

    return () => {
      clearTimeout(timeoutId);
    };
  }, [
    accountIdentifier,
    institution,
    setValue,
    isManualEntry,
    selectedInstitution?.code,
  ]);

  useEffect(() => {
    // Initialize selected institution if form has values
    if (institution && !selectedInstitution) {
      const foundInstitution = [...(institutions || [])].find(
        (inst) => inst.code === institution,
      );
      if (foundInstitution) {
        setSelectedInstitution(foundInstitution);
        // Only set manual entry to false if we have recipient name
        if (recipientName) {
          setIsManualEntry(false);
        }
      }
    }
  }, [institution, institutions, selectedInstitution, recipientName]);

  // Simplified recipient details management
  const clearRecipientDetails = () => {
    setSelectedInstitution(null);
    setSelectedRecipient(null);
    setValue("institution", "");
    setValue("recipientName", "");
    setValue("accountIdentifier", "");
    setRecipientNameError("");
    setIsManualEntry(true);
    setIsRecipientNameEditable(false);
  };

  // Only clear when currency actually changes (not on mount or preview return)
  useEffect(() => {
    if (
      prevCurrencyRef.current !== currency &&
      prevCurrencyRef.current !== undefined
    ) {
      clearRecipientDetails();
    }
    prevCurrencyRef.current = currency;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency]);

  useEffect(() => {
    if (institution && recipientName) {
      setIsReturningFromPreview(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="space-y-4 rounded-2xl bg-white p-4 text-sm dark:bg-surface-canvas">
        <div className="flex items-center justify-between *:font-medium">
          <p className="text-base text-text-body dark:text-white">Recipient</p>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="text-lavender-500 dark:text-lavender-500"
          >
            Select beneficiary
          </button>
        </div>

        <div className="flex flex-col items-start gap-4 sm:flex-row">
          {/* Bank */}
          <div className="w-full flex-1 sm:w-1/2">
            <button
              type="button"
              onClick={() => setIsSelectBankModalOpen(true)}
              disabled={isFetchingInstitutions}
              className="flex w-full items-center justify-between gap-2 rounded-xl border border-border-input px-4 py-2.5 text-left text-sm dark:border-white/20 dark:text-white/80"
            >
              {selectedInstitution ? (
                <p className="truncate">{selectedInstitution.name}</p>
              ) : (
                <p className="text-text-placeholder dark:text-white/30">
                  Select institution
                </p>
              )}
              {isFetchingInstitutions ? (
                <ImSpinner className="size-4 flex-shrink-0 animate-spin text-gray-400" />
              ) : (
                <ArrowDown01Icon
                  className={classNames(
                    "size-5 flex-shrink-0 text-outline-gray transition-transform dark:text-white/50",
                    isInstitutionsDropdownOpen ? "rotate-180" : "",
                  )}
                />
              )}
            </button>
          </div>

          {/* Account number */}
          <div className="w-full flex-1 flex-shrink-0 sm:w-1/2">
            <input
              type="number"
              placeholder="Account number"
              {...register("accountIdentifier", {
                required: {
                  value: true,
                  message: "Account number is required",
                },
                minLength: {
                  value: selectedInstitution?.code === "SAFAKEPC" ? 6 : 10,
                  message: "Account number is invalid",
                },
                onChange: () => setIsManualEntry(true),
              })}
              className={classNames(
                "w-full rounded-xl border bg-transparent px-4 py-2.5 text-sm outline-none transition-all duration-300 placeholder:text-text-placeholder focus:outline-none dark:text-white/80 dark:placeholder:text-white/30",
                errors.accountIdentifier
                  ? "border-input-destructive focus:border-gray-400 dark:border-input-destructive"
                  : "border-border-input dark:border-white/20 dark:focus:border-white/40 dark:focus:ring-offset-neutral-900",
              )}
            />
          </div>
        </div>

        {/* Account details feedback */}
        <AnimatePresence mode="wait">
          {isFetchingRecipientName ? (
            <div className="flex items-center gap-1 text-gray-400 dark:text-white/50">
              <AnimatedFeedbackItem className="animate-pulse">
                <ImSpinner className="size-4 animate-spin" />
                <p className="text-xs">Verifying account name...</p>
              </AnimatedFeedbackItem>
            </div>
          ) : (
            <>
              {isRecipientNameEditable ? (
                <AnimatedFeedbackItem className="flex-col items-start gap-2">
                  <input
                    type="text"
                    placeholder="Enter recipient name"
                    {...register("recipientName", {
                      required: {
                        value: true,
                        message: "Recipient name is required",
                      },
                      minLength: {
                        value: 2,
                        message: "Recipient name must be at least 2 characters",
                      },
                    })}
                    className={classNames(
                      "w-full rounded-xl border bg-transparent px-4 py-2.5 text-sm outline-none transition-all duration-300 placeholder:text-text-placeholder focus:outline-none dark:text-white/80 dark:placeholder:text-white/30",
                      errors.recipientName
                        ? "border-input-destructive focus:border-gray-400 dark:border-input-destructive"
                        : "border-border-input dark:border-white/20 dark:focus:border-white/40 dark:focus:ring-offset-neutral-900",
                    )}
                  />
                  {errors.recipientName && (
                    <InputError message={errors.recipientName.message || "Recipient name is required"} />
                  )}
                </AnimatedFeedbackItem>
              ) : recipientName ? (
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
                      {recipientName.toLowerCase()}
                    </p>
                  </motion.div>

                  <Tick02Icon className="text-lg text-green-700 dark:text-green-500 max-sm:hidden" />
                </AnimatedFeedbackItem>
                
              ) : recipientNameError ? (
                <InputError message={recipientNameError} />
              ) : null}
            </>
          )}
        </AnimatePresence>
      </div>

      <AnimatedFeedbackItem>
        {isRecipientNameEditable && recipientName ? (
        <div className="min-h-[48px] h-fit w-full dark:bg-warning-background/10 bg-warning-background/35 px-3 py-2 rounded-xl flex items-start gap-2">
          <InformationSquareIcon className="dark:text-warning-text text-warning-foreground w-[36px] h-[36px] md:w-[24px] md:h-[24px]" />
          <p className="text-xs font-light dark:text-warning-text text-warning-foreground leading-tight">
              Unable to verify details. Ensure the recipient&apos;s account number is accurate before proceeding with swap. <a href="#" className="text-lavender-500 text-semibold">Learn more.</a>
          </p>
        </div>
        ) : (
          <div className="min-h-[48px] h-fit w-full dark:bg-warning-background/10 bg-warning-background/35 px-3 py-2 rounded-xl flex items-start gap-2">
          <InformationSquareIcon className="dark:text-warning-text text-warning-foreground w-[36px] h-[36px] md:w-[24px] md:h-[24px]" />
          <p className="text-xs font-light dark:text-warning-text text-warning-foreground leading-tight">
            Make sure the recipient&apos;s account number is accurate before proceeding with swap. <a href="#" className="text-lavender-500 text-semibold">Learn more.</a>
          </p>
        </div>
        )}
      </AnimatedFeedbackItem>
      <SelectBankModal
        isOpen={isSelectBankModalOpen}
        onClose={() => setIsSelectBankModalOpen(false)}
        filteredInstitutions={filteredInstitutions}
        selectedInstitution={selectedInstitution}
        setSelectedInstitution={setSelectedInstitution}
        setValue={setValue}
        setIsManualEntry={setIsManualEntry}
        currency={currency}
        bankSearchTerm={bankSearchTerm}
        setBankSearchTerm={setBankSearchTerm}
        isFetchingInstitutions={isFetchingInstitutions}
      />

      <SavedBeneficiariesModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSelectRecipient={selectSavedRecipient}
        savedRecipients={savedRecipients}
        onDeleteRecipient={deleteRecipient}
        recipientToDelete={recipientToDelete}
        currency={currency}
        institutions={institutions}
        isLoading={isLoadingRecipients}
        error={recipientsError}
      />
    </>
  );
};
