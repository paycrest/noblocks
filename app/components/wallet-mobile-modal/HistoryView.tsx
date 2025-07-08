import React from "react";
import { ArrowLeft02Icon } from "hugeicons-react";
import { TransactionDetails } from "../transaction/TransactionDetails";
import TransactionList from "../transaction/TransactionList";

interface HistoryViewProps {
  selectedTransaction: any;
  setSelectedTransaction: (tx: any) => void;
  handleHistoryClose: () => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  selectedTransaction,
  setSelectedTransaction,
  handleHistoryClose,
}) => (
  <div className="space-y-6">
    <div className="flex items-center justify-between">
      <button
        title="Go back"
        type="button"
        onClick={
          selectedTransaction
            ? () => setSelectedTransaction(null)
            : handleHistoryClose
        }
        className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-white/10"
      >
        <ArrowLeft02Icon className="size-5 text-outline-gray dark:text-white/50" />
      </button>
      <h2 className="text-lg font-semibold text-text-body dark:text-white">
        Transaction History
      </h2>
      <div className="w-10" />
    </div>
    {selectedTransaction ? (
      <div className="scrollbar-hide max-h-[80vh] w-full overflow-y-auto pb-4">
        <TransactionDetails transaction={selectedTransaction} />
      </div>
    ) : (
      <TransactionList onSelectTransaction={setSelectedTransaction} />
    )}
  </div>
);
