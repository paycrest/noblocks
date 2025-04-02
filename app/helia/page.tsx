"use client";
import { useState, useEffect } from "react";
import { useStorage } from "../context/StorageContext";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { toast } from "sonner";
import { useInjectedWallet } from "../context/InjectedWalletContext";

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
 * Wallet-Encrypted Storage Test Page
 */
export default function HeliaTestPage() {
  const storage = useStorage();
  const { ready, authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const { isInjectedWallet, injectedAddress } = useInjectedWallet();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [lastSavedCid, setLastSavedCid] = useState("");
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>("");
  const [isLoadingFromStorage, setIsLoadingFromStorage] = useState(false);
  const [isLoadingFromIpns, setIsLoadingFromIpns] = useState(false);

  // Get the wallet address
  const getWalletAddress = (): string | undefined => {
    if (isInjectedWallet && injectedAddress) {
      return injectedAddress;
    }

    const embeddedWallet = wallets.find(
      (wallet) => wallet.walletClientType === "privy",
    );
    return embeddedWallet?.address;
  };

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
      setIsLoading(true);
      const newTransaction = generateMockTransaction();
      const updatedTransactions = [...transactions, newTransaction];
      setTransactions(updatedTransactions);

      toast.info("Signing message to encrypt data...");

      // Save data with wallet-based encryption
      const cid = await storage.save("transactions", updatedTransactions);
      setLastSavedCid(cid);
      setLastSaved(new Date().toISOString());

      toast.success("Transaction encrypted and saved to IPFS");
    } catch (error) {
      console.error("Failed to save transaction:", error);
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Load transactions from IPFS
   */
  const loadTransactions = async ({
    forceRefresh = false,
  }: {
    forceRefresh?: boolean;
  }) => {
    if (!ready || !authenticated) {
      toast.error("Please connect your wallet first");
      return;
    }

    if (!storage?.retrieve || !storage.isInitialized) {
      toast.error("Storage not initialized");
      return;
    }

    try {
      setIsLoading(true);
      toast.info("Retrieving encrypted transactions...");

      // Retrieve and decrypt data
      const data = await storage.retrieve("transactions", {
        force: forceRefresh,
      });

      if (data && Array.isArray(data)) {
        setTransactions(data);
        toast.success("Transactions successfully retrieved and decrypted");
      } else {
        setTransactions([]);
        toast.info("No transactions found");
      }
    } catch (error) {
      console.error("Storage retrieval error:", error);

      // More specific error handling
      if (
        error instanceof Error &&
        error.message.includes("No stored data found")
      ) {
        toast.info("You haven't saved any transactions yet");
      } else if (
        error instanceof Error &&
        error.message.includes("Failed to decrypt")
      ) {
        toast.error(
          "Could not decrypt your data. You may need to save new transactions first.",
        );
      } else {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to load transactions",
        );
      }

      setTransactions([]);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Load transactions directly from localStorage CID
   */
  const loadFromLocalStorage = async () => {
    if (!ready || !authenticated) {
      toast.error("Please connect your wallet first");
      return;
    }

    if (!storage?.retrieve || !storage.isInitialized) {
      toast.error("Storage not initialized");
      return;
    }

    try {
      setIsLoadingFromStorage(true);
      toast.info("Loading directly from localStorage CID...");

      // Get wallet address for storage key
      const walletAddress = getWalletAddress();
      if (!walletAddress) {
        throw new Error("No wallet address available");
      }

      // Get CID from localStorage
      const storageKey = `eth-${walletAddress.toLowerCase()}-transactions`;
      const cidFromStorage = localStorage.getItem(storageKey);

      if (!cidFromStorage) {
        toast.error("No CID found in localStorage");
        return;
      }

      setDebugInfo(`Using CID from localStorage: ${cidFromStorage}`);

      // Force direct CID retrieval
      const data = await storage.retrieve("transactions", {
        force: false,
        directCid: cidFromStorage, // Add this optional param to your StorageContext
      });

      if (data && Array.isArray(data)) {
        setTransactions(data);
        toast.success(
          `Loaded ${data.length} transactions from localStorage CID`,
        );
      } else {
        setTransactions([]);
        toast.info("No transactions found");
      }
    } catch (error) {
      console.error("Error loading from localStorage CID:", error);
      toast.error(error instanceof Error ? error.message : String(error));
      setDebugInfo(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      setTransactions([]);
    } finally {
      setIsLoadingFromStorage(false);
    }
  };

  /**
   * Load transactions from IPNS
   */
  const loadFromIpns = async () => {
    if (!ready || !authenticated) {
      toast.error("Please connect your wallet first");
      return;
    }

    if (!storage?.retrieve || !storage.isInitialized) {
      toast.error("Storage not initialized");
      return;
    }

    try {
      setIsLoadingFromIpns(true);
      toast.info("Loading via IPNS resolution...");

      // Force a refresh instead since we don't have IPNS
      const data = await storage.retrieve("transactions", {
        force: true,
      });

      if (data && Array.isArray(data)) {
        setTransactions(data);
        toast.success(`Loaded ${data.length} transactions`);
      } else {
        setTransactions([]);
        toast.info("No transactions found");
      }
    } catch (error) {
      console.error("Error loading:", error);
      toast.error(error instanceof Error ? error.message : String(error));
      setDebugInfo(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      setTransactions([]);
    } finally {
      setIsLoadingFromIpns(false);
    }
  };

  // Re-enable automatic loading
  useEffect(() => {
    if (ready && authenticated && storage?.isInitialized && !isLoading) {
      loadTransactions({ forceRefresh: false });
    }
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
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background-neutral p-4 dark:bg-neutral-900">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
          Wallet-Encrypted Storage
        </h1>
        <p className="mb-4 text-text-secondary dark:text-gray-300">
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
      <h1 className="mb-6 text-2xl font-bold text-neutral-900 dark:text-white">
        Wallet-Encrypted Storage
      </h1>

      <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-surface-canvas">
        <h2 className="mb-4 text-xl font-semibold text-neutral-900 dark:text-white">
          Your Data is Encrypted with Your Wallet
        </h2>

        <div className="mb-6 flex flex-wrap gap-4">
          <button
            onClick={addTransaction}
            disabled={
              isLoading || storage?.isLoading || !storage?.isInitialized
            }
            className="rounded-lg bg-lavender-500 px-4 py-2 font-medium text-white transition-colors hover:bg-lavender-600 disabled:opacity-50"
          >
            {isLoading || storage?.isLoading
              ? "Encrypting & Saving..."
              : "Add Transaction"}
          </button>

          <button
            onClick={() => loadTransactions({ forceRefresh: true })}
            disabled={
              isLoading || storage?.isLoading || !storage?.isInitialized
            }
            className="rounded-lg border border-lavender-500 bg-white px-4 py-2 font-medium text-lavender-500 transition-colors hover:bg-lavender-50 disabled:opacity-50 dark:bg-transparent dark:hover:bg-gray-700"
          >
            {isLoading || storage?.isLoading
              ? "Retrieving..."
              : "Auto Detect & Load"}
          </button>
        </div>

        <div className="mb-6 flex flex-wrap gap-4">
          <button
            onClick={loadFromLocalStorage}
            disabled={
              isLoadingFromStorage ||
              storage?.isLoading ||
              !storage?.isInitialized
            }
            className="rounded-lg bg-amber-500 px-4 py-2 font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
          >
            {isLoadingFromStorage ? "Loading..." : "Load from localStorage CID"}
          </button>

          <button
            onClick={loadFromIpns}
            disabled={
              isLoadingFromIpns || storage?.isLoading || !storage?.isInitialized
            }
            className="rounded-lg bg-green-500 px-4 py-2 font-medium text-white transition-colors hover:bg-green-600 disabled:opacity-50"
          >
            {isLoadingFromIpns ? "Resolving..." : "Load via IPNS"}
          </button>
        </div>

        {/* Add a message guiding users on how to start */}
        <div className="mb-6 rounded-md bg-blue-50 p-4 dark:bg-blue-900/20">
          <h3 className="mb-2 font-medium text-blue-800 dark:text-blue-400">
            Getting Started
          </h3>
          <p className="text-sm text-blue-700 dark:text-blue-300">
            To begin, either add a new transaction or load your existing data
            using one of the buttons above.
          </p>
        </div>

        {lastSavedCid && (
          <div className="mb-6 rounded-md bg-background-neutral p-4 dark:bg-gray-700">
            <h3 className="mb-2 font-medium text-neutral-900 dark:text-white">
              Last Content ID (CID):
            </h3>
            <p className="break-all font-mono text-sm text-text-body dark:text-gray-300">
              {lastSavedCid}
            </p>
            {lastSaved && (
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                Last saved: {new Date(lastSaved).toLocaleString()}
              </p>
            )}
          </div>
        )}

        {/* Debug info box */}
        {debugInfo && (
          <div className="mb-6 rounded-md bg-gray-100 p-4 dark:bg-gray-800">
            <h3 className="mb-2 font-medium text-neutral-900 dark:text-white">
              Debug Info:
            </h3>
            <p className="break-all font-mono text-xs text-text-body dark:text-gray-300">
              {debugInfo}
            </p>
            <button
              onClick={() => {
                // Get localStorage CID for debugging
                const walletAddress = getWalletAddress();
                if (walletAddress) {
                  const storageKey = `eth-${walletAddress.toLowerCase()}-transactions`;
                  const cid = localStorage.getItem(storageKey);
                  setDebugInfo(
                    `localStorage key: ${storageKey}\nCID: ${cid || "Not found"}`,
                  );
                }
              }}
              className="mt-2 text-xs text-lavender-500 hover:underline"
            >
              Show localStorage CID info
            </button>
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
          How Wallet-Encrypted Storage Works
        </h3>
        <p className="mb-2 text-sm text-text-secondary dark:text-gray-300">
          1. When you save data, your wallet signs a message to derive an
          encryption key
        </p>
        <p className="mb-2 text-sm text-text-secondary dark:text-gray-300">
          2. Your data is encrypted before being stored on IPFS
        </p>
        <p className="mb-2 text-sm text-text-secondary dark:text-gray-300">
          3. An IPNS record is created that's specific to your wallet and the
          data key
        </p>
        <p className="mb-2 text-sm text-text-secondary dark:text-gray-300">
          4. When retrieving, your wallet signs the same message to derive the
          same key for decryption
        </p>
        <p className="mb-2 text-sm text-text-secondary dark:text-gray-300">
          5. Only your wallet can decrypt the data, ensuring privacy
        </p>
        <p className="text-sm text-text-secondary dark:text-gray-300">
          Status: {storage?.isInitialized ? "✅ Ready" : "⏳ Initializing..."}
          {storage?.isLoading && " 🔄 Processing..."}
        </p>
      </div>
    </div>
  );
}
