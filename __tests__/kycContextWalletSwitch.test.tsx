/// <reference types="jest" />

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { KYCProvider, useKYC } from "../app/context/KYCContext";

const mockGetAccessToken = jest.fn(async () => "test-access-token");

jest.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({ getAccessToken: mockGetAccessToken }),
}));

const mockGetInjectedAuthHeaders = jest.fn(async () => null);

jest.mock("@/context/InjectedWalletContext", () => ({
  useInjectedWallet: () => ({
    isInjectedWallet: false,
    getInjectedAuthHeaders: mockGetInjectedAuthHeaders,
  }),
}));

const mockUseWalletAddress = jest.fn<string | undefined, []>();

jest.mock("@/hooks/useWalletAddress", () => ({
  useWalletAddress: () => mockUseWalletAddress(),
}));

function Consumer() {
  const { walletAddress, hasLoadedTransactionSummary, transactionSummary, tier } =
    useKYC();
  return (
    <div>
      <span data-testid="wallet">{walletAddress ?? "none"}</span>
      <span data-testid="hasLoadedTx">
        {String(hasLoadedTransactionSummary)}
      </span>
      <span data-testid="dailySpent">{transactionSummary.dailySpent}</span>
      <span data-testid="tier">{tier}</span>
    </div>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
    if (url.includes("/api/kyc/transaction-summary")) {
      return {
        ok: true,
        json: async () => ({
          success: true,
          dailySpent: 50,
          monthlySpent: 100,
          lastTransactionDate: "2024-01-01",
        }),
      };
    }
    if (url.includes("/api/kyc/status")) {
      return {
        ok: true,
        json: async () => ({
          success: true,
          tier: 2,
          pooledWalletCount: 1,
          isPhoneVerified: true,
        }),
      };
    }
    return { ok: false, json: async () => ({}) };
  });
});

type Deferred = {
  promise: Promise<{ ok: boolean; json: () => Promise<unknown> }>;
  resolve: (tier: number) => void;
};

function createDeferredStatusResponse(): Deferred {
  let resolve!: (tier: number) => void;
  const promise = new Promise<{ ok: boolean; json: () => Promise<unknown> }>(
    (res) => {
      resolve = (tier: number) =>
        res({
          ok: true,
          json: async () => ({
            success: true,
            tier,
            pooledWalletCount: 1,
            isPhoneVerified: true,
          }),
        });
    },
  );
  return { promise, resolve };
}

describe("KYCProvider wallet switch", () => {
  it("keeps the newer wallet session's tier when an older wallet-A run resolves last", async () => {
    const statusDeferreds: Deferred[] = [];
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes("/api/kyc/transaction-summary")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            dailySpent: 0,
            monthlySpent: 0,
            lastTransactionDate: null,
          }),
        };
      }
      if (url.includes("/api/kyc/status")) {
        const deferred = createDeferredStatusResponse();
        statusDeferreds.push(deferred);
        return deferred.promise;
      }
      return { ok: false, json: async () => ({}) };
    });

    const walletA = "0x1111111111111111111111111111111111111111";
    mockUseWalletAddress.mockReturnValue(walletA);
    const { rerender } = render(
      <KYCProvider>
        <Consumer />
      </KYCProvider>,
    );

    // Wallet A's first run is now in flight (statusDeferreds[0]).
    await waitFor(() => expect(statusDeferreds).toHaveLength(1));

    // Wallet disconnects, then reconnects to the SAME address A — a new wallet
    // session starts a second run (statusDeferreds[1]) while the first is still
    // pending.
    mockUseWalletAddress.mockReturnValue(undefined);
    rerender(
      <KYCProvider>
        <Consumer />
      </KYCProvider>,
    );
    mockUseWalletAddress.mockReturnValue(walletA);
    rerender(
      <KYCProvider>
        <Consumer />
      </KYCProvider>,
    );
    await waitFor(() => expect(statusDeferreds).toHaveLength(2));

    // The newer run resolves first, with tier 3.
    statusDeferreds[1].resolve(3);
    await waitFor(() => expect(screen.getByTestId("tier").textContent).toBe("3"));

    // The older run (from the original connection) resolves last, with a
    // different tier. Its address snapshot still matches (same wallet A), so
    // only the wallet-session check can catch that it's stale.
    statusDeferreds[0].resolve(1);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByTestId("tier").textContent).toBe("3");
  });

  it("clears transactionSummary/hasLoadedTransactionSummary when the wallet disconnects", async () => {
    mockUseWalletAddress.mockReturnValue(
      "0x1111111111111111111111111111111111111111",
    );
    const { rerender } = render(
      <KYCProvider>
        <Consumer />
      </KYCProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("hasLoadedTx").textContent).toBe("true"),
    );
    expect(screen.getByTestId("dailySpent").textContent).toBe("50");

    mockUseWalletAddress.mockReturnValue(undefined);
    rerender(
      <KYCProvider>
        <Consumer />
      </KYCProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("wallet").textContent).toBe("none"),
    );
    expect(screen.getByTestId("hasLoadedTx").textContent).toBe("false");
    expect(screen.getByTestId("dailySpent").textContent).toBe("0");
  });
});
