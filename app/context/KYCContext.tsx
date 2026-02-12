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
  unlimited?: boolean;
}

export type KYCTierLevel = 0 | 1 | 2 | 3 | 4;

export interface KYCTier {
  level: 0 | 1 | 2 | 3 | 4;
  name: string;
  limits: TransactionLimits;
  requirements: string[];
}

export const KYC_TIERS: Record<number, KYCTier> = {
  0: {
    level: 0,
    name: "Tier 0",
    limits: { monthly: 0 },
    requirements: [],
  },
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
  3: {
    level: 3,
    name: "Tier 3",
    limits: { monthly: 50000 },
    requirements: ["Address verification"],
  },
  4: {
    level: 4,
    name: "Tier 4",
    limits: { monthly: 0, unlimited: true },
    requirements: ["Business verification"],
  },
};

interface UserTransactionSummary {
  dailySpent: number;
  monthlySpent: number;
  lastTransactionDate: string | null;
}

interface KYCContextType {
  tier: KYCTierLevel;
  isPhoneVerified: boolean;
  phoneNumber: string | null;
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
  const lastFetchTimeRef = useRef<number>(0);
  const STALENESS_WINDOW_MS = 30_000; // 30 seconds
  const guardKey = walletAddress || "no_wallet";

  const [tier, setTier] = useState<KYCTierLevel>(0);
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [transactionSummary, setTransactionSummary] =
    useState<UserTransactionSummary>({
      dailySpent: 0,
      monthlySpent: 0,
      lastTransactionDate: null,
    });

  const getCurrentLimits = useCallback((): TransactionLimits => {
    return KYC_TIERS[tier].limits;
  }, [tier]);

  const getRemainingLimits = useCallback((): TransactionLimits => {
    const currentLimits = KYC_TIERS[tier].limits;
    const remaining = Math.max(
      0,
      currentLimits.monthly - transactionSummary.monthlySpent,
    );
    return { monthly: remaining, unlimited: currentLimits.unlimited };
  }, [tier, transactionSummary.monthlySpent]);

  const canTransact = useCallback(
    (amount: number): { allowed: boolean; reason?: string } => {
      const remaining = getRemainingLimits();
      if (remaining.unlimited) {
        return { allowed: true };
      }
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
      const accessToken = await getAccessToken();
      if (!accessToken) return;

      const response = await fetch(
        `/api/kyc/transaction-summary`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
      if (!response.ok) return;
      const data = await response.json();
      if (data.success) {
        setTransactionSummary({
          dailySpent: data.dailySpent,
          monthlySpent: data.monthlySpent,
          lastTransactionDate: data.lastTransactionDate,
        });
      }
    } catch {
      // Silently fail — analytics tracked server-side
    } finally {
      guards[key] = "done";
    }
  }, [walletAddress, guardKey, getAccessToken]);

  const fetchKYCStatus = useCallback(async () => {
    if (!walletAddress) return;
    const guards = fetchGuardsRef.current;
    const key = `${guardKey}_kyc`;
    if (guards[key] === "fetching") return;
    guards[key] = "fetching";
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) return;

      const response = await fetch(`/api/kyc/status`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!response.ok) return;
      const data = await response.json();
      if (data.success) {
        setTier(data.tier);
        setIsPhoneVerified(data.isPhoneVerified);
        setPhoneNumber(data.phoneNumber);
      }
    } catch {
      // Silently fail — analytics tracked server-side
    } finally {
      guards[key] = "done";
    }
  }, [walletAddress, getAccessToken, guardKey]);

  const refreshStatus = useCallback(async (force = false) => {
    // Skip refresh if data is fresh (within staleness window)
    const now = Date.now();
    if (!force && now - lastFetchTimeRef.current < STALENESS_WINDOW_MS) return;

    // Reset guards so fetches can run again
    const guards = fetchGuardsRef.current;
    delete guards[`${guardKey}_kyc`];
    delete guards[`${guardKey}_tx`];
    await Promise.all([fetchKYCStatus(), fetchTransactionSummary()]);
    lastFetchTimeRef.current = Date.now();
  }, [fetchKYCStatus, fetchTransactionSummary, guardKey]);

  // Initial load and wallet address change
  useEffect(() => {
    if (walletAddress) {
      // Reset guards when wallet changes
      fetchGuardsRef.current = {};
      lastFetchTimeRef.current = 0;
      refreshStatus(true);
    }
  }, [walletAddress, refreshStatus]);

  return (
    <KYCContext.Provider
      value={{
        tier,
        isPhoneVerified,
        phoneNumber,
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
