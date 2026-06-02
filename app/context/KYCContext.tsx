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

/** Product tiers: 0 = unverified (no swaps until phone), 1 = phone, 2 = ID, 3 = address. */
export const KYC_TIERS: Record<number, KYCTier> = {
  0: {
    level: 0,
    name: "Unverified",
    limits: { monthly: kycMonthlyLimits[0] },
    requirements: [],
  },
  1: {
    level: 1,
    name: "Phone",
    limits: { monthly: kycMonthlyLimits[1] },
    requirements: ["Phone number"],
  },
  2: {
    level: 2,
    name: "ID",
    limits: { monthly: kycMonthlyLimits[2] },
    requirements: ["Government ID", "Selfie verification"],
  },
  3: {
    level: 3,
    name: "Address",
    limits: { monthly: kycMonthlyLimits[3] },
    requirements: ["Address verification"],
  },
};

interface UserTransactionSummary {
  dailySpent: number;
  monthlySpent: number;
  lastTransactionDate: string | null;
}

/** Synchronous KYC view — updated as soon as status APIs return (before re-render). */
export interface KYCStatusSnapshot {
  tier: KYCTierLevel;
  isPhoneVerified: boolean;
  phoneNumber: string | null;
  transactionSummary: UserTransactionSummary;
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
  getKycStatusSnapshot: () => KYCStatusSnapshot;
  refreshStatus: (force?: boolean) => Promise<KYCStatusSnapshot | null>;
}

const KYCContext = createContext<KYCContextType | undefined>(undefined);

const EMPTY_TX_SUMMARY: UserTransactionSummary = {
  dailySpent: 0,
  monthlySpent: 0,
  lastTransactionDate: null,
};

function createEmptySnapshot(): KYCStatusSnapshot {
  return {
    tier: 0,
    isPhoneVerified: false,
    phoneNumber: null,
    transactionSummary: { ...EMPTY_TX_SUMMARY },
  };
}

export function KYCProvider({ children }: { children: React.ReactNode }) {
  const { wallets } = useWallets();
  const { getAccessToken } = usePrivy();
  const embeddedWallet = wallets.find(
    (wallet) => wallet.walletClientType === "privy",
  );
  const walletAddress = embeddedWallet?.address;

  const walletAddressRef = useRef(walletAddress);
  walletAddressRef.current = walletAddress;

  const fetchGuardsRef = useRef<Record<string, string>>({});
  const lastFetchTimeRef = useRef<number>(0);
  const refreshInFlightRef = useRef<Promise<KYCStatusSnapshot | null> | null>(
    null,
  );
  const latestSnapshotRef = useRef<KYCStatusSnapshot>(createEmptySnapshot());
  const STALENESS_WINDOW_MS = 30_000;
  const guardKey = walletAddress || "no_wallet";

  const [tier, setTier] = useState<KYCTierLevel>(0);
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [transactionSummary, setTransactionSummary] =
    useState<UserTransactionSummary>({ ...EMPTY_TX_SUMMARY });

  const applySnapshot = useCallback((partial: Partial<KYCStatusSnapshot>) => {
    const next: KYCStatusSnapshot = {
      tier: partial.tier ?? latestSnapshotRef.current.tier,
      isPhoneVerified:
        partial.isPhoneVerified ?? latestSnapshotRef.current.isPhoneVerified,
      phoneNumber:
        partial.phoneNumber !== undefined
          ? partial.phoneNumber
          : latestSnapshotRef.current.phoneNumber,
      transactionSummary:
        partial.transactionSummary ?? latestSnapshotRef.current.transactionSummary,
    };
    latestSnapshotRef.current = next;
    setTier(next.tier);
    setIsPhoneVerified(next.isPhoneVerified);
    setPhoneNumber(next.phoneNumber);
    setTransactionSummary(next.transactionSummary);
    return next;
  }, []);

  const getKycStatusSnapshot = useCallback(
    (): KYCStatusSnapshot => latestSnapshotRef.current,
    [],
  );

  const getCurrentLimits = useCallback((): TransactionLimits => {
    return KYC_TIERS[latestSnapshotRef.current.tier].limits;
  }, []);

  const getRemainingLimits = useCallback((): TransactionLimits => {
    const currentTier = latestSnapshotRef.current.tier;
    const currentLimits = KYC_TIERS[currentTier].limits;
    const spent = latestSnapshotRef.current.transactionSummary.monthlySpent;
    const remaining = Math.max(0, currentLimits.monthly - spent);
    return { monthly: remaining, unlimited: currentLimits.unlimited };
  }, []);

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

  const fetchTransactionSummary = useCallback(
    async (options?: { force?: boolean }): Promise<boolean> => {
      const snapshot = walletAddress;
      if (!snapshot) return false;
      const guards = fetchGuardsRef.current;
      const key = `${snapshot}_tx`;
      if (!options?.force && guards[key] === "fetching") return false;
      guards[key] = "fetching";
      try {
        const accessToken = await getAccessToken();
        if (
          walletAddressRef.current?.toLowerCase() !== snapshot.toLowerCase()
        ) {
          return false;
        }
        if (!accessToken) return false;

        const response = await fetch(`/api/kyc/transaction-summary`, {
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
        applySnapshot({
          transactionSummary: {
            dailySpent: data.dailySpent,
            monthlySpent: data.monthlySpent,
            lastTransactionDate: data.lastTransactionDate,
          },
        });
        return true;
      } catch {
        return false;
      } finally {
        guards[key] = "done";
      }
    },
    [walletAddress, getAccessToken, applySnapshot],
  );

  const fetchKYCStatus = useCallback(
    async (options?: { force?: boolean }): Promise<boolean> => {
      const snapshot = walletAddress;
      if (!snapshot) return false;
      const guards = fetchGuardsRef.current;
      const key = `${snapshot}_kyc`;
      if (!options?.force && guards[key] === "fetching") return false;
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
        const safeTier = Math.min(
          Math.max(Number(data.tier) || 0, 0),
          3,
        ) as KYCTierLevel;
        applySnapshot({
          tier: safeTier,
          isPhoneVerified: Boolean(data.isPhoneVerified),
          phoneNumber: data.phoneNumber ?? null,
        });
        return true;
      } catch {
        return false;
      } finally {
        guards[key] = "done";
      }
    },
    [walletAddress, getAccessToken, applySnapshot],
  );

  const refreshStatus = useCallback(
    async (force = false): Promise<KYCStatusSnapshot | null> => {
      if (!walletAddress) return null;

      const now = Date.now();
      if (
        !force &&
        now - lastFetchTimeRef.current < STALENESS_WINDOW_MS
      ) {
        return latestSnapshotRef.current;
      }

      if (refreshInFlightRef.current) {
        return refreshInFlightRef.current;
      }

      const run = async (): Promise<KYCStatusSnapshot | null> => {
        const guards = fetchGuardsRef.current;
        delete guards[`${guardKey}_kyc`];
        delete guards[`${guardKey}_tx`];

        const fetchOpts = { force: true as const };
        await Promise.all([
          fetchKYCStatus(fetchOpts),
          fetchTransactionSummary(fetchOpts),
        ]);

        lastFetchTimeRef.current = Date.now();
        return latestSnapshotRef.current;
      };

      refreshInFlightRef.current = run();
      try {
        return await refreshInFlightRef.current;
      } finally {
        refreshInFlightRef.current = null;
      }
    },
    [
      walletAddress,
      guardKey,
      fetchKYCStatus,
      fetchTransactionSummary,
    ],
  );

  useEffect(() => {
    if (walletAddress) {
      const empty = createEmptySnapshot();
      latestSnapshotRef.current = empty;
      setTier(empty.tier);
      setIsPhoneVerified(empty.isPhoneVerified);
      setPhoneNumber(empty.phoneNumber);
      setTransactionSummary({ ...EMPTY_TX_SUMMARY });
      fetchGuardsRef.current = {};
      lastFetchTimeRef.current = 0;
      void refreshStatus(true);
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
        getKycStatusSnapshot,
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
