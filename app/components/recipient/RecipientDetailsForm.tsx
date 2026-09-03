"use client";
import { ImSpinner } from "react-icons/im";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown01Icon,
  Tick02Icon,
  InformationCircleIcon,
} from "hugeicons-react";
import Image from "next/image";

import { AnimatedFeedbackItem } from "../AnimatedComponents";
import { InstitutionProps } from "@/app/types";
import { useOutsideClick } from "@/app/hooks";
import { fetchAccountName } from "@/app/api/aggregator";
import { usePrivy } from "@privy-io/react-auth";
import { InputError } from "@/app/components/InputError";
import { classNames, getOfframpAccountIdentifierPlaceholder, filterAndSortInstitutions, expandKesMpesaInstitutions, KES_MPESA_INSTITUTION_CODE, kesMpesaUiKey, getKesMpesaInstitutionLabel, isSameSavedRecipient, NGN_NUBAN_LENGTH } from "@/app/utils";
import type { KesMpesaChannel } from "@/app/types";
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
import { validateWalletAddress } from "@/app/lib/validation";
import { getNetworkImageUrl } from "@/app/utils";
import { useActualTheme } from "@/app/hooks/useActualTheme";
import { useNetwork } from "@/app/context";
import config from "@/app/lib/config";

export const RecipientDetailsForm = ({
  formMethods,
  stateProps: {
    isFetchingInstitutions,
    institutions,
    selectedRecipient,
    setSelectedRecipient,
  },
  swapMode = "offramp",
  token,
  networkName,
  connectedWalletAddress,
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
  const kesChannel = watch("kesChannel");
  const businessNumber = watch("businessNumber");

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

  /** NGN NUBAN: cap at 10 digits. Other currencies: no digit cap. */
  const ngnAccountMaxDigits = useMemo(
    () => (currency === "NGN" ? NGN_NUBAN_LENGTH : null),
    [currency],
  );

  const prevCurrencyRef = useRef(currency);
  const isDark = useActualTheme();

  const filteredInstitutions = useMemo(() => {
    const expanded = expandKesMpesaInstitutions(institutions, currency);
    return filterAndSortInstitutions(expanded, bankSearchTerm);
  }, [institutions, bankSearchTerm, currency]);

  const isKesMpesa =
    currency === "KES" && institution === KES_MPESA_INSTITUTION_CODE;
  const isKesPaybill = isKesMpesa && kesChannel === "Paybill";
  const isKesTill = isKesMpesa && kesChannel === "Till";

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
      const channel = recipient.channel;
      setSelectedInstitution({
        name:
          recipient.institutionCode === KES_MPESA_INSTITUTION_CODE && channel
            ? getKesMpesaInstitutionLabel(channel)
            : recipient.institution,
        code: recipient.institutionCode,
        type: recipient.type,
        ...(channel
          ? { channel, uiKey: kesMpesaUiKey(channel) }
          : {}),
      });
      setValue("institution", recipient.institutionCode, { shouldDirty: true });
      setValue("accountIdentifier", recipient.accountIdentifier, {
        shouldDirty: true,
      });
      setValue("accountType", recipient.type, { shouldDirty: true });
      setValue("kesChannel", channel ?? "", { shouldDirty: true });
      setValue("businessNumber", recipient.businessNumber ?? "", {
        shouldDirty: true,
      });

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
            isSameSavedRecipient(r, recipientToDeleteParam),
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
              isSameSavedRecipient(selectedRecipient, recipientToDeleteParam)
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
        setValue("businessNumber", "");
        setRecipientNameError("");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInstitution, isManualEntry]);

  // Fetch recipient name based on institution and account identifier (only enforce digit-length for NGN)
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    const getRecipientName = async () => {
      if (!isManualEntry) return;

      const isNGN = currency === "NGN";
      const digits = String(accountIdentifier ?? "").replace(/\D/g, "");

      if (!institution || !accountIdentifier) {
        setRecipientNameError("");
        return;
      }

      if (isKesPaybill && !(businessNumber ?? "").trim()) {
        setRecipientNameError("");
        return;
      }

      if (isKesTill) {
        if (digits.length < 5 || digits.length > 7) {
          if (digits.length > 0) {
            setRecipientNameError(
              "Please enter a valid till number (5–7 digits).",
            );
          } else {
            setRecipientNameError("");
          }
          return;
        }
      }

      if (isNGN && digits.length !== NGN_NUBAN_LENGTH) {
        if (digits.length > 0) {
          setRecipientNameError(
            "Please enter a valid 10-digit account number.",
          );
        } else {
          setRecipientNameError("");
        }
        return;
      }

      setRecipientNameError("");
      setIsFetchingRecipientName(true);
      setValue("recipientName", "");

      try {
        const channel = (kesChannel || undefined) as
          | KesMpesaChannel
          | undefined;
        const metadata =
          isKesMpesa && channel
            ? {
                channel,
                ...(channel === "Paybill" && (businessNumber ?? "").trim()
                  ? { businessNumber: String(businessNumber).trim() }
                  : {}),
              }
            : undefined;

        const accountName = await fetchAccountName({
          institution: institution.toString(),
          accountIdentifier: accountIdentifier.toString(),
          ...(metadata ? { metadata } : {}),
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
    currency,
    kesChannel,
    businessNumber,
    isKesMpesa,
    isKesPaybill,
    isKesTill,
  ]);

  useEffect(() => {
    // Initialize selected institution if form has values (match channel for virtual KES split)
    if (institution && !selectedInstitution) {
      const expanded = expandKesMpesaInstitutions(institutions, currency);
      const foundInstitution =
        expanded.find((inst) => {
          if (inst.code !== institution) return false;
          if (inst.channel) {
            return inst.channel === kesChannel;
          }
          return true;
        }) ?? expanded.find((inst) => inst.code === institution);
      if (foundInstitution) {
        setSelectedInstitution(foundInstitution);
        setValue("accountType", foundInstitution.type, { shouldValidate: true });
        if (foundInstitution.channel && !kesChannel) {
          setValue("kesChannel", foundInstitution.channel, {
            shouldValidate: true,
          });
        }
        // Only set manual entry to false if we have recipient name
        if (recipientName) {
          setIsManualEntry(false);
        }
      }
    }
  }, [
    institution,
    institutions,
    selectedInstitution,
    recipientName,
    setValue,
    currency,
    kesChannel,
  ]);

  // Simplified recipient details management
  const clearRecipientDetails = () => {
    setSelectedInstitution(null);
    setSelectedRecipient(null);
    setValue("institution", "");
    setValue("recipientName", "");
    setValue("accountIdentifier", "");
    setValue("kesChannel", "");
    setValue("businessNumber", "");
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

  const showMyWalletButton = Boolean(
    swapMode === "onramp" && connectedWalletAddress,
  );

  const showSelectBeneficiaryButton =
    (swapMode === "onramp" && walletRecipients.length > 0) ||
    (swapMode === "offramp" && bankRecipients.length > 0);

  const accountIdentifierRegister = register("accountIdentifier", {
    required: {
      value: true,
      message: isKesTill
        ? "Till number is required"
        : isKesPaybill
          ? "Account / reference is required"
          : "Account number is required",
    },
    validate: (value) => {
      if (isKesTill) {
        const digits = String(value ?? "").replace(/\D/g, "");
        if (digits.length < 5 || digits.length > 7) {
          return "Please enter a valid till number (5–7 digits).";
        }
        return true;
      }
      if (currency !== "NGN") return true;
      const digits = String(value ?? "").replace(/\D/g, "");
      if (digits.length !== NGN_NUBAN_LENGTH) {
        return "Please enter a valid 10-digit account number.";
      }
      return true;
    },
  });

  const businessNumberRegister = register("businessNumber", {
    validate: (value) => {
      if (!isKesPaybill) return true;
      if (!(value ?? "").toString().trim()) {
        return "Business number is required";
      }
      return true;
    },
  });

  // Funds only route through the Noblocks wallet when the destination is an external address.
  // If it's the user's own Noblocks wallet, the forward is skipped — so hide the routing notice.
  const isDestinationOwnWallet =
    !!connectedWalletAddress &&
    walletAddress?.trim().toLowerCase() ===
      connectedWalletAddress.trim().toLowerCase();

  return (
    <>
      <div className="space-y-4 rounded-2xl bg-white p-4 text-sm dark:bg-surface-canvas">
        <div className="flex items-center justify-between">
          <p className="text-base font-medium text-text-body dark:text-white">
            Recipient
          </p>
          {(showMyWalletButton || showSelectBeneficiaryButton) && (
            <div className="flex items-center gap-3 font-medium">
              {showMyWalletButton && (
                <div className="flex items-center gap-2">
                  <span
                    className="font-mono text-xs text-text-disabled dark:text-white/45"
                    aria-label={`Connected wallet starts with ${connectedWalletAddress!.slice(0, 5)}`}
                  >
                    {connectedWalletAddress!.slice(0, 5)}...
                  </span>
                  <button
                    type="button"
                    title="Fill with your connected wallet address"
                    onClick={() =>
                      setValue("walletAddress", connectedWalletAddress!, {
                        shouldValidate: true,
                        shouldDirty: true,
                        shouldTouch: true,
                      })
                    }
                    className="text-sm text-lavender-500 transition-colors hover:text-lavender-400 dark:text-lavender-500 dark:hover:text-lavender-400"
                  >
                    My wallet
                  </button>
                </div>
              )}
              {showSelectBeneficiaryButton && (
                <button
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                  className="text-sm text-lavender-500 dark:text-lavender-500"
                >
                  Select beneficiary
                </button>
              )}
            </div>
          )}
        </div>

        {swapMode === "onramp" ? (
          <div className="space-y-3">
            <input
              type="text"
              placeholder={`Enter ${token || "stablecoin"} wallet address`}
              {...register("walletAddress", {
                required: {
                  value: true,
                  message: "Wallet address is required",
                },
                validate: (value) =>
                  validateWalletAddress(value, networkName ?? ""),
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
            {config.onrampChainedForwardingEnabled &&
              !!walletAddress?.trim() &&
              !isDestinationOwnWallet && (
                <div className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2.5 text-xs font-normal leading-4 text-text-disabled dark:bg-white/5 dark:text-white/30">
                  <InformationCircleIcon className="size-4 flex-shrink-0" />
                  <span>Funds will be routed through your Noblocks wallet.</span>
                </div>
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
                <span
                  className="text-xs font-normal leading-4 tracking-normal"
                  style={{ fontFamily: "Inter" }}
                >
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

              {/* Account / phone / till / paybill reference (NGN NUBAN is 10 digits) */}
              <div className="w-full flex-1 flex-shrink-0 sm:w-1/2">
                <input
                  type="text"
                  inputMode={isKesPaybill ? "text" : "numeric"}
                  autoComplete="off"
                  placeholder={getOfframpAccountIdentifierPlaceholder(
                    currency,
                    selectedInstitution?.type,
                    kesChannel,
                  )}
                  maxLength={ngnAccountMaxDigits ?? (isKesTill ? 7 : undefined)}
                  {...accountIdentifierRegister}
                  onChange={(e) => {
                    setIsManualEntry(true);
                    if (currency === "NGN" && ngnAccountMaxDigits !== null) {
                      const next = e.target.value
                        .replace(/\D/g, "")
                        .slice(0, ngnAccountMaxDigits);
                      if (next !== e.target.value) {
                        e.target.value = next;
                      }
                    } else if (isKesTill) {
                      const next = e.target.value
                        .replace(/\D/g, "")
                        .slice(0, 7);
                      if (next !== e.target.value) {
                        e.target.value = next;
                      }
                    }
                    void accountIdentifierRegister.onChange(e);
                  }}
                  className={classNames(
                    "w-full rounded-xl border bg-transparent px-4 py-2.5 text-base outline-none transition-all duration-300 placeholder:text-text-placeholder focus:outline-none dark:text-white/80 dark:placeholder:text-white/30 sm:text-sm",
                    errors.accountIdentifier
                      ? "border-input-destructive focus:border-gray-400 dark:border-input-destructive"
                      : "border-border-input dark:border-white/20 dark:focus:border-white/40 dark:focus:ring-offset-neutral-900",
                  )}
                />
              </div>
            </div>

            {isKesPaybill && (
              <div className="w-full">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="Business number"
                  {...businessNumberRegister}
                  onChange={(e) => {
                    setIsManualEntry(true);
                    const next = e.target.value.replace(/\D/g, "");
                    if (next !== e.target.value) {
                      e.target.value = next;
                    }
                    void businessNumberRegister.onChange(e);
                  }}
                  className={classNames(
                    "w-full rounded-xl border bg-transparent px-4 py-2.5 text-base outline-none transition-all duration-300 placeholder:text-text-placeholder focus:outline-none dark:text-white/80 dark:placeholder:text-white/30 sm:text-sm",
                    errors.businessNumber
                      ? "border-input-destructive focus:border-gray-400 dark:border-input-destructive"
                      : "border-border-input dark:border-white/20 dark:focus:border-white/40 dark:focus:ring-offset-neutral-900",
                  )}
                />
                {errors.businessNumber && (
                  <div className="mt-2">
                    <InputError message={errors.businessNumber.message} />
                  </div>
                )}
              </div>
            )}

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
        savedRecipients={
          swapMode === "onramp" ? walletRecipients : bankRecipients
        }
        onDeleteRecipient={deleteRecipient}
        recipientToDelete={recipientToDelete}
        currency={currency}
        institutions={institutions}
        isLoading={isLoadingRecipients}
        error={recipientsError}
        swapMode={swapMode}
        networkName={networkName}
      />
    </>
  );
};
