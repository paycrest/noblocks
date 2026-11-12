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
  const { walletAddress, hasLoadedTransactionSummary, transactionSummary } =
    useKYC();
  return (
    <div>
      <span data-testid="wallet">{walletAddress ?? "none"}</span>
      <span data-testid="hasLoadedTx">
        {String(hasLoadedTransactionSummary)}
      </span>
      <span data-testid="dailySpent">{transactionSummary.dailySpent}</span>
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

describe("KYCProvider wallet switch", () => {
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
