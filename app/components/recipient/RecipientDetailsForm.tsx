"use client";
import { ImSpinner } from "react-icons/im";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown01Icon, Tick02Icon } from "hugeicons-react";
import Image from "next/image";

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
import { isValidEvmAddressCaseInsensitive } from "@/app/lib/validation";
import { getNetworkImageUrl } from "@/app/utils";
import { useActualTheme } from "@/app/hooks/useActualTheme";
import { useNetwork } from "@/app/context";

export const RecipientDetailsForm = ({
  formMethods,
  stateProps: {
    isFetchingInstitutions,
    institutions,
    selectedRecipient,
    setSelectedRecipient,
  },
  isSwapped = false,
  token,
  networkName,
}: RecipientDetailsFormProps) => {
  const {
    watch,
    register,
    setValue,
    formState: { errors },
  } = formMethods;

  const { getAccessToken, ready, authenticated, user } = usePrivy();
  const { selectedNetwork } = useNetwork();

  const { currency } = watch();
  const institution = watch("institution");
  const accountIdentifier = watch("accountIdentifier");
  const recipientName = watch("recipientName");
  const walletAddress = watch("walletAddress");

  const [isModalOpen, setIsModalOpen] = useState(false);

  const [isSelectBankModalOpen, setIsSelectBankModalOpen] = useState(false);
  const [bankSearchTerm, setBankSearchTerm] = useState("");

  const [isInstitutionsDropdownOpen, setIsInstitutionsDropdownOpen] =
    useState(false);
  const [selectedInstitution, setSelectedInstitution] =
    useState<InstitutionProps | null>(null);

  const [isFetchingRecipientName, setIsFetchingRecipientName] = useState(false);
  const [recipientNameError, setRecipientNameError] = useState("");

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
  const isDark = useActualTheme();

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

    if (recipient.type === "wallet") {
      // Handle wallet address selection for onramp
      setValue("walletAddress", recipient.walletAddress, {
        shouldDirty: true,
        shouldValidate: true,
      });
    } else {
      // Handle bank/mobile money selection for offramp
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
    }

    setIsModalOpen(false);
  };

  const deleteRecipient = async (recipientToDeleteParam: RecipientDetails) => {
    setRecipientToDelete(recipientToDeleteParam);

    try {
      // Find the recipient with ID from the saved recipients
      const recipientWithId = savedRecipients.find(
        (r) =>
          recipientToDeleteParam.type === "wallet"
            ? r.type === "wallet" && r.walletAddress === recipientToDeleteParam.walletAddress
            : r.type !== "wallet" &&
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

        if (selectedRecipient) {
          if (
            recipientToDeleteParam.type === "wallet"
              ? selectedRecipient.type === "wallet" && selectedRecipient.walletAddress === recipientToDeleteParam.walletAddress
              : selectedRecipient.type !== "wallet" &&
              selectedRecipient.accountIdentifier === recipientToDeleteParam.accountIdentifier &&
              selectedRecipient.institutionCode === recipientToDeleteParam.institutionCode
          ) {
            setSelectedRecipient(null);
          }
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
          if (!isCancelled) {
            setSavedRecipients([]);
            setRecipientsError("Authentication required");
            setIsLoadingRecipients(false);
          }
          return;
        }

        const recipients = await fetchSavedRecipients(accessToken);

        if (!isCancelled) {
          setSavedRecipients(recipients);
          setRecipientsError(null);
        }
      } catch (error) {
        console.error("Error loading recipients:", error);
        if (!isCancelled) {
          setSavedRecipients([]);
          setRecipientsError("Failed to load saved recipients");
        }
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

  // Format network name for display (e.g., "Binance Smartchain" from "bsc")
  const formatNetworkName = (network?: string): string => {
    if (!network) return "";
    const networkMap: Record<string, string> = {
      "bsc": "Binance Smartchain",
      "arbitrum-one": "Arbitrum One",
      "polygon": "Polygon",
      "base": "Base",
      "ethereum": "Ethereum",
    };
    return networkMap[network.toLowerCase()] || network;
  };

  // Filter saved recipients by type
  const walletRecipients = useMemo(
    () => savedRecipients.filter((r) => r.type === "wallet"),
    [savedRecipients],
  );

  const bankRecipients = useMemo(
    () => savedRecipients.filter((r) => r.type !== "wallet"),
    [savedRecipients],
  );

  return (
    <>
      <div className="space-y-4 rounded-2xl bg-white p-4 text-sm dark:bg-surface-canvas">
        <div className="flex items-center justify-between *:font-medium">
          <p className="text-base text-text-body dark:text-white">Recipient</p>
          {/* Show Select beneficiary button when there are saved recipients */}
          {((isSwapped && walletRecipients.length > 0) || (!isSwapped && bankRecipients.length > 0)) && (
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="text-lavender-500 dark:text-lavender-500"
            >
              Select beneficiary
            </button>
          )}
        </div>

        {isSwapped ? (
          /* Wallet address input for onramp */
          <div className="space-y-3">
            <input
              type="text"
              placeholder={`Enter ${token || "stablecoin"} wallet address`}
              {...register("walletAddress", {
                required: {
                  value: true,
                  message: "Wallet address is required",
                },
                validate: (value) => {
                  if (!value) return true;
                  if (!isValidEvmAddressCaseInsensitive(value)) {
                    return "Invalid wallet address format";
                  }
                  return true;
                },
              })}
              className={classNames(
                "w-full rounded-xl border bg-transparent px-4 py-2.5 text-sm outline-none transition-all duration-300 placeholder:text-text-placeholder focus:outline-none dark:text-white/80 dark:placeholder:text-white/30",
                errors.walletAddress
                  ? "border-input-destructive focus:border-gray-400 dark:border-input-destructive"
                  : "border-border-input dark:border-white/20 dark:focus:border-white/40 dark:focus:ring-offset-neutral-900",
              )}
            />
            {errors.walletAddress && (
              <InputError message={errors.walletAddress.message} />
            )}
            {networkName && (
              <div className="flex items-center gap-2 text-xs text-text-disabled dark:text-white/30">
                <div className="flex size-5 items-center justify-center">
                  <Image
                    src={getNetworkImageUrl(selectedNetwork, isDark)}
                    alt={selectedNetwork.chain.name}
                    width={20}
                    height={20}
                    className="size-5 rounded-full"
                  />
                </div>
                <span className="text-xs font-normal leading-4 tracking-normal" style={{ fontFamily: 'Inter' }}>
                  You are on {formatNetworkName(networkName)} network
                </span>
              </div>
            )}
          </div>
        ) : (
          /* Bank/Mobile Money fields for offramp */
          <>
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
                  {recipientName ? (
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
          </>
        )}
      </div>

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
        savedRecipients={isSwapped ? walletRecipients : bankRecipients}
        onDeleteRecipient={deleteRecipient}
        recipientToDelete={recipientToDelete}
        currency={currency}
        institutions={institutions}
        isLoading={isLoadingRecipients}
        error={recipientsError}
        isSwapped={isSwapped}
        networkName={networkName}
      />
    </>
  );
};
