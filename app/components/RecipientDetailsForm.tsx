"use client";
import {
  Button,
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { CiSearch } from "react-icons/ci";
import { ImSpinner } from "react-icons/im";
import { FaRegHourglass } from "react-icons/fa6";
import { PiCaretDown, PiCheck, PiCheckCircleFill } from "react-icons/pi";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AnimatedFeedbackItem,
  dropdownVariants,
  fadeInOut,
} from "./AnimatedComponents";
import {
  InstitutionProps,
  RecipientDetails,
  RecipientDetailsFormProps,
} from "../types";
import { colors } from "../mocks";
import { classNames, kenyaMobileMoneyOptions } from "../utils";
import { InputError } from "./InputError";
import { useOutsideClick } from "../hooks";
import { fetchAccountName } from "../api/aggregator";
import { AddUserIcon, TrashIcon } from "./ImageAssets";
import { primaryBtnClasses, secondaryBtnClasses } from "./Styles";
import Image from "next/image";
import { TbCircle } from "react-icons/tb";

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

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState<string>("bank-transfer");

  const [bankSearchTerm, setBankSearchTerm] = useState("");
  const [beneficiarySearchTerm, setBeneficiarySearchTerm] = useState("");

  const [isInstitutionsDropdownOpen, setIsInstitutionsDropdownOpen] =
    useState(false);
  const [selectedInstitution, setSelectedInstitution] =
    useState<InstitutionProps | null>(null);

  const [isFetchingRecipientName, setIsFetchingRecipientName] = useState(false);
  const [recipientName, setRecipientName] = useState("");
  const [recipientNameError, setRecipientNameError] = useState("");

  const [savedBankTransferRecipients, setSavedBankTransferRecipients] =
    useState<RecipientDetails[]>([]);
  const [savedMobileMoneyRecipients, setSavedMobileMoneyRecipients] = useState<
    RecipientDetails[]
  >([]);

  const [isSavedRecipientsOpen, setIsSavedRecipientsOpen] = useState(false);
  const [recipientToDelete, setRecipientToDelete] =
    useState<RecipientDetails | null>(null);

  const [selectedMobileMoneyInstitution, setSelectedMobileMoneyInstitution] =
    useState<InstitutionProps | null>({
      name: "SAFARICOM (MPESA)",
      code: "MPESA",
      type: "mobile-money",
    });

  const institutionsDropdownRef = useRef<HTMLDivElement>(null);
  useOutsideClick({
    ref: institutionsDropdownRef,
    handler: () => setIsInstitutionsDropdownOpen(false),
  });

  /**
   * Array of institutions filtered and sorted alphabetically based on the bank search term.
   *
   * @type {Array<InstitutionProps>}
   */
  const filteredInstitutions: Array<InstitutionProps> = useMemo(() => {
    return institutions
      ?.filter((item) =>
        item.name.toLowerCase().includes(bankSearchTerm.toLowerCase()),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [institutions, bankSearchTerm]);

  const isRecipientFormValid = useCallback(() => {
    const institution = watch("institution");
    const accountIdentifier = watch("accountIdentifier");

    return (
      !!institution &&
      !!accountIdentifier &&
      accountIdentifier.toString().length >= 10 &&
      !!recipientName &&
      !errors.institution &&
      !errors.accountIdentifier
    );
  }, [watch, errors, recipientName]);

  const isMobileMoneyFormValid = useCallback(() => {
    const mobileAccountIdentifier = watch("accountIdentifier");
    return (
      !!selectedMobileMoneyInstitution &&
      !!mobileAccountIdentifier &&
      mobileAccountIdentifier.toString().length >= 10 &&
      !!recipientName &&
      !errors.accountIdentifier
    );
  }, [
    watch,
    selectedMobileMoneyInstitution,
    recipientName,
    errors.accountIdentifier,
  ]);

  const saveRecipient = () => {
    if (selectedTab === "bank-transfer" && isRecipientFormValid()) {
      // Save bank transfer recipient
      const newRecipient: RecipientDetails = {
        name: recipientName,
        institution: selectedInstitution?.name || "",
        institutionCode: watch("institution")?.toString() || "",
        accountIdentifier: watch("accountIdentifier")?.toString() || "",
      };
      const updatedRecipients = [...savedBankTransferRecipients, newRecipient];
      setSavedBankTransferRecipients(updatedRecipients);
      setSelectedRecipient(newRecipient);
      setIsModalOpen(false);

      // Only save to localStorage if it's not a duplicate
      const isDuplicate = savedBankTransferRecipients.some(
        (r) =>
          r.accountIdentifier === newRecipient.accountIdentifier &&
          r.institutionCode === newRecipient.institutionCode,
      );
      if (!isDuplicate) {
        localStorage.setItem(
          "savedBankTransferRecipients",
          JSON.stringify(updatedRecipients),
        );
      }
    } else if (selectedTab === "mobile-money" && isMobileMoneyFormValid()) {
      // Save mobile money recipient
      const newRecipient: RecipientDetails = {
        name: recipientName,
        institution: selectedMobileMoneyInstitution?.name || "",
        institutionCode: selectedMobileMoneyInstitution?.code || "",
        accountIdentifier: watch("accountIdentifier")?.toString() || "",
      };
      const updatedRecipients = [...savedMobileMoneyRecipients, newRecipient];
      setSavedMobileMoneyRecipients(updatedRecipients);
      setSelectedRecipient(newRecipient);
      setIsModalOpen(false);

      // Only save to localStorage if it's not a duplicate
      const isDuplicate = savedMobileMoneyRecipients.some(
        (r) =>
          r.accountIdentifier === newRecipient.accountIdentifier &&
          r.institutionCode === newRecipient.institutionCode,
      );
      if (!isDuplicate) {
        localStorage.setItem(
          "savedMobileMoneyRecipients",
          JSON.stringify(updatedRecipients),
        );
      }
    }
  };

  const selectSavedRecipient = (recipient: RecipientDetails) => {
    setSelectedRecipient(recipient);
    register("institution", { value: recipient.institutionCode });
    register("recipientName", { value: recipient.name });
    setValue("accountIdentifier", recipient.accountIdentifier);
    setRecipientName(recipient.name);
    setIsModalOpen(false);
  };

  const deleteRecipient = (recipientToDelete: RecipientDetails) => {
    setRecipientToDelete(recipientToDelete);
    setTimeout(() => {
      const updatedBankTransferRecipients = savedBankTransferRecipients.filter(
        (r) =>
          r.accountIdentifier !== recipientToDelete.accountIdentifier ||
          r.institution !== recipientToDelete.institution,
      );
      const updatedMobileMoneyRecipients = savedMobileMoneyRecipients.filter(
        (r) =>
          r.accountIdentifier !== recipientToDelete.accountIdentifier ||
          r.institution !== recipientToDelete.institution,
      );
      setSavedBankTransferRecipients(updatedBankTransferRecipients);
      setSavedMobileMoneyRecipients(updatedMobileMoneyRecipients);
      localStorage.setItem(
        "savedBankTransferRecipients",
        JSON.stringify(updatedBankTransferRecipients),
      );
      localStorage.setItem(
        "savedMobileMoneyRecipients",
        JSON.stringify(updatedMobileMoneyRecipients),
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

  const filteredSavedRecipients = useMemo(() => {
    const allRecipients = [
      ...savedBankTransferRecipients,
      ...savedMobileMoneyRecipients,
    ];
    return allRecipients.filter(
      (recipient) =>
        recipient.name
          .toLowerCase()
          .includes(beneficiarySearchTerm.toLowerCase()) ||
        recipient.accountIdentifier.includes(beneficiarySearchTerm),
    );
  }, [
    savedBankTransferRecipients,
    savedMobileMoneyRecipients,
    beneficiarySearchTerm,
  ]);

  const getRandomColor = (name: string) => {
    // Generate a color based on the recipient's name
    const index = name
      .split("")
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[index % colors.length];
  };

  // * USE EFFECTS

  useEffect(() => {
    const savedBankTransferRecipientsFromStorage = localStorage.getItem(
      "savedBankTransferRecipients",
    );
    if (savedBankTransferRecipientsFromStorage) {
      setSavedBankTransferRecipients(
        JSON.parse(savedBankTransferRecipientsFromStorage),
      );
    }
    const savedMobileMoneyRecipientsFromStorage = localStorage.getItem(
      "savedMobileMoneyRecipients",
    );
    if (savedMobileMoneyRecipientsFromStorage) {
      setSavedMobileMoneyRecipients(
        JSON.parse(savedMobileMoneyRecipientsFromStorage),
      );
    }
  }, []);

  useEffect(() => {
    if (selectedInstitution) {
      register("institution", { value: selectedInstitution.code });
      // Reset recipient name when bank changes
      setRecipientName("");
      setRecipientNameError("");
    }
  }, [selectedInstitution, register]);

  // Fetch recipient name based on institution and account identifier
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    const getRecipientName = async () => {
      if (
        !institution ||
        !accountIdentifier ||
        accountIdentifier.toString().length < 10
      )
        return;

      setIsFetchingRecipientName(true);

      try {
        const accountName = await fetchAccountName({
          institution: institution.toString(),
          accountIdentifier: accountIdentifier.toString(),
        });
        setRecipientName(accountName);
        register("recipientName", { value: accountName });
        setIsFetchingRecipientName(false);
      } catch (error) {
        setRecipientName("");
        setRecipientNameError(
          "Oops... we couldn't resolve the account details",
        );
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountIdentifier, institution]);

  useEffect(() => {
    setSelectedTab("bank-transfer");
  }, [currency]);

  return (
    <>
      {selectedRecipient ? (
        <div className="space-y-2 rounded-2xl bg-white p-4 text-sm dark:bg-neutral-900">
          <div className="flex items-center justify-between">
            <p className="text-gray-500 dark:text-white/50">Recipient</p>
            <Button
              onClick={() => setIsModalOpen(true)}
              className="text-primary dark:text-primary"
            >
              Edit
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2 font-light text-gray-700 dark:text-white/80">
            <p className="rounded-lg bg-gray-100 px-3 py-1 text-center capitalize dark:bg-neutral-800">
              {selectedRecipient.name.toLowerCase()}
            </p>
            <p className="rounded-lg bg-gray-100 px-3 py-1 text-center dark:bg-neutral-800">
              {selectedRecipient.accountIdentifier}
            </p>
            <p className="rounded-lg bg-gray-100 px-3 py-1 text-center dark:bg-neutral-800">
              {selectedRecipient.institution}
            </p>
          </div>
        </div>
      ) : (
        <Button
          onClick={() => setIsModalOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-transparent px-3 py-2.5 text-sm text-black outline-none transition-all hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-50 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed dark:border-white/10 dark:text-white dark:hover:bg-white/5 dark:focus-visible:ring-offset-neutral-900"
        >
          <AddUserIcon className="text-outline-gray dark:text-white/50" />
          <p>Add recipient</p>
        </Button>
      )}

      <Dialog
        open={isModalOpen}
        as="div"
        className="relative z-20 focus:outline-none"
        onClose={() => setIsModalOpen(false)}
      >
        <DialogBackdrop className="fixed inset-0 bg-black/30 backdrop-blur-sm" />

        <div className="fixed inset-0 w-screen overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <DialogPanel
              transition
              className="data-[closed]:transform-[scale(95%)] w-full max-w-md space-y-4 duration-300 ease-out data-[closed]:opacity-0"
            >
              <div className="space-y-4 rounded-2xl bg-white p-4 dark:bg-neutral-900">
                <DialogTitle as="h3" className="text-base/7 font-medium">
                  Add recipient
                </DialogTitle>

                <div className="grid gap-4 rounded-3xl text-sm">
                  {/* Tabs */}
                  <div className="flex gap-6 font-medium">
                    <button
                      type="button"
                      className={`transition-all duration-300 ${
                        selectedTab === "bank-transfer"
                          ? "text-neutral-900 dark:text-white"
                          : "text-gray-400 dark:text-white/40"
                      }`}
                      onClick={() => setSelectedTab("bank-transfer")}
                    >
                      Bank transfer
                    </button>
                    <button
                      type="button"
                      className={`flex items-center gap-1 transition-all duration-300 disabled:cursor-not-allowed ${
                        selectedTab === "mobile-money"
                          ? "text-neutral-900 dark:text-white"
                          : "text-gray-400 dark:text-white/40"
                      }`}
                      disabled={currency !== "KES"}
                      onClick={() => setSelectedTab("mobile-money")}
                    >
                      Mobile money
                      {currency !== "KES" && (
                        <span className="text-xs font-light italic">
                          (Coming soon!)
                        </span>
                      )}
                    </button>
                  </div>

                  {/* Bank Transfer Tab Contents */}
                  {selectedTab === "bank-transfer" && (
                    <motion.div
                      key="bank-transfer"
                      {...fadeInOut}
                      transition={{ duration: 0.3 }}
                      className="grid gap-4"
                    >
                      <div className="relative flex flex-row items-start gap-4">
                        {/* Bank */}
                        <div ref={institutionsDropdownRef} className="flex-1">
                          {/* Banks Dropdown Button */}
                          <Button
                            onClick={() =>
                              setIsInstitutionsDropdownOpen(
                                !isInstitutionsDropdownOpen,
                              )
                            }
                            disabled={isFetchingInstitutions}
                            className="flex w-full items-center justify-between gap-2 rounded-xl border border-gray-200 px-3 py-2.5 text-left text-sm text-neutral-900 outline-none transition-all hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-50 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed dark:border-white/20 dark:text-white/80 dark:hover:bg-white/5 dark:focus:bg-neutral-950 dark:focus-visible:ring-offset-neutral-900"
                          >
                            {selectedInstitution ? (
                              <p className="truncate">
                                {selectedInstitution.name}
                              </p>
                            ) : (
                              <p>Select bank</p>
                            )}

                            {isFetchingInstitutions ? (
                              <ImSpinner className="animate-spin text-base text-gray-400" />
                            ) : (
                              <PiCaretDown
                                className={classNames(
                                  "text-base text-gray-400 transition-transform dark:text-white/50",
                                  isInstitutionsDropdownOpen
                                    ? "rotate-180"
                                    : "",
                                )}
                              />
                            )}
                          </Button>

                          {/* Banks Dropdown */}
                          {isInstitutionsDropdownOpen && (
                            <motion.div
                              initial="closed"
                              animate={
                                isInstitutionsDropdownOpen ? "open" : "closed"
                              }
                              exit="closed"
                              variants={dropdownVariants}
                              className="scrollbar-hide absolute right-0 z-10 mt-2 max-h-80 w-full max-w-full overflow-y-auto rounded-xl bg-gray-50 shadow-xl dark:bg-neutral-800"
                            >
                              <h4 className="px-4 pt-4 font-medium">
                                Select bank
                              </h4>
                              <div className="sticky top-0 bg-gray-50 p-4 dark:bg-neutral-800">
                                {/* Search banks */}
                                <div className="relative">
                                  <CiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-lg text-gray-400" />
                                  <input
                                    type="search"
                                    placeholder="Search banks..."
                                    value={bankSearchTerm}
                                    onChange={(e) =>
                                      setBankSearchTerm(e.target.value)
                                    }
                                    className="w-full rounded-xl border border-gray-300 bg-gray-50 py-2.5 pl-9 pr-3 text-sm outline-none transition-all duration-300 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none dark:border-white/20 dark:bg-neutral-800 dark:text-white/80 dark:placeholder:text-white/40 dark:focus:border-white/40 dark:focus:ring-offset-neutral-900"
                                  />
                                </div>
                              </div>
                              {/* Banks list */}
                              <ul
                                role="list"
                                aria-labelledby="networks-dropdown"
                                className="px-2 pb-2"
                              >
                                {filteredInstitutions.length > 0 ? (
                                  filteredInstitutions.map((institution) => (
                                    <li
                                      key={institution.code}
                                      onClick={() => {
                                        setSelectedInstitution(institution);
                                        setIsInstitutionsDropdownOpen(false);
                                        register("institution", {
                                          value: institution.code,
                                          required: {
                                            value: true,
                                            message: "Select bank",
                                          },
                                        });
                                      }}
                                      className={classNames(
                                        "flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-neutral-900 transition-all hover:bg-gray-200 dark:text-white/80 dark:hover:bg-white/5",
                                        selectedInstitution?.code ===
                                          institution.code
                                          ? "bg-gray-200 dark:bg-white/5"
                                          : "",
                                      )}
                                    >
                                      {institution.name}
                                    </li>
                                  ))
                                ) : (
                                  <li className="flex items-center justify-center gap-2 py-4">
                                    <p>No banks found</p>
                                  </li>
                                )}
                              </ul>
                            </motion.div>
                          )}
                        </div>

                        {/* Account number */}
                        <div className="flex-1">
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
                            })}
                            className="w-full rounded-xl border border-gray-300 bg-transparent px-3 py-2.5 text-sm outline-none transition-all duration-300 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none dark:border-white/20 dark:text-white/80 dark:placeholder:text-white/40 dark:focus:border-white/40 dark:focus:ring-offset-neutral-900"
                          />
                        </div>
                      </div>

                      {/* Account details feedback */}
                      <AnimatePresence mode="wait">
                        {isFetchingRecipientName ? (
                          <div className="flex items-center gap-1 text-gray-400 dark:text-white/50">
                            <AnimatedFeedbackItem>
                              <ImSpinner className="animate-spin text-sm" />
                              <p className="text-xs">
                                Fetching account details
                              </p>
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
                                    backgroundPosition: [
                                      "0% 50%",
                                      "100% 50%",
                                      "0% 50%",
                                    ],
                                  }}
                                  transition={{
                                    duration: 3,
                                    repeat: Infinity,
                                    ease: "easeInOut",
                                  }}
                                >
                                  <p className="rounded-lg bg-gray-200 px-3 py-1 capitalize text-neutral-900 dark:bg-neutral-800 dark:text-white">
                                    {recipientName.toLowerCase()}
                                  </p>
                                </motion.div>
                                <PiCheck className="text-lg text-green-700 dark:text-green-500" />
                              </AnimatedFeedbackItem>
                            ) : errors.accountIdentifier ? (
                              <InputError
                                message={errors.accountIdentifier.message}
                              />
                            ) : recipientNameError ? (
                              <InputError message={recipientNameError} />
                            ) : null}
                          </>
                        )}
                      </AnimatePresence>

                      <div className="flex items-center gap-4">
                        <Button
                          type="reset"
                          onClick={() => setIsModalOpen(false)}
                          className={classNames(
                            secondaryBtnClasses,
                            isFetchingRecipientName ? "cursor-not-allowed" : "",
                          )}
                          disabled={isFetchingRecipientName}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          onClick={saveRecipient}
                          className={classNames(primaryBtnClasses, "w-full")}
                          disabled={
                            !recipientName ||
                            isFetchingRecipientName ||
                            !isRecipientFormValid()
                          }
                        >
                          Add recipient
                        </Button>
                      </div>
                    </motion.div>
                  )}

                  {/* Mobile Money Tab Contents */}
                  {selectedTab === "mobile-money" && (
                    <motion.div
                      key="mobile-money"
                      {...fadeInOut}
                      transition={{ duration: 0.3 }}
                      className="space-y-4"
                    >
                      <div className="flex w-full gap-3">
                        {kenyaMobileMoneyOptions.map((provider) => (
                          <button
                            key={provider.code}
                            type="button"
                            className={`flex items-center gap-2 rounded-lg border border-gray-300 p-1 pr-2 uppercase outline-none transition focus-within:border-gray-400 dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:focus-within:border-white/20 ${selectedMobileMoneyInstitution?.name === provider.code ? "bg-gray-200 dark:bg-white/5" : ""}`}
                            onClick={() => {
                              setSelectedMobileMoneyInstitution({
                                name: provider.name,
                                code: provider.code.toLowerCase(),
                                type: "mobile-money",
                              });
                              register("institution", {
                                value: provider.code.toLowerCase(),
                              });
                            }}
                          >
                            <Image
                              src={`/logos/${provider.code.toLowerCase()}-logo.svg`}
                              alt={`${provider.code} logo`}
                              width={0}
                              height={0}
                              className="size-8 rounded-md"
                            />
                            <div>{provider.name}</div>
                            {selectedMobileMoneyInstitution?.code.toLowerCase() ===
                            provider.code.toLowerCase() ? (
                              <PiCheckCircleFill className="text-lg text-green-700 dark:text-green-500" />
                            ) : (
                              <TbCircle className="text-lg text-gray-300 dark:text-white/10" />
                            )}
                          </button>
                        ))}
                      </div>
                      <div className="flex rounded-xl border border-gray-300 outline-none transition focus-within:border-gray-400 dark:border-white/20 dark:focus-within:border-white/40">
                        <span className="flex select-none items-center pl-4 text-gray-500 dark:text-white/80">
                          +234
                        </span>
                        <input
                          type="number"
                          {...register("accountIdentifier", {
                            required: {
                              value: true,
                              message: "Phone number is required",
                            },
                            minLength: {
                              value: 10,
                              message: "Phone number is invalid",
                            },
                          })}
                          className="w-full rounded-xl bg-transparent px-4 py-2.5 text-sm outline-none transition-all duration-300 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none dark:border-white/20 dark:text-white/80 dark:placeholder:text-white/40 dark:focus:border-white/40 dark:focus:ring-offset-neutral-900"
                          placeholder="Mobile number"
                        />
                      </div>

                      <AnimatedFeedbackItem className="justify-between text-gray-400 dark:text-white/50">
                        <motion.div
                          className="relative overflow-hidden rounded-lg p-0.5"
                          style={{
                            background:
                              "linear-gradient(90deg, #CB2DA899, #8250DF46, #F2690C99)",
                            backgroundSize: "200% 100%",
                          }}
                          animate={{
                            backgroundPosition: [
                              "0% 50%",
                              "100% 50%",
                              "0% 50%",
                            ],
                          }}
                          transition={{
                            duration: 3,
                            repeat: Infinity,
                            ease: "easeInOut",
                          }}
                        >
                          <p className="rounded-lg bg-gray-200 px-3 py-1 capitalize text-neutral-900 dark:bg-neutral-800 dark:text-white">
                            John Doe
                          </p>
                        </motion.div>
                        <PiCheck className="text-lg text-green-700 dark:text-green-500" />
                      </AnimatedFeedbackItem>

                      <div className="flex items-center gap-4">
                        <Button
                          type="reset"
                          onClick={() => setIsModalOpen(false)}
                          className={classNames(
                            secondaryBtnClasses,
                            isFetchingRecipientName ? "cursor-not-allowed" : "",
                          )}
                          disabled={isFetchingRecipientName}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          onClick={saveRecipient}
                          className={classNames(primaryBtnClasses, "w-full")}
                          disabled={
                            !recipientName ||
                            isFetchingRecipientName ||
                            !isMobileMoneyFormValid()
                          }
                        >
                          Add recipient
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>

              {selectedTab === "bank-transfer" &&
                savedBankTransferRecipients.length > 0 && (
                  <div className="rounded-2xl bg-white p-4 dark:bg-neutral-900">
                    <Button
                      className="flex w-full items-center justify-between"
                      onClick={() =>
                        setIsSavedRecipientsOpen(!isSavedRecipientsOpen)
                      }
                    >
                      <p>Saved bank transfer recipients</p>
                      <PiCaretDown
                        className={classNames(
                          "text-base text-gray-400 transition-transform dark:text-white/50",
                          isSavedRecipientsOpen ? "rotate-180" : "",
                        )}
                      />
                    </Button>
                    {isSavedRecipientsOpen && (
                      <motion.div
                        initial="closed"
                        animate="open"
                        exit="closed"
                        variants={dropdownVariants}
                        className="scrollbar-hide mt-4 max-h-80 space-y-2 overflow-y-auto"
                      >
                        {/* Search beneficiaries */}
                        <div className="sticky top-0 bg-white pb-2 dark:bg-neutral-900">
                          <div className="relative">
                            <CiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-lg text-gray-400" />
                            <input
                              type="search"
                              placeholder="Search beneficiaries by name or account number"
                              value={beneficiarySearchTerm}
                              onChange={(e) =>
                                setBeneficiarySearchTerm(e.target.value)
                              }
                              className="w-full rounded-xl border border-gray-300 bg-transparent py-2.5 pl-9 pr-3 text-sm outline-none transition-all duration-300 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none dark:border-white/20 dark:text-white/80 dark:placeholder:text-white/40 dark:focus:border-white/40 dark:focus:ring-offset-neutral-900"
                            />
                          </div>
                        </div>

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
                                transition={{ duration: 0.3 }}
                              >
                                <Button
                                  className={`group flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-white/5 ${
                                    recipientToDelete === recipient
                                      ? "bg-red-100 dark:bg-red-900/30"
                                      : ""
                                  }`}
                                  onClick={() =>
                                    selectSavedRecipient(recipient)
                                  }
                                >
                                  <div className="flex items-center gap-3">
                                    <div
                                      className={classNames(
                                        "hidden size-11 rounded-xl p-2 text-base text-white sm:grid sm:place-content-center",
                                        getRandomColor(recipient.name),
                                      )}
                                    >
                                      {recipient.name
                                        .split(" ")
                                        .slice(0, 2)
                                        .map((name) => name[0].toUpperCase())
                                        .join("")}
                                    </div>
                                    <div>
                                      <p className="capitalize text-neutral-900 dark:text-white/80">
                                        {recipient.name.toLowerCase()}
                                      </p>
                                      <p className="flex flex-wrap items-center gap-x-1 text-gray-500 dark:text-white/50">
                                        <span>
                                          {recipient.accountIdentifier}
                                        </span>
                                        <span className="text-lg dark:text-white/5">
                                          •
                                        </span>
                                        <span>{recipient.institution}</span>
                                      </p>
                                    </div>
                                  </div>
                                  <Button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      deleteRecipient(recipient);
                                    }}
                                    className="group-hover:block sm:hidden"
                                  >
                                    <TrashIcon className="size-4 stroke-gray-500 dark:stroke-white/50" />
                                  </Button>
                                </Button>
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
                      </motion.div>
                    )}
                  </div>
                )}

              {selectedTab === "mobile-money" &&
                savedMobileMoneyRecipients.length > 0 && (
                  <div className="rounded-2xl bg-white p-4 dark:bg-neutral-900">
                    <Button
                      className="flex w-full items-center justify-between"
                      onClick={() =>
                        setIsSavedRecipientsOpen(!isSavedRecipientsOpen)
                      }
                    >
                      <p>Saved mobile money recipients</p>
                      <PiCaretDown
                        className={classNames(
                          "text-base text-gray-400 transition-transform dark:text-white/50",
                          isSavedRecipientsOpen ? "rotate-180" : "",
                        )}
                      />
                    </Button>
                    {isSavedRecipientsOpen && (
                      <motion.div
                        initial="closed"
                        animate="open"
                        exit="closed"
                        variants={dropdownVariants}
                        className="scrollbar-hide mt-4 max-h-80 space-y-2 overflow-y-auto"
                      >
                        {/* Search beneficiaries */}
                        <div className="sticky top-0 bg-white pb-2 dark:bg-neutral-900">
                          <div className="relative">
                            <CiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-lg text-gray-400" />
                            <input
                              type="search"
                              placeholder="Search beneficiaries by name or account number"
                              value={beneficiarySearchTerm}
                              onChange={(e) =>
                                setBeneficiarySearchTerm(e.target.value)
                              }
                              className="w-full rounded-xl border border-gray-300 bg-transparent py-2.5 pl-9 pr-3 text-sm outline-none transition-all duration-300 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none dark:border-white/20 dark:text-white/80 dark:placeholder:text-white/40 dark:focus:border-white/40 dark:focus:ring-offset-neutral-900"
                            />
                          </div>
                        </div>

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
                                transition={{ duration: 0.3 }}
                              >
                                <Button
                                  className={`group flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-white/5 ${
                                    recipientToDelete === recipient
                                      ? "bg-red-100 dark:bg-red-900/30"
                                      : ""
                                  }`}
                                  onClick={() =>
                                    selectSavedRecipient(recipient)
                                  }
                                >
                                  <div className="flex items-center gap-3">
                                    <div
                                      className={classNames(
                                        "hidden size-11 rounded-xl p-2 text-base text-white sm:grid sm:place-content-center",
                                        getRandomColor(recipient.name),
                                      )}
                                    >
                                      {recipient.name
                                        .split(" ")
                                        .slice(0, 2)
                                        .map((name) => name[0].toUpperCase())
                                        .join("")}
                                    </div>
                                    <div>
                                      <p className="capitalize text-neutral-900 dark:text-white/80">
                                        {recipient.name.toLowerCase()}
                                      </p>
                                      <p className="flex flex-wrap items-center gap-x-1 text-gray-500 dark:text-white/50">
                                        <span>
                                          {recipient.accountIdentifier}
                                        </span>
                                        <span className="text-lg dark:text-white/5">
                                          •
                                        </span>
                                        <span>{recipient.institution}</span>
                                      </p>
                                    </div>
                                  </div>
                                  <Button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      deleteRecipient(recipient);
                                    }}
                                    className="group-hover:block sm:hidden"
                                  >
                                    <TrashIcon className="size-4 stroke-gray-500 dark:stroke-white/50" />
                                  </Button>
                                </Button>
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
                      </motion.div>
                    )}
                  </div>
                )}
            </DialogPanel>
          </div>
        </div>
      </Dialog>
    </>
  );
};
