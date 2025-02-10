"use client";
import { ImSpinner } from "react-icons/im";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown01Icon,
  InformationSquareIcon,
  Tick02Icon,
} from "hugeicons-react";

import { AnimatedFeedbackItem, dropdownVariants } from "../AnimatedComponents";
import { InstitutionProps } from "@/app/types";
import { useOutsideClick } from "@/app/hooks";
import { fetchAccountName } from "@/app/api/aggregator";
import { InputError } from "../InputError";
import {
  classNames,
  kenyaMobileMoneyOptions,
  getSavedRecipients,
} from "@/app/utils";
import { SearchInput } from "./SearchInput";
import {
  LOCAL_STORAGE_KEY_RECIPIENTS,
  RecipientDetails,
  RecipientDetailsFormProps,
} from "./types";
import { SavedBeneficiariesModal } from "./SavedBeneficiariesModal";

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

  const { currency } = watch();
  const institution = watch("institution");
  const accountIdentifier = watch("accountIdentifier");
  const recipientName = watch("recipientName");

  const [isModalOpen, setIsModalOpen] = useState(false);

  const [bankSearchTerm, setBankSearchTerm] = useState("");

  const [isInstitutionsDropdownOpen, setIsInstitutionsDropdownOpen] =
    useState(false);
  const [selectedInstitution, setSelectedInstitution] =
    useState<InstitutionProps | null>(null);

  const [isFetchingRecipientName, setIsFetchingRecipientName] = useState(false);
  const [recipientNameError, setRecipientNameError] = useState("");

  const [savedRecipients, setSavedRecipients] = useState<RecipientDetails[]>(
    [],
  );

  const [recipientToDelete, setRecipientToDelete] =
    useState<RecipientDetails | null>(null);

  const institutionsDropdownRef = useRef<HTMLDivElement>(null);
  const bankSearchInputRef = useRef<HTMLInputElement>(null);
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
    const mobileMoneyInstitutions =
      currency === "KES"
        ? kenyaMobileMoneyOptions.filter((item) =>
            item.name.toLowerCase().includes(bankSearchTerm.toLowerCase()),
          )
        : [];

    const bankInstitutions =
      institutions?.filter((item) =>
        item.name.toLowerCase().includes(bankSearchTerm.toLowerCase()),
      ) || [];

    return [...mobileMoneyInstitutions, ...bankInstitutions].sort((a, b) => {
      // Sort mobile money first, then alphabetically within each type
      if (a.type === "mobile_money" && b.type !== "mobile_money") return -1;
      if (a.type !== "mobile_money" && b.type === "mobile_money") return 1;
      return a.name.localeCompare(b.name);
    });
  }, [institutions, bankSearchTerm, currency]);

  const selectSavedRecipient = (recipient: RecipientDetails) => {
    setSelectedRecipient(recipient);
    setSelectedInstitution({
      name: recipient.institution,
      code: recipient.institutionCode,
      type: recipient.institutionCode.startsWith("MPESA")
        ? "mobile_money"
        : "bank",
    });
    setValue("institution", recipient.institutionCode);
    setValue("accountIdentifier", recipient.accountIdentifier);
    setValue("accountType", recipient.type);

    // Remove extra spaces from recipient name
    recipient.name = recipient.name.replace(/\s+/g, " ").trim();
    setValue("recipientName", recipient.name);
    setIsManualEntry(false);
    setIsModalOpen(false);
  };

  const deleteRecipient = (recipientToDelete: RecipientDetails) => {
    setRecipientToDelete(recipientToDelete);
    setTimeout(() => {
      const updatedRecipients = savedRecipients.filter(
        (r) =>
          r.accountIdentifier !== recipientToDelete.accountIdentifier ||
          r.institution !== recipientToDelete.institution,
      );

      setSavedRecipients(updatedRecipients);

      localStorage.setItem(
        LOCAL_STORAGE_KEY_RECIPIENTS,
        JSON.stringify(updatedRecipients),
      );

      if (
        selectedRecipient?.accountIdentifier ===
        recipientToDelete.accountIdentifier
      ) {
        setSelectedRecipient(null);
      }
      setRecipientToDelete(null);
    }, 300); // delay deletion to allow for animation
  };

  // * USE EFFECTS

  useEffect(() => {
    const savedRecipients = getSavedRecipients(LOCAL_STORAGE_KEY_RECIPIENTS);
    setSavedRecipients(savedRecipients);
  }, []);

  useEffect(() => {
    if (selectedInstitution) {
      register("institution", { value: selectedInstitution.code });
      // Only reset fields if this is manual entry
      if (isManualEntry) {
        setValue("recipientName", "");
        setValue("accountIdentifier", "");
        setRecipientNameError("");
      }
    }
  }, [selectedInstitution, isManualEntry]);

  // Fetch recipient name based on institution and account identifier
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    const getRecipientName = async () => {
      if (!isManualEntry) return;

      if (
        !institution ||
        !accountIdentifier ||
        accountIdentifier.toString().length < 10
      )
        return;

      setIsFetchingRecipientName(true);
      setValue("recipientName", "");

      try {
        const accountName = await fetchAccountName({
          institution: institution.toString(),
          accountIdentifier: accountIdentifier.toString(),
        });
        setValue("recipientName", accountName);
        setIsFetchingRecipientName(false);
      } catch (error) {
        setRecipientNameError("No recipient account found.");
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
    // Add selectedRecipient to dependencies array
  }, [accountIdentifier, institution, setValue, isManualEntry]);

  useEffect(() => {
    // Initialize selected institution if form has values
    if (institution && !selectedInstitution) {
      const foundInstitution = [
        ...kenyaMobileMoneyOptions,
        ...(institutions || []),
      ].find((inst) => inst.code === institution);
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
  }, [currency]);

  useEffect(() => {
    if (institution && recipientName) {
      setIsReturningFromPreview(true);
    }
  }, []);

  return (
    <>
      <div className="space-y-4 rounded-2xl bg-white p-4 text-sm dark:bg-neutral-900">
        <div className="flex items-center justify-between *:font-medium">
          <p className="text-gray-500 dark:text-white">Recipient</p>
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
          <div ref={institutionsDropdownRef} className="w-full flex-1 sm:w-1/2">
            <button
              type="button"
              onClick={() => {
                setIsInstitutionsDropdownOpen(!isInstitutionsDropdownOpen);
                if (!isInstitutionsDropdownOpen) {
                  setTimeout(() => bankSearchInputRef.current?.focus(), 0);
                }
              }}
              disabled={isFetchingInstitutions}
              className="flex w-full items-center justify-between gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-left text-sm text-neutral-900 outline-none transition-all hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-lavender-500 focus:ring-opacity-50 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed dark:border-white/20 dark:text-white/80 dark:hover:bg-white/5 dark:focus:bg-neutral-950 dark:focus-visible:ring-offset-neutral-900"
            >
              {selectedInstitution ? (
                <p className="truncate">{selectedInstitution.name}</p>
              ) : (
                <p className="dark:text-white/30">Select bank</p>
              )}

              {isFetchingInstitutions ? (
                <ImSpinner className="size-4 flex-shrink-0 animate-spin text-gray-400" />
              ) : (
                <ArrowDown01Icon
                  className={classNames(
                    "size-5 flex-shrink-0 text-gray-400 transition-transform dark:text-white/50",
                    isInstitutionsDropdownOpen ? "rotate-180" : "",
                  )}
                />
              )}
            </button>

            {/* Bank Selection Dropdown */}
            <AnimatePresence>
              {isInstitutionsDropdownOpen && (
                <motion.div
                  initial="closed"
                  animate={isInstitutionsDropdownOpen ? "open" : "closed"}
                  exit="closed"
                  variants={dropdownVariants}
                  className="scrollbar-hide absolute right-0 z-10 mt-6 max-h-80 w-full max-w-full overflow-y-auto rounded-xl bg-gray-50 shadow-xl dark:bg-neutral-800"
                >
                  <h4 className="px-4 pt-4 font-medium">Select bank</h4>
                  <div className="sticky top-0 bg-gray-50 p-4 dark:bg-neutral-800">
                    {/* Search banks */}
                    <SearchInput
                      value={bankSearchTerm}
                      onChange={setBankSearchTerm}
                      placeholder="Search banks..."
                      autoFocus={isInstitutionsDropdownOpen}
                    />
                  </div>

                  {/* Banks list */}
                  <ul
                    role="list"
                    aria-labelledby="networks-dropdown"
                    className="px-2 pb-2"
                  >
                    {currency ? (
                      filteredInstitutions.length > 0 ? (
                        filteredInstitutions.map((institution) => (
                          <li
                            key={institution.code}
                            onClick={() => {
                              setSelectedInstitution(institution);
                              setIsInstitutionsDropdownOpen(false);
                              setValue("institution", institution.code, {
                                shouldValidate: true,
                              });
                              setIsManualEntry(true);
                            }}
                            className={classNames(
                              "flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-neutral-900 transition-all hover:bg-gray-200 dark:text-white/80 dark:hover:bg-white/5",
                              selectedInstitution?.code === institution.code
                                ? "bg-gray-200 dark:bg-white/5"
                                : "",
                            )}
                          >
                            {institution.name}
                          </li>
                        ))
                      ) : (
                        <li className="mx-auto flex max-w-60 flex-col items-center justify-center gap-2 py-14 text-center *:dark:text-white/50">
                          <InformationSquareIcon className="size-5" />
                          <p className="font-medium">No exact match found</p>
                          <p>
                            No bank with that name found. Please try another
                            search input{" "}
                          </p>
                        </li>
                      )
                    ) : (
                      <li className="flex items-center justify-center gap-2 py-4">
                        <p>Please select a currency first</p>
                      </li>
                    )}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
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
                  value: 10,
                  message: "Account number is invalid",
                },
                onChange: () => setIsManualEntry(true),
              })}
              className={classNames(
                "w-full rounded-xl border bg-transparent px-4 py-2.5 text-sm outline-none transition-all duration-300 placeholder:text-gray-400 focus:outline-none dark:text-white/80 dark:placeholder:text-white/30",
                errors.accountIdentifier
                  ? "border-input-destructive focus:border-gray-400 dark:border-input-destructive"
                  : "border-gray-300 dark:border-white/20 dark:focus:border-white/40 dark:focus:ring-offset-neutral-900",
              )}
            />
          </div>
        </div>

        {/* Account details feedback */}
        <AnimatePresence mode="wait">
          {isFetchingRecipientName ? (
            <div className="flex items-center gap-1 text-gray-400 dark:text-white/50">
              <AnimatedFeedbackItem>
                <ImSpinner className="size-4 animate-spin" />
                <p className="text-xs">Verifying account name...</p>
              </AnimatedFeedbackItem>
            </div>
          ) : (
            <>
              {recipientName ? (
                <AnimatedFeedbackItem className="justify-between text-gray-400 dark:text-white/50">
                  <motion.div
                    className="relative overflow-hidden rounded-lg p-0.5"
                    style={{
                      background:
                        "linear-gradient(90deg, #CB2DA899, #8250DF46, #F2690C99)",
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
                    <p className="rounded-md bg-gray-200 px-3 py-1 capitalize text-neutral-900 dark:bg-neutral-800 dark:text-white">
                      {recipientName.toLowerCase()}
                    </p>
                  </motion.div>

                  {/* <Tick02Icon className="text-lg text-green-700 dark:text-green-500" /> */}
                </AnimatedFeedbackItem>
              ) : recipientNameError ? (
                <InputError message={recipientNameError} />
              ) : null}
            </>
          )}
        </AnimatePresence>
      </div>

      <SavedBeneficiariesModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSelectRecipient={selectSavedRecipient}
        savedRecipients={savedRecipients}
        onDeleteRecipient={deleteRecipient}
        recipientToDelete={recipientToDelete}
        currency={currency}
        institutions={institutions}
      />
    </>
  );
};
