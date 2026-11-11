/// <reference types="jest" />

import React from "react";
import { render, act } from "@testing-library/react";
import type { TransactionHistory } from "../app/types";

const mockFetchTransactions = jest.fn();

jest.mock("@/api/aggregator", () => ({
  fetchTransactions: (...args: unknown[]) => mockFetchTransactions(...args),
  fetchOrderDetails: jest.fn(),
  fetchV2SenderPaymentOrderById: jest.fn(),
  updateTransactionDetails: jest.fn(),
  updateBridgeTransactionStatus: jest.fn(),
  mapAggregatorStatusToDbStatus: jest.fn(),
  resolveOnrampOrderStatusFromV2Response: jest.fn(),
  unwrapV2SenderOrderEnvelope: jest.fn(),
}));

jest.mock("@/context/InjectedWalletContext", () => ({
  useInjectedWallet: () => ({
    isInjectedWallet: false,
    injectedAddress: undefined,
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

import {
  TransactionsProvider,
  useTransactions,
} from "../app/context/TransactionsContext";

function makeTx(id: string): TransactionHistory {
  return {
    id,
    wallet_address: "0x1111111111111111111111111111111111111111",
    transaction_type: "transfer",
    from_currency: "USDC",
    to_currency: "0x2222222222222222222222222222222222222222",
    amount_sent: 1,
    amount_received: 1,
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
  };
}

let latestContext!: ReturnType<typeof useTransactions>;

function Probe() {
  latestContext = useTransactions();
  return null;
}

beforeEach(() => {
  mockFetchTransactions.mockReset();
});

describe("TransactionsContext fetch race", () => {
  it("a slower, older request (filter A) must not clobber state once a newer request (filter B) has already landed", async () => {
    render(
      <TransactionsProvider>
        <Probe />
      </TransactionsProvider>,
    );

    let resolveA!: (value: unknown) => void;
    const pendingA = new Promise((resolve) => {
      resolveA = resolve;
    });
    mockFetchTransactions.mockReturnValueOnce(pendingA);

    // Start a fetch for filter A — stays pending (simulates a slow request). Not wrapped in
    // act() since it must not resolve yet; it's awaited (inside act()) once B has landed.
    const fetchA = latestContext.fetchTransactions(
      "0x1111111111111111111111111111111111111111",
      "token",
      1,
      30,
      false,
      null,
      { search: "aaa" },
    );

    // Switch to filter B before A resolves — its fetch must still be issued.
    mockFetchTransactions.mockResolvedValueOnce({
      success: true,
      data: { total: 1, page: 1, limit: 30, transactions: [makeTx("b-1")] },
    });
    await act(() =>
      latestContext.fetchTransactions(
        "0x1111111111111111111111111111111111111111",
        "token",
        1,
        30,
        false,
        null,
        { search: "bbb" },
      ),
    );

    expect(mockFetchTransactions).toHaveBeenCalledTimes(2);
    expect(latestContext.transactions.map((t) => t.id)).toEqual(["b-1"]);

    // A resolves after B — the rendered rows must remain B's.
    await act(async () => {
      resolveA({
        success: true,
        data: { total: 1, page: 1, limit: 30, transactions: [makeTx("a-1")] },
      });
      await fetchA;
    });

    expect(latestContext.transactions.map((t) => t.id)).toEqual(["b-1"]);
  });
  it("a cache hit for the newest filter clears loading even while an older request is still pending", async () => {
    render(
      <TransactionsProvider>
        <Probe />
      </TransactionsProvider>,
    );
    const wallet = "0x1111111111111111111111111111111111111111";

    // Warm the cache for filter B.
    mockFetchTransactions.mockResolvedValueOnce({
      success: true,
      data: { total: 1, page: 1, limit: 30, transactions: [makeTx("b-1")] },
    });
    await act(() =>
      latestContext.fetchTransactions(wallet, "token", 1, 30, false, null, { search: "bbb" }),
    );

    // Filter A starts and stays pending.
    let resolveA!: (value: unknown) => void;
    mockFetchTransactions.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveA = resolve;
      }),
    );
    let fetchA!: Promise<void>;
    await act(async () => {
      fetchA = latestContext.fetchTransactions(wallet, "token", 1, 30, false, null, { search: "aaa" });
    });
    expect(latestContext.isLoading).toBe(true);

    // Back to filter B: served from cache, must not stay stuck loading.
    await act(() =>
      latestContext.fetchTransactions(wallet, "token", 1, 30, false, null, { search: "bbb" }),
    );
    expect(latestContext.isLoading).toBe(false);
    expect(latestContext.transactions.map((t) => t.id)).toEqual(["b-1"]);

    await act(async () => {
      resolveA({
        success: true,
        data: { total: 1, page: 1, limit: 30, transactions: [makeTx("a-1")] },
      });
      await fetchA;
    });
    expect(latestContext.isLoading).toBe(false);
    expect(latestContext.transactions.map((t) => t.id)).toEqual(["b-1"]);
  });
});
