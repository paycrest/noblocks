"use client";
import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { useWallets, usePrivy } from "@privy-io/react-auth";

// Extend the Window interface for our in-memory fetch guard
declare global {
  interface Window {
    __KYC_FETCH_GUARDS__?: Record<string, string>;
  }
}

export interface TransactionLimits {
  monthly: number;
}

export interface KYCTier {
  level: 0 | 1 | 2;
  name: string;
  limits: TransactionLimits;
  requirements: string[];
}

export const KYC_TIERS: Record<number, KYCTier> = {
  1: {
    level: 1,
    name: "Tier 1",
    limits: { monthly: 100 },
    requirements: ["Phone number"],
  },
  2: {
    level: 2,
    name: "Tier 2",
    limits: { monthly: 15000 },
    requirements: ["Government ID", "Selfie verification"],
  },
};

interface UserTransactionSummary {
  dailySpent: number;
  monthlySpent: number;
  lastTransactionDate: string | null;
}

interface KYCContextType {
  tier: 0 | 1 | 2;
  isPhoneVerified: boolean;
  phoneNumber: string | null;
  isFullyVerified: boolean;
  transactionSummary: UserTransactionSummary;
  canTransact: (amount: number) => { allowed: boolean; reason?: string };
  getCurrentLimits: () => TransactionLimits;
  getRemainingLimits: () => TransactionLimits;
  refreshStatus: () => Promise<void>;
}

const KYCContext = createContext<KYCContextType | undefined>(undefined);

export function KYCProvider({ children }: { children: React.ReactNode }) {
  const { wallets } = useWallets();
  const { getAccessToken } = usePrivy();
  const embeddedWallet = wallets.find(
    (wallet) => wallet.walletClientType === "privy",
  );
  const walletAddress = embeddedWallet?.address;

  // In-memory guards for fetches per wallet
  const fetchGuardsRef = useRef<Record<string, string>>({});
  const guardKey = walletAddress || "no_wallet";

  const [tier, setTier] = useState<0 | 1 | 2>(0);
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [isFullyVerified, setIsFullyVerified] = useState(false);
  const [transactionSummary, setTransactionSummary] =
    useState<UserTransactionSummary>({
      dailySpent: 0,
      monthlySpent: 0,
      lastTransactionDate: null,
    });

  const getCurrentLimits = useCallback((): TransactionLimits => {
    if (tier > 0) {
      return KYC_TIERS[tier].limits;
    }
    return { monthly: 0 };
  }, [tier]);

  const getRemainingLimits = useCallback((): TransactionLimits => {
    const currentLimits = tier > 0 ? KYC_TIERS[tier].limits : { monthly: 0 };
    const remaining = Math.max(
      0,
      currentLimits.monthly - transactionSummary.monthlySpent,
    );
    return { monthly: remaining };
  }, [tier, transactionSummary.monthlySpent]);

  const canTransact = useCallback(
    (amount: number): { allowed: boolean; reason?: string } => {
      const remaining = getRemainingLimits();
      if (amount > remaining.monthly) {
        return {
          allowed: false,
          reason: `Transaction amount ($${amount}) exceeds remaining monthly limit ($${remaining.monthly})`,
        };
      }
      return { allowed: true };
    },
    [getRemainingLimits],
  );

  const fetchTransactionSummary = useCallback(async () => {
    if (!walletAddress) return;
    const guards = fetchGuardsRef.current;
    const key = `${guardKey}_tx`;
    if (guards[key] === "fetching") return;
    guards[key] = "fetching";
    try {
      const response = await fetch(
        `/api/kyc/transaction-summary?walletAddress=${encodeURIComponent(walletAddress)}`,
      );
      const data = await response.json();
      if (data.success) {
        setTransactionSummary({
          dailySpent: data.dailySpent,
          monthlySpent: data.monthlySpent,
          lastTransactionDate: data.lastTransactionDate,
        });
      } else {
        console.error("Error fetching transaction summary:", data.error);
      }
    } catch (error) {
      console.error("Error calculating transaction summary:", error);
    } finally {
      guards[key] = "done";
    }
  }, [walletAddress, guardKey]);

  const fetchKYCStatus = useCallback(async () => {
    if (!walletAddress) return;
    const guards = fetchGuardsRef.current;
    const key = `${guardKey}_kyc`;
    if (guards[key] === "fetching") return;
    guards[key] = "fetching";
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        console.error("Failed to get access token for KYC status");
        return;
      }

      const response = await fetch(`/api/kyc/status`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const data = await response.json();
      if (data.success) {
        setTier(data.tier);
        setIsPhoneVerified(data.isPhoneVerified);
        setPhoneNumber(data.phoneNumber);
        setIsFullyVerified(data.isFullyVerified);
      } else {
        console.error("Error fetching KYC status:", data.error);
      }
    } catch (error) {
      console.error("Error fetching KYC status:", error);
    } finally {
      guards[key] = "done";
    }
  }, [walletAddress, getAccessToken, guardKey]);

  const refreshStatus = useCallback(async () => {
    // Reset guards so fetches can run again
    const guards = fetchGuardsRef.current;
    delete guards[`${guardKey}_kyc`];
    delete guards[`${guardKey}_tx`];
    await Promise.all([fetchKYCStatus(), fetchTransactionSummary()]);
  }, [fetchKYCStatus, fetchTransactionSummary, guardKey]);

  // Initial load and wallet address change
  useEffect(() => {
    if (walletAddress) {
      // Reset guards when wallet changes
      fetchGuardsRef.current = {};
      refreshStatus();
    }
  }, [walletAddress, refreshStatus]);

  return (
    <KYCContext.Provider
      value={{
        tier,
        isPhoneVerified,
        phoneNumber,
        isFullyVerified,
        transactionSummary,
        canTransact,
        getCurrentLimits,
        getRemainingLimits,
        refreshStatus,
      }}
    >
      {children}
    </KYCContext.Provider>
  );
}

export const useKYC = () => {
  const context = useContext(KYCContext);
  if (context === undefined) {
    throw new Error("useKYC must be used within a KYCProvider");
  }
  return context;
};
