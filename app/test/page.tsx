"use client";
import { useState, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { AnimatePresence, motion } from "framer-motion";
import { ImSpinner } from "react-icons/im";
import { CheckmarkCircle01Icon, InformationSquareIcon } from "hugeicons-react";
import {
  fetchSavedRecipients,
  saveRecipient,
  deleteSavedRecipient,
  migrateLocalStorageRecipients,
} from "@/app/api/aggregator";
import {
  AnimatedComponent,
  scaleInOut,
  fadeInOut,
  slideInOut,
  fadeUpAnimation,
} from "@/app/components";
import { RecipientListItem } from "@/app/components/recipient/RecipientListItem";
import type { RecipientDetails, RecipientDetailsWithId } from "@/app/types";

// Mock data for testing
const mockRecipients: RecipientDetails[] = [
  {
    name: "John Doe",
    institution: "First Bank of Nigeria",
    institutionCode: "FBNNGLA",
    accountIdentifier: "1234567890",
    type: "bank",
  },
  {
    name: "Jane Smith",
    institution: "Access Bank",
    institutionCode: "ACCESSNGLA",
    accountIdentifier: "0987654321",
    type: "bank",
  },
  {
    name: "Mike Johnson",
    institution: "Opay",
    institutionCode: "OPAYNGPC",
    accountIdentifier: "08012345678",
    type: "mobile_money",
  },
  {
    name: "Sarah Wilson",
    institution: "PalmPay",
    institutionCode: "PALMNGPC",
    accountIdentifier: "08087654321",
    type: "mobile_money",
  },
  {
    name: "David Brown",
    institution: "GTBank",
    institutionCode: "GTBINGLA",
    accountIdentifier: "1111111111",
    type: "bank",
  },
];

export default function TestPage() {
  const { getAccessToken, authenticated } = usePrivy();
  const [recipients, setRecipients] = useState<RecipientDetailsWithId[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingRecipientId, setDeletingRecipientId] = useState<string | null>(
    null,
  );
  const [response, setResponse] = useState<string>("");
  const [error, setError] = useState<string>("");

  // Test form state for "Add to beneficiaries" functionality
  const [testRecipientName, setTestRecipientName] = useState("John Doe");
  const [testInstitutionCode, setTestInstitutionCode] = useState("FBNNGLA");
  const [testAccountIdentifier, setTestAccountIdentifier] =
    useState("1234567890");
  const [testAccountType, setTestAccountType] = useState<
    "bank" | "mobile_money"
  >("bank");
  const [testAddToBeneficiaries, setTestAddToBeneficiaries] = useState(false);
  const [testIsSavingRecipient, setTestIsSavingRecipient] = useState(false);
  const [testShowSaveSuccess, setTestShowSaveSuccess] = useState(false);
  const [testIsRecipientInBeneficiaries, setTestIsRecipientInBeneficiaries] =
    useState(false);

  const showResponse = (message: string) => {
    setResponse(message);
    setError("");
    setTimeout(() => setResponse(""), 5000);
  };

  const showError = (message: string) => {
    setError(message);
    setResponse("");
    setTimeout(() => setError(""), 5000);
  };

  const handleFetchRecipients = async () => {
    if (!authenticated) {
      showError("Please authenticate first");
      return;
    }

    setLoading(true);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("No access token available");
      }

      const data = await fetchSavedRecipients(accessToken);
      setRecipients(data);
      showResponse(`Fetched ${data.length} recipients successfully`);
    } catch (err) {
      showError(
        err instanceof Error ? err.message : "Failed to fetch recipients",
      );
    } finally {
      setLoading(false);
    }
  };

  const silentRefreshRecipients = async () => {
    if (!authenticated) return;

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) return;

      const data = await fetchSavedRecipients(accessToken);
      setRecipients(data);
    } catch (err) {
      console.error("Silent refresh failed:", err);
    }
  };

  const handleSaveRecipient = async (recipient: RecipientDetails) => {
    if (!authenticated) {
      showError("Please authenticate first");
      return;
    }

    setLoading(true);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("No access token available");
      }

      const success = await saveRecipient(recipient, accessToken);
      if (success) {
        showResponse(`Saved recipient: ${recipient.name}`);
        // Refresh the list
        handleFetchRecipients();
      }
    } catch (err) {
      showError(
        err instanceof Error ? err.message : "Failed to save recipient",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRecipient = async (id: string, name: string) => {
    if (!authenticated) {
      showError("Please authenticate first");
      return;
    }

    setDeletingRecipientId(id);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("No access token available");
      }

      const success = await deleteSavedRecipient(id, accessToken);
      if (success) {
        showResponse(`Deleted recipient: ${name}`);
        // Update local state immediately like the modal does
        const updatedRecipients = recipients.filter((r) => r.id !== id);
        setRecipients(updatedRecipients);
      }
    } catch (err) {
      showError(
        err instanceof Error ? err.message : "Failed to delete recipient",
      );
    } finally {
      setDeletingRecipientId(null);
    }
  };

  const handleBulkAdd = async () => {
    if (!authenticated) {
      showError("Please authenticate first");
      return;
    }

    setLoading(true);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("No access token available");
      }

      let successCount = 0;
      for (const recipient of mockRecipients) {
        try {
          const success = await saveRecipient(recipient, accessToken);
          if (success) {
            successCount++;
          }
        } catch (error) {
          console.error(`Failed to save ${recipient.name}:`, error);
        }
      }
      showResponse(
        `Bulk added ${successCount}/${mockRecipients.length} recipients`,
      );
      // Refresh the list
      handleFetchRecipients();
    } catch (err) {
      showError(
        err instanceof Error ? err.message : "Failed to bulk add recipients",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleMigration = async () => {
    if (!authenticated) {
      showError("Please authenticate first");
      return;
    }

    setLoading(true);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("No access token available");
      }

      await migrateLocalStorageRecipients(accessToken);
      showResponse("Migration completed");
      // Refresh the list
      handleFetchRecipients();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Migration failed");
    } finally {
      setLoading(false);
    }
  };

  const handlePopulateLocalStorage = () => {
    try {
      localStorage.removeItem("recipientsMigrated");

      // Add mock recipients to localStorage
      localStorage.setItem("savedRecipients", JSON.stringify(mockRecipients));
      showResponse(
        `Added ${mockRecipients.length} recipients to localStorage. Refresh the page to see migration in action.`,
      );
    } catch (err) {
      showError("Failed to populate localStorage");
    }
  };

  // Test "Add to beneficiaries" functionality
  const handleTestAddToBeneficiariesChange = async (checked: boolean) => {
    setTestAddToBeneficiaries(checked);
    if (checked) {
      await handleTestAddBeneficiary();
    } else {
      await handleTestRemoveRecipient();
    }
  };

  const handleTestAddBeneficiary = async () => {
    setTestIsSavingRecipient(true);

    const institutionCode = testInstitutionCode;
    if (!institutionCode) {
      setTestIsSavingRecipient(false);
      return;
    }

    const institutionName = getInstitutionNameByCode(
      institutionCode,
      mockRecipients,
    );

    const newRecipient = {
      name: testRecipientName,
      institution: institutionName || institutionCode,
      institutionCode: String(institutionCode),
      accountIdentifier: String(testAccountIdentifier),
      type: testAccountType,
    };

    try {
      const accessToken = await getAccessToken();
      if (accessToken) {
        const success = await saveRecipient(newRecipient, accessToken);
        if (success) {
          setTestIsSavingRecipient(false);
          setTestShowSaveSuccess(true);

          setTimeout(() => {
            setTestShowSaveSuccess(false);
            // Add a small delay to allow fade out animation to complete
            setTimeout(() => {
              setTestIsRecipientInBeneficiaries(true);
            }, 300);
          }, 2000);

          // Refresh the recipients list
          await handleFetchRecipients();
        } else {
          setTestIsSavingRecipient(false);
        }
      } else {
        setTestIsSavingRecipient(false);
      }
    } catch (error) {
      console.error("Error saving recipient:", error);
      setTestIsSavingRecipient(false);
    }
  };

  const handleTestRemoveRecipient = async () => {
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        console.error("No access token available");
        return;
      }

      const savedRecipients = await fetchSavedRecipients(accessToken);
      const recipientToDelete = savedRecipients.find(
        (r) =>
          r.accountIdentifier === testAccountIdentifier &&
          r.institutionCode === testInstitutionCode,
      );

      if (!recipientToDelete) {
        console.error("Recipient not found in saved recipients");
        return;
      }

      const success = await deleteSavedRecipient(
        recipientToDelete.id,
        accessToken,
      );
      if (success) {
        setTestIsRecipientInBeneficiaries(false);
        console.log("Recipient removed successfully");

        // Refresh the recipients list
        await handleFetchRecipients();
      }
    } catch (error) {
      console.error("Error removing recipient:", error);
    }
  };

  const getInstitutionNameByCode = (
    code: string,
    recipients: RecipientDetails[],
  ): string | null => {
    const recipient = recipients.find((r) => r.institutionCode === code);
    return recipient ? recipient.institution : null;
  };

  useEffect(() => {
    const initializeTestPage = async () => {
      if (!authenticated) {
        return;
      }

      try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          return;
        }

        console.log("🔄 Auto-fetching recipients on page load...");
        await handleFetchRecipients();

        const savedRecipients = localStorage.getItem("savedRecipients");
        const migrationFlag = localStorage.getItem("recipientsMigrated");

        if (savedRecipients && !migrationFlag) {
          console.log("🔄 Auto-triggering migration on page load...");
          await migrateLocalStorageRecipients(accessToken);
          // Refresh the list after migration
          await handleFetchRecipients();
        }
      } catch (error) {
        console.error("Error initializing test page:", error);
      }
    };

    initializeTestPage();
  }, [authenticated, getAccessToken]);

  return (
    <div className="min-h-screen bg-gray-50 p-8 dark:bg-neutral-900">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-8 text-3xl font-bold text-neutral-900 dark:text-white">
          Saved Recipients API Test
        </h1>

        <div className="mb-6 rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-900/20">
          <p className="text-orange-800 dark:text-orange-200">
            <strong>Note:</strong> This test page tests the real saved
            recipients API endpoints with proper JWT authentication from Privy.
            You must be authenticated to use this page.
          </p>
        </div>

        {/* Response Messages */}
        {response && (
          <div className="mb-4 rounded border border-green-400 bg-green-100 p-4 text-green-700">
            {response}
          </div>
        )}
        {error && (
          <div className="mb-4 rounded border border-red-400 bg-red-100 p-4 text-red-700">
            {error}
          </div>
        )}

        {/* Test Controls */}
        <div className="mb-8 rounded-lg bg-white p-6 shadow dark:bg-neutral-800">
          <h2 className="mb-4 text-xl font-semibold text-neutral-900 dark:text-white">
            Test Operations
          </h2>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <button
              onClick={handleFetchRecipients}
              disabled={loading}
              className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Loading..." : "Fetch Recipients"}
            </button>

            <button
              onClick={handleMigration}
              disabled={loading}
              className="rounded bg-yellow-600 px-4 py-2 text-white hover:bg-yellow-700 disabled:opacity-50"
            >
              {loading ? "Loading..." : "Test Migration"}
            </button>

            <button
              onClick={handlePopulateLocalStorage}
              className="rounded bg-orange-600 px-4 py-2 text-white hover:bg-orange-700"
            >
              Populate localStorage
            </button>

            <button
              onClick={handleBulkAdd}
              disabled={loading}
              className="rounded bg-purple-600 px-4 py-2 text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {loading ? "Loading..." : "Bulk Add (Test 50 Limit)"}
            </button>
          </div>

          <div className="mt-4">
            <h3 className="mb-2 text-lg font-medium text-neutral-900 dark:text-white">
              Add Individual Recipients:
            </h3>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {mockRecipients.map((recipient, index) => (
                <button
                  key={index}
                  onClick={() => handleSaveRecipient(recipient)}
                  disabled={loading}
                  className="rounded bg-green-600 px-3 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50"
                >
                  Add {recipient.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Add to Beneficiaries Test */}
        <div className="mb-8 rounded-lg bg-white p-6 shadow dark:bg-neutral-800">
          <h2 className="mb-4 text-xl font-semibold text-neutral-900 dark:text-white">
            Add to Beneficiaries Test
          </h2>
          <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
            This section replicates the "Add to beneficiaries" functionality
            from the TransactionStatus page.
          </p>

          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-900">
            <div className="mb-4">
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Recipient Name
              </label>
              <input
                type="text"
                value={testRecipientName}
                onChange={(e) => setTestRecipientName(e.target.value)}
                placeholder="Enter recipient name"
                className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Institution
              </label>
              <select
                value={testInstitutionCode}
                onChange={(e) => setTestInstitutionCode(e.target.value)}
                className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
                aria-label="Select Institution"
                title="Select Institution"
              >
                <option value="">Select Institution</option>
                <option value="FBNNGLA">First Bank of Nigeria</option>
                <option value="ACCESSNGLA">Access Bank</option>
                <option value="GTBINGLA">GTBank</option>
                <option value="OPAYNGPC">Opay</option>
                <option value="PALMNGPC">PalmPay</option>
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Account Identifier
              </label>
              <input
                type="text"
                value={testAccountIdentifier}
                onChange={(e) => setTestAccountIdentifier(e.target.value)}
                placeholder="Enter account number/phone"
                className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Account Type
              </label>
              <select
                value={testAccountType}
                onChange={(e) =>
                  setTestAccountType(e.target.value as "bank" | "mobile_money")
                }
                className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
                aria-label="Select Account Type"
                title="Select Account Type"
              >
                <option value="bank">Bank</option>
                <option value="mobile_money">Mobile Money</option>
              </select>
            </div>

            {/* Add to Beneficiaries Checkbox with Animations */}
            {!testIsRecipientInBeneficiaries && (
              <AnimatePresence mode="wait">
                {testIsSavingRecipient ? (
                  <AnimatedComponent
                    key="saving"
                    variant={fadeUpAnimation}
                    className="flex items-center gap-2"
                  >
                    <div className="flex h-4 w-4 items-center justify-center">
                      <ImSpinner className="h-4 w-4 animate-spin text-gray-700 dark:text-gray-300" />
                      neutral
                    </div>
                    <span className="text-sm text-neutral-700 dark:text-neutral-300">
                      Saving to beneficiaries...
                    </span>
                  </AnimatedComponent>
                ) : testShowSaveSuccess ? (
                  <AnimatedComponent
                    key="success"
                    variant={slideInOut}
                    className="flex items-center gap-2"
                  >
                    <div className="flex h-4 w-4 items-center justify-center">
                      <CheckmarkCircle01Icon className="h-4 w-4 text-green-500" />
                    </div>
                    <span className="text-sm text-green-600 dark:text-green-400">
                      Saved to beneficiaries!
                    </span>
                  </AnimatedComponent>
                ) : (
                  <AnimatedComponent
                    key="checkbox"
                    variant={fadeUpAnimation}
                    className="flex items-center gap-2"
                  >
                    <input
                      type="checkbox"
                      checked={testAddToBeneficiaries}
                      onChange={(e) =>
                        handleTestAddToBeneficiariesChange(e.target.checked)
                      }
                      className="h-4 w-4 rounded border-neutral-300 text-lavender-500 focus:ring-lavender-500"
                      aria-label={`Add ${testRecipientName || "recipient"} to beneficiaries`}
                      title={`Add ${testRecipientName || "recipient"} to beneficiaries`}
                    />
                    <label className="text-sm text-neutral-700 dark:text-neutral-300">
                      Add {testRecipientName || "recipient"} to beneficiaries
                    </label>
                  </AnimatedComponent>
                )}
              </AnimatePresence>
            )}
          </div>
        </div>

        {/* Current Recipients - Modal UI Replica */}
        <div className="rounded-lg bg-white p-6 shadow dark:bg-neutral-800">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Saved beneficiaries
            </h2>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2 }}
            className="mt-2 h-[21rem] overflow-y-auto sm:h-[14rem]"
          >
            <AnimatePresence>
              {loading ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-3 py-12 text-center"
                >
                  <ImSpinner className="h-5 w-5 animate-spin text-gray-400" />
                  <p className="font-medium text-text-secondary dark:text-white/50">
                    Loading saved beneficiaries...
                  </p>
                </motion.div>
              ) : error ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="text-red-600 dark:text-red-400"
                >
                  <div className="flex flex-col items-center gap-2 py-12 text-center">
                    <InformationSquareIcon className="size-5" />
                    <p className="font-medium">{error}</p>
                    <p className="text-sm opacity-75">Please try again later</p>
                  </div>
                </motion.div>
              ) : recipients.length > 0 ? (
                recipients.map((recipient, index) => (
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
                    <RecipientListItem
                      recipient={recipient}
                      onSelect={() => console.log("Selected:", recipient.name)}
                      onDelete={() =>
                        handleDeleteRecipient(recipient.id, recipient.name)
                      }
                      isBeingDeleted={deletingRecipientId === recipient.id}
                    />
                  </motion.div>
                ))
              ) : (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="text-text-secondary dark:text-white/50"
                >
                  <div className="flex flex-col items-center gap-2 py-12 text-center">
                    <InformationSquareIcon className="size-5" />
                    <p className="font-medium">No saved beneficiaries found</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        {/* Instructions */}
        <div className="mt-8 rounded-lg border border-blue-200 bg-blue-50 p-6 dark:border-blue-800 dark:bg-blue-900/20">
          <h3 className="mb-2 text-lg font-semibold text-blue-900 dark:text-blue-100">
            Test Instructions:
          </h3>
          <ul className="list-inside list-disc space-y-1 text-blue-800 dark:text-blue-200">
            <li>
              <strong>Auto-load:</strong> Recipients are fetched automatically
              when you visit this page
            </li>
            <li>
              <strong>Auto-migration:</strong> localStorage recipients are
              migrated automatically on page load
            </li>
            <li>
              Use "Populate localStorage" to add mock recipients to localStorage
            </li>
            <li>
              Use "Test Migration" to manually migrate any localStorage
              recipients to Supabase
            </li>
            <li>
              Use "Add Individual Recipients" to test saving specific recipients
            </li>
            <li>Use "Bulk Add" to test the 50-recipient limit</li>
            <li>Use "Delete" buttons to remove individual recipients</li>
            <li>
              Check browser console for detailed API responses and migration
              logs
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
