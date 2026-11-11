/// <reference types="jest" />

import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import type { TransactionHistory } from "../app/types";
import type { TransactionHistoryFilters } from "../app/lib/transactionHistoryFilters";

const mockFetchTransactions = jest.fn();
const mockRefreshTransactions = jest.fn();
const mockSetPage = jest.fn();

let mockTransactionsState: {
  transactions: TransactionHistory[];
  total: number;
  isLoading: boolean;
  error: Error | null;
  currentPage: number;
};

jest.mock("@/context/TransactionsContext", () => ({
  useTransactions: () => ({
    ...mockTransactionsState,
    fetchTransactions: mockFetchTransactions,
    refreshTransactions: mockRefreshTransactions,
    setPage: mockSetPage,
  }),
}));

jest.mock("@/context/InjectedWalletContext", () => ({
  useInjectedWallet: () => ({
    isInjectedWallet: false,
    injectedAddress: undefined,
    injectedReady: false,
    getInjectedToken: jest.fn(),
  }),
}));

jest.mock("@/hooks/useApiAuth", () => ({
  useApiAuth: () => ({
    resolveAuth: jest.fn(async () => ({
      accessToken: "test-access-token",
      injectedToken: null,
    })),
  }),
}));

jest.mock("@/hooks/useActualTheme", () => ({
  useActualTheme: () => false,
}));

jest.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({
    user: {
      linkedAccounts: [
        {
          type: "wallet",
          connectorType: "embedded",
          address: "0x1111111111111111111111111111111111111111",
        },
      ],
    },
  }),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: { alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={props.alt} />
  ),
}));

import TransactionList from "../app/components/transaction/TransactionList";

function makeTx(overrides: Partial<TransactionHistory>): TransactionHistory {
  return {
    id: overrides.id ?? "tx-1",
    wallet_address: "0x1111111111111111111111111111111111111111",
    transaction_type: "transfer",
    from_currency: "USDC",
    to_currency: "0x2222222222222222222222222222222222222222",
    amount_sent: 10,
    amount_received: 10,
    fee: 0,
    recipient: {
      account_name: "Jane Doe",
      institution: "Test Bank",
      account_identifier: "0x2222222222222222222222222222222222222222",
    },
    status: "completed",
    network: "Base",
    created_at: "2024-05-15T10:00:00.000Z",
    updated_at: "2024-05-15T10:00:00.000Z",
    ...overrides,
  };
}

const NOW = new Date("2024-05-15T12:00:00.000Z");

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
  mockFetchTransactions.mockClear();
  mockRefreshTransactions.mockClear();
  mockSetPage.mockClear();
  mockTransactionsState = {
    transactions: [],
    total: 0,
    isLoading: false,
    error: null,
    currentPage: 1,
  };
});

afterEach(() => {
  jest.useRealTimers();
});

describe("TransactionList", () => {
  it("groups rows by relative day and dedupes duplicate order_id entries, keeping the most recent", () => {
    mockTransactionsState.transactions = [
      makeTx({
        id: "today-stale",
        order_id: "order-today",
        amount_sent: 1,
        created_at: "2024-05-15T09:00:00.000Z",
      }),
      makeTx({
        id: "today-fresh",
        order_id: "order-today",
        amount_sent: 2,
        created_at: "2024-05-15T11:00:00.000Z",
      }),
      makeTx({
        id: "yesterday-unique",
        order_id: undefined,
        amount_sent: 5,
        created_at: "2024-05-14T10:00:00.000Z",
      }),
    ];
    mockTransactionsState.total = 3;

    render(<TransactionList />);

    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Yesterday")).toBeInTheDocument();

    // Duplicate order_id collapses to a single row — only the most recent
    // amount (2 USDC) should be present, not the stale one (1 USDC).
    expect(screen.getByText("2.00 USDC")).toBeInTheDocument();
    expect(screen.queryByText("1.00 USDC")).not.toBeInTheDocument();
    expect(screen.getByText("5.00 USDC")).toBeInTheDocument();
  });

  it("shows the empty-state card copy when there are no transactions", () => {
    render(<TransactionList />);

    expect(screen.getByText("No transactions yet")).toBeInTheDocument();
    expect(
      screen.getByText("All the transactions and activity will show up here."),
    ).toBeInTheDocument();
  });

  it("shows the filtered-empty copy (not the cold-empty copy) for a filter with no backing type (e.g. Earn), and skips the fetch", () => {
    render(<TransactionList noResults />);

    expect(screen.getByText("No matching transactions")).toBeInTheDocument();
    expect(
      screen.getByText("Try a different search or filter."),
    ).toBeInTheDocument();
    expect(screen.queryByText("No transactions yet")).not.toBeInTheDocument();
    expect(mockFetchTransactions).not.toHaveBeenCalled();
  });

  it("shows the filtered-empty copy when a status or search filter is active and returns no rows", () => {
    const filters: TransactionHistoryFilters = {
      statuses: ["failed"],
      search: "nomatch",
    };
    render(<TransactionList filters={filters} />);

    expect(screen.getByText("No matching transactions")).toBeInTheDocument();
    expect(
      screen.getByText("Try a different search or filter."),
    ).toBeInTheDocument();
  });

  it("shows the cold-empty copy when there are no filters active", () => {
    render(<TransactionList filters={{}} />);

    expect(screen.getByText("No transactions yet")).toBeInTheDocument();
    expect(
      screen.getByText("All the transactions and activity will show up here."),
    ).toBeInTheDocument();
  });

  it("keeps existing rows and offers a retry when a fetch error occurs", () => {
    mockTransactionsState.transactions = [makeTx({ id: "existing-row" })];
    mockTransactionsState.total = 1;
    mockTransactionsState.error = new Error("Network error");

    render(<TransactionList />);

    // Existing row content survives the error.
    expect(screen.getByText("10.00 USDC")).toBeInTheDocument();
    const retryRow = screen.getByText(
      "Couldn't load transactions.",
    ).parentElement;
    expect(retryRow).toHaveClass("mt-6");
    expect(retryRow).toHaveTextContent("Couldn't load transactions.");

    const retryButton = screen.getByText("Retry");
    expect(retryRow).toContainElement(retryButton);
    fireEvent.click(retryButton);
    expect(mockRefreshTransactions).toHaveBeenCalledTimes(1);
  });

  it("shows the received amount (not the sent amount) for credit rows", () => {
    mockTransactionsState.transactions = [
      makeTx({
        id: "credit-row",
        transaction_type: "credit",
        amount_sent: 1,
        amount_received: 42,
      }),
    ];
    mockTransactionsState.total = 1;

    render(<TransactionList />);

    expect(screen.getByText("42.00 USDC")).toBeInTheDocument();
    expect(screen.queryByText("1.00 USDC")).not.toBeInTheDocument();
  });

  it("keeps showing the sent amount for non-credit rows", () => {
    mockTransactionsState.transactions = [
      makeTx({
        id: "transfer-row",
        transaction_type: "transfer",
        amount_sent: 7,
        amount_received: 99,
      }),
    ];
    mockTransactionsState.total = 1;

    render(<TransactionList />);

    expect(screen.getByText("7.00 USDC")).toBeInTheDocument();
    expect(screen.queryByText("99.00 USDC")).not.toBeInTheDocument();
  });

  it("issues a fetch for a new filter even while the previous fetch is still marked loading in context", async () => {
    mockTransactionsState.isLoading = true;

    const { rerender } = render(
      <TransactionList filters={{ search: "aaa" }} />,
    );
    await waitFor(() => expect(mockFetchTransactions).toHaveBeenCalledTimes(1));
    expect(mockFetchTransactions.mock.calls[0][6]).toEqual({ search: "aaa" });

    rerender(<TransactionList filters={{ search: "bbb" }} />);
    await waitFor(() => expect(mockFetchTransactions).toHaveBeenCalledTimes(2));
    expect(mockFetchTransactions.mock.calls[1][6]).toEqual({ search: "bbb" });
  });

  it("shows pagination with a usable previous button when the current page comes back empty", () => {
    mockTransactionsState.transactions = [];
    mockTransactionsState.total = 0;
    mockTransactionsState.currentPage = 2;

    render(<TransactionList />);

    expect(
      screen.getByRole("button", { name: "Go to previous page" }),
    ).toBeEnabled();
  });

  it("hides pagination on a fresh, unfiltered page 1 with no rows", () => {
    render(<TransactionList />);

    expect(
      screen.queryByRole("button", { name: "Go to previous page" }),
    ).not.toBeInTheDocument();
  });
});
