"use client";
import { useState, useEffect } from "react";
import { useStorage } from "../context/StorageContext";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { toast } from "sonner";

/**
 * Transaction type definition
 */
type Transaction = {
  id: string;
  timestamp: string;
  amount: string;
  currency: string;
  recipient: string;
  status: string;
};

/**
 * Helia Encrypted Storage Test Page
 */
export default function HeliaTestPage() {
  const storage = useStorage();
  const { ready, authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [lastSavedCid, setLastSavedCid] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isRetrieving, setIsRetrieving] = useState(false);

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
      status: "completed",
    };
  };

  /**
   * Add a new mock transaction and save encrypted to IPFS
   */
  const addTransaction = async () => {
    if (!ready || !authenticated) {
      toast.error("Please connect your wallet first");
      return;
    }

    if (!storage?.save || !storage.isInitialized) {
      toast.error("Storage not initialized");
      return;
    }

    try {
      setIsSaving(true);
      const newTransaction = generateMockTransaction();
      const updatedTransactions = [...transactions, newTransaction];
      setTransactions(updatedTransactions);

      toast.info("Signing message to encrypt data...");
      // Save data with wallet-based encryption
      const cid = await storage.save("transactions", updatedTransactions);
      setLastSavedCid(cid);

      toast.success("Transaction encrypted and saved to IPFS");
    } catch (error) {
      console.error("Failed to save transaction:", error);
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Load transactions from IPFS
   */
  const loadTransactions = async () => {
    if (!ready || !authenticated) {
      toast.error("Please connect your wallet first");
      return;
    }

    if (!storage?.retrieve || !storage.isInitialized) {
      toast.error("Storage not initialized");
      return;
    }

    try {
      setIsRetrieving(true);
      toast.info("Retrieving encrypted transactions...");

      try {
        // Retrieve and decrypt data
        const data = await storage.retrieve("transactions");

        if (data && Array.isArray(data)) {
          setTransactions(data);
          toast.success("Transactions successfully retrieved and decrypted");
        } else {
          setTransactions([]);
          toast.info("No transactions found");
        }
      } catch (retrieveError) {
        console.error("Storage retrieval error:", retrieveError);

        // More specific error handling
        if (
          retrieveError instanceof Error &&
          retrieveError.message.includes("No stored data found")
        ) {
          toast.info("You haven't saved any transactions yet");
        } else if (
          retrieveError instanceof Error &&
          retrieveError.message.includes("Decryption failed")
        ) {
          toast.error(
            "Could not decrypt your data. You may need to save new transactions first.",
          );
        } else {
          toast.error(
            retrieveError instanceof Error
              ? retrieveError.message
              : "Failed to load transactions",
          );
        }

        setTransactions([]);
      }
    } catch (error) {
      console.error("Failed to load transactions:", error);
      toast.error(error instanceof Error ? error.message : String(error));
      setTransactions([]);
    } finally {
      setIsRetrieving(false);
    }
  };

  // Load transactions automatically when the page loads
  useEffect(() => {
    let isMounted = true;

    // Only attempt to load if the user is authenticated and the storage is initialized
    if (ready && authenticated && storage?.isInitialized && !isRetrieving) {
      const autoLoadTransactions = async () => {
        if (!isMounted) return;
        setIsRetrieving(true);
        try {
          console.log("Auto-loading transactions...");
          const data = await storage.retrieve("transactions");

          if (!isMounted) return;

          if (data && Array.isArray(data)) {
            setTransactions(data);
            console.log("Transactions loaded automatically:", data.length);
          } else {
            console.log("No transactions found or invalid format:", data);
          }
        } catch (error) {
          if (!isMounted) return;
          // Silent error handling for auto-loading
          console.log("Error auto-loading transactions:", error);
        } finally {
          if (isMounted) {
            setIsRetrieving(false);
          }
        }
      };

      // Slight delay to ensure everything is properly initialized
      const timeoutId = setTimeout(() => {
        autoLoadTransactions();
      }, 1000);

      return () => {
        isMounted = false;
        clearTimeout(timeoutId);
      };
    }

    return () => {
      isMounted = false;
    };
  }, [ready, authenticated, storage?.isInitialized]);

  // Authentication check
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-t-4 border-gray-200 border-t-lavender-500"></div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
        <h1 className="text-2xl font-bold">Encrypted IPFS Storage</h1>
        <p className="mb-4 text-gray-600 dark:text-gray-300">
          Please connect your wallet to test the encrypted storage
        </p>
        <button
          onClick={login}
          className="rounded-lg bg-lavender-500 px-6 py-2 font-medium text-white transition-colors hover:bg-lavender-600"
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-6 text-2xl font-bold dark:text-white">
        Wallet-Encrypted IPFS Storage
      </h1>

      <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h2 className="mb-4 text-xl font-semibold dark:text-white">
          Store and Retrieve Encrypted Transactions
        </h2>

        <div className="mb-6 flex flex-wrap gap-4">
          <button
            onClick={addTransaction}
            disabled={isSaving || !storage?.isInitialized}
            className="rounded-lg bg-lavender-500 px-4 py-2 font-medium text-white transition-colors hover:bg-lavender-600 disabled:opacity-50"
          >
            {isSaving ? "Encrypting & Saving..." : "Add Transaction"}
          </button>

          <button
            onClick={loadTransactions}
            disabled={isRetrieving || !storage?.isInitialized}
            className="rounded-lg border border-lavender-500 bg-white px-4 py-2 font-medium text-lavender-500 transition-colors hover:bg-lavender-50 disabled:opacity-50 dark:bg-transparent dark:hover:bg-gray-700"
          >
            {isRetrieving ? "Retrieving..." : "Refresh Transactions"}
          </button>
        </div>

        {lastSavedCid && (
          <div className="mb-6 rounded-md bg-gray-50 p-4 dark:bg-gray-700">
            <h3 className="mb-2 font-medium dark:text-white">
              Last Content ID (CID):
            </h3>
            <p className="break-all font-mono text-sm dark:text-gray-300">
              {lastSavedCid}
            </p>
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
              Note: Storing CIDs in localStorage is convenient but has security
              implications. In a production app, consider alternative secure
              storage methods.
            </p>
          </div>
        )}

        {/* Transaction table - unchanged */}
        {transactions.length > 0 ? (
          <div className="max-h-96 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full table-auto">
              <thead className="sticky top-0 bg-gray-50 text-left text-xs uppercase text-gray-700 dark:bg-gray-900 dark:text-gray-300">
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
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                      {tx.id}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                      {new Date(tx.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                      {tx.amount} {tx.currency}
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                      {tx.recipient}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-4 text-center text-gray-500 dark:text-gray-400">
            No transactions found. Add a transaction to get started.
          </p>
        )}

        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20">
          <h3 className="text-sm font-medium text-amber-800 dark:text-amber-400">
            How Wallet-Encrypted Storage Works:
          </h3>
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
            1. When saving - you sign a message with your wallet to derive an
            encryption key
            <br />
            2. Your data is encrypted using this key before being stored on IPFS
            <br />
            3. IPFS returns a Content ID (CID) that uniquely identifies your
            encrypted data
            <br />
            4. When retrieving - you sign the same message to derive the same
            key for decryption
            <br />
            5. Only your wallet can decrypt the data, ensuring privacy
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h3 className="mb-3 font-medium dark:text-white">Status</h3>
        <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">
          IPFS Status:{" "}
          {storage?.isInitialized ? "✅ Ready" : "⏳ Initializing..."}
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Connected Wallet: {wallets.length > 0 ? wallets[0].address : "None"}
        </p>
      </div>
    </div>
  );
}
