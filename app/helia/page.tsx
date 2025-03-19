"use client";
import { useState } from "react";
import { useStorage } from "../context/StorageContext";
import { toast } from "sonner";

/**
 * Transaction type for testing structured data
 */
type Transaction = {
  id: string;
  timestamp: string;
  amount: string;
  currency: string;
  recipient: string;
};

/**
 * Helia DAG Storage Test Page
 */
export default function HeliaTestPage() {
  const storage = useStorage();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [savedCid, setSavedCid] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Generate a mock transaction for testing
   */
  const generateMockTransaction = (): Transaction => {
    const randomId = Math.floor(Math.random() * 1000000).toString();
    const randomAmount = (Math.random() * 1000).toFixed(2);

    return {
      id: randomId,
      timestamp: new Date().toISOString(),
      amount: randomAmount,
      currency: "USDC",
      recipient:
        "0x" +
        Array(40)
          .fill(0)
          .map(() => Math.floor(Math.random() * 16).toString(16))
          .join(""),
    };
  };

  /**
   * Add a new mock transaction and save to Helia
   */
  const addTransaction = async () => {
    if (!storage?.save || !storage.isInitialized) {
      toast.error("Storage not initialized");
      return;
    }

    try {
      setIsLoading(true);
      const newTransaction = generateMockTransaction();
      const updatedTransactions = [...transactions, newTransaction];
      setTransactions(updatedTransactions);

      // Save structured data to Helia
      const dataToSave = {
        transactions: updatedTransactions,
        metadata: {
          count: updatedTransactions.length,
          lastUpdated: new Date().toISOString(),
        },
      };

      const cid = await storage.save(dataToSave);
      setSavedCid(cid);
      toast.success("Transactions saved to Helia");
    } catch (error) {
      console.error("Failed to save transactions:", error);
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Load transactions from Helia
   */
  const loadTransactions = async () => {
    if (!savedCid) {
      toast.error("No CID available. Save some transactions first.");
      return;
    }

    if (!storage?.retrieve || !storage.isInitialized) {
      toast.error("Storage not initialized");
      return;
    }

    try {
      setIsLoading(true);
      // Retrieve structured data from Helia
      const data = await storage.retrieve(savedCid);

      if (data && data.transactions && Array.isArray(data.transactions)) {
        setTransactions(data.transactions);
        toast.success(
          `Loaded ${data.transactions.length} transactions from Helia`,
        );

        // Display metadata to show the full data structure was retrieved
        if (data.metadata) {
          toast.info(
            `Last updated: ${new Date(data.metadata.lastUpdated).toLocaleString()}`,
          );
        }
      } else {
        toast.error("Invalid data format retrieved");
      }
    } catch (error) {
      console.error("Failed to load transactions:", error);
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-6 text-2xl font-bold text-neutral-900 dark:text-white">
        Structured Data with Helia
      </h1>

      <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-surface-canvas">
        <h2 className="mb-4 text-xl font-semibold text-neutral-900 dark:text-white">
          Store and Retrieve Complex Data Structures
        </h2>

        <div className="mb-6 flex flex-wrap gap-4">
          <button
            onClick={addTransaction}
            disabled={isLoading || !storage?.isInitialized}
            className="rounded-lg bg-lavender-500 px-4 py-2 font-medium text-white transition-colors hover:bg-lavender-600 disabled:opacity-50"
          >
            {isLoading ? "Processing..." : "Add Transaction"}
          </button>

          <button
            onClick={loadTransactions}
            disabled={isLoading || !storage?.isInitialized || !savedCid}
            className="rounded-lg border border-lavender-500 bg-white px-4 py-2 font-medium text-lavender-500 transition-colors hover:bg-lavender-50 disabled:opacity-50 dark:bg-transparent dark:hover:bg-gray-700"
          >
            {isLoading ? "Loading..." : "Load Transactions"}
          </button>
        </div>

        {savedCid && (
          <div className="mb-6 rounded-md bg-background-neutral p-4 dark:bg-gray-700">
            <h3 className="mb-2 font-medium text-neutral-900 dark:text-white">
              Content ID (CID):
            </h3>
            <p className="break-all font-mono text-sm text-text-body dark:text-gray-300">
              {savedCid}
            </p>
          </div>
        )}

        {/* Transaction table */}
        {transactions.length > 0 ? (
          <div className="max-h-96 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full table-auto">
              <thead className="sticky top-0 bg-background-neutral text-left text-xs uppercase text-text-secondary dark:bg-gray-900 dark:text-gray-300">
                <tr>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Recipient</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {transactions.map((tx) => (
                  <tr
                    key={tx.id}
                    className="bg-white hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700"
                  >
                    <td className="px-4 py-3 text-sm text-neutral-900 dark:text-white">
                      {tx.id}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary dark:text-gray-300">
                      {new Date(tx.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-neutral-900 dark:text-white">
                      {tx.amount} {tx.currency}
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-xs text-text-secondary dark:text-gray-400">
                      {tx.recipient}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-4 text-center text-text-secondary dark:text-gray-400">
            No transactions found. Add a transaction to get started.
          </p>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-surface-canvas">
        <h3 className="mb-3 font-medium text-neutral-900 dark:text-white">
          What's Different in Stage 2
        </h3>
        <p className="mb-2 text-sm text-text-secondary dark:text-gray-300">
          Now using <span className="font-mono">dagJson</span> instead of{" "}
          <span className="font-mono">strings</span>
        </p>
        <p className="mb-2 text-sm text-text-secondary dark:text-gray-300">
          This allows storing complex objects with nested data structures
        </p>
        <p className="text-sm text-text-secondary dark:text-gray-300">
          Helia Status:{" "}
          {storage?.isInitialized ? "✅ Ready" : "⏳ Initializing..."}
        </p>
      </div>
    </div>
  );
}
