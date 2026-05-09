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
import { getKycMonthlyLimitsRecord } from "@/app/lib/kyc-tier-limits";

export interface TransactionLimits {
  monthly: number;
  unlimited?: boolean;
}

export type KYCTierLevel = 0 | 1 | 2 | 3;

export interface KYCTier {
  level: 0 | 1 | 2 | 3;
  name: string;
  limits: TransactionLimits;
  requirements: string[];
}

const kycMonthlyLimits = getKycMonthlyLimitsRecord();

export const KYC_TIERS: Record<number, KYCTier> = {
  0: {
    level: 0,
    name: "Tier 0",
    limits: { monthly: kycMonthlyLimits[0] },
    requirements: [],
  },
  1: {
    level: 1,
    name: "Tier 1",
    limits: { monthly: kycMonthlyLimits[1] },
    requirements: ["Phone number"],
  },
  2: {
    level: 2,
    name: "Tier 2",
    limits: { monthly: kycMonthlyLimits[2] },
    requirements: ["Government ID", "Selfie verification"],
  },
  3: {
    level: 3,
    name: "Tier 3",
    limits: { monthly: kycMonthlyLimits[3] },
    requirements: ["Address verification"],
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
  walletAddress: string | undefined;
  transactionSummary: UserTransactionSummary;
  canTransact: (amount: number) => { allowed: boolean; reason?: string };
  getCurrentLimits: () => TransactionLimits;
  getRemainingLimits: () => TransactionLimits;
  refreshStatus: (force?: boolean) => Promise<void>;
}

const KYCContext = createContext<KYCContextType | undefined>(undefined);

export function KYCProvider({ children }: { children: React.ReactNode }) {
  const { wallets } = useWallets();
  const { getAccessToken } = usePrivy();
  const embeddedWallet = wallets.find(
    (wallet) => wallet.walletClientType === "privy",
  );
  const walletAddress = embeddedWallet?.address;

  const walletAddressRef = useRef(walletAddress);
  walletAddressRef.current = walletAddress;

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

  const fetchTransactionSummary = useCallback(async (): Promise<boolean> => {
    const snapshot = walletAddress;
    if (!snapshot) return false;
    const guards = fetchGuardsRef.current;
    const key = `${snapshot}_tx`;
    if (guards[key] === "fetching") return false;
    guards[key] = "fetching";
    try {
      const accessToken = await getAccessToken();
      if (
        walletAddressRef.current?.toLowerCase() !== snapshot.toLowerCase()
      ) {
        return false;
      }
      if (!accessToken) return false;

      const response = await fetch(
        `/api/kyc/transaction-summary`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
      if (
        walletAddressRef.current?.toLowerCase() !== snapshot.toLowerCase()
      ) {
        return false;
      }
      if (!response.ok) return false;
      const data = await response.json();
      if (
        walletAddressRef.current?.toLowerCase() !== snapshot.toLowerCase()
      ) {
        return false;
      }
      if (!data.success) return false;
      setTransactionSummary({
        dailySpent: data.dailySpent,
        monthlySpent: data.monthlySpent,
        lastTransactionDate: data.lastTransactionDate,
      });
      return true;
    } catch {
      // Silently fail — analytics tracked server-side
      return false;
    } finally {
      guards[key] = "done";
    }
  }, [walletAddress, getAccessToken]);

  const fetchKYCStatus = useCallback(async (): Promise<boolean> => {
    const snapshot = walletAddress;
    if (!snapshot) return false;
    const guards = fetchGuardsRef.current;
    const key = `${snapshot}_kyc`;
    if (guards[key] === "fetching") return false;
    guards[key] = "fetching";
    try {
      const accessToken = await getAccessToken();
      if (
        walletAddressRef.current?.toLowerCase() !== snapshot.toLowerCase()
      ) {
        return false;
      }
      if (!accessToken) return false;

      const response = await fetch(`/api/kyc/status`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (
        walletAddressRef.current?.toLowerCase() !== snapshot.toLowerCase()
      ) {
        return false;
      }
      if (!response.ok) return false;
      const data = await response.json();
      if (
        walletAddressRef.current?.toLowerCase() !== snapshot.toLowerCase()
      ) {
        return false;
      }
      if (!data.success) return false;
      setTier(Math.min(Number(data.tier) || 0, 3) as KYCTierLevel);
      setIsPhoneVerified(data.isPhoneVerified);
      setPhoneNumber(data.phoneNumber);
      return true;
    } catch {
      // Silently fail — analytics tracked server-side
      return false;
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
    const [kycSettled, txSettled] = await Promise.allSettled([
      fetchKYCStatus(),
      fetchTransactionSummary(),
    ]);
    const kycFetched =
      kycSettled.status === "fulfilled" && kycSettled.value === true;
    const txFetched =
      txSettled.status === "fulfilled" && txSettled.value === true;
    if (kycFetched && txFetched) {
      lastFetchTimeRef.current = Date.now();
    }
  }, [fetchKYCStatus, fetchTransactionSummary, guardKey]);

  // Initial load and wallet address change — reset all KYC state before re-fetching
  // so stale data from a previous wallet is never shown to the new wallet's session
  useEffect(() => {
    if (walletAddress) {
      setTier(0);
      setIsPhoneVerified(false);
      setPhoneNumber(null);
      setTransactionSummary({ dailySpent: 0, monthlySpent: 0, lastTransactionDate: null });
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
        walletAddress,
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
