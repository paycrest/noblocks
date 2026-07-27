"use client";
import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { usePrivy } from "@privy-io/react-auth";
import { getKycTierLimit } from "@/app/lib/kyc-tier-limits";
import { sharedAllowanceNote } from "@/app/lib/kyc-limit-copy";
import { useWalletAddress } from "../hooks/useWalletAddress";
import { useInjectedWallet } from "./InjectedWalletContext";

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

/** Product tiers: 0 = unverified (no swaps until phone), 1 = phone, 2 = ID, 3 = address. */
export const KYC_TIERS: Record<number, KYCTier> = {
  0: {
    level: 0,
    name: "Unverified",
    limits: { ...getKycTierLimit(0) },
    requirements: [],
  },
  1: {
    level: 1,
    name: "Phone",
    limits: { ...getKycTierLimit(1) },
    requirements: ["Phone number"],
  },
  2: {
    level: 2,
    name: "ID",
    limits: { ...getKycTierLimit(2) },
    requirements: ["Government ID", "Selfie verification"],
  },
  3: {
    level: 3,
    name: "Address",
    limits: { ...getKycTierLimit(3) },
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
  /**
   * Wallets sharing this identity's monthly allowance. Defaults to 1, so a failed or
   * stale status fetch reads as "not pooled" and every limit surface renders the
   * pre-pooling copy rather than inventing wallets the user does not have.
   */
  pooledWalletCount: number;
  isPhoneVerified: boolean;
  /**
   * Whether any wallet in this identity's pool holds an OTP-verified phone. A wallet that
   * inherited its tier through the ID triple can have no phone of its own while a sibling
   * verified one — gates that care about the person (tier-2 phone gate) use this, not
   * `isPhoneVerified`, so they don't re-prompt for a number that can never be re-verified.
   */
  identityHasVerifiedPhone: boolean;
  /**
   * True once a status fetch for the CURRENT wallet actually succeeded. While false the
   * snapshot is the reset default (tier 0), which must read as "unknown", not "unverified" —
   * gating UIs should refresh before treating the user as unverified.
   */
  hasLoadedStatus: boolean;
  phoneNumber: string | null;
  fullName: string | null;
  transactionSummary: UserTransactionSummary;
}

interface KYCContextType {
  tier: KYCTierLevel;
  pooledWalletCount: number;
  isPhoneVerified: boolean;
  identityHasVerifiedPhone: boolean;
  hasLoadedStatus: boolean;
  phoneNumber: string | null;
  fullName: string | null;
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
    pooledWalletCount: 1,
    isPhoneVerified: false,
    identityHasVerifiedPhone: false,
    hasLoadedStatus: false,
    phoneNumber: null,
    fullName: null,
    transactionSummary: { ...EMPTY_TX_SUMMARY },
  };
}

export function KYCProvider({ children }: { children: React.ReactNode }) {
  const { getAccessToken } = usePrivy();
  const { isInjectedWallet, getInjectedAuthHeaders } = useInjectedWallet();
  // Active wallet for the current mode/network (injected when ?injected=true),
  // not the Privy embedded EOA — Profile and other KYC UI surface this address.
  // Injected mode resolves to the injected address only once injectedReady, so
  // walletAddress stays undefined until the wallet is connected.
  const walletAddress = useWalletAddress();

  // Auth header for the middleware-gated KYC routes: injected wallets use the
  // x-injected-token session JWT, Privy wallets the Bearer token. Returns null
  // when neither is available (caller then skips the fetch). Non-interactive:
  // these are background/mount fetches — they must never pop a wallet
  // signature request; the session is established by user actions (opening
  // the KYC modal, submitting a step) and reused here.
  const buildKycAuthHeaders = useCallback(async (): Promise<Record<string, string> | null> => {
    if (isInjectedWallet) {
      return getInjectedAuthHeaders({ interactive: false });
    }
    const accessToken = await getAccessToken();
    return accessToken ? { Authorization: `Bearer ${accessToken}` } : null;
  }, [isInjectedWallet, getInjectedAuthHeaders, getAccessToken]);

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
  const [pooledWalletCount, setPooledWalletCount] = useState(1);
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [identityHasVerifiedPhone, setIdentityHasVerifiedPhone] =
    useState(false);
  const [hasLoadedStatus, setHasLoadedStatus] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [transactionSummary, setTransactionSummary] =
    useState<UserTransactionSummary>({ ...EMPTY_TX_SUMMARY });

  const applySnapshot = useCallback((partial: Partial<KYCStatusSnapshot>) => {
    const next: KYCStatusSnapshot = {
      tier: partial.tier ?? latestSnapshotRef.current.tier,
      pooledWalletCount:
        partial.pooledWalletCount ?? latestSnapshotRef.current.pooledWalletCount,
      isPhoneVerified:
        partial.isPhoneVerified ?? latestSnapshotRef.current.isPhoneVerified,
      identityHasVerifiedPhone:
        partial.identityHasVerifiedPhone ??
        latestSnapshotRef.current.identityHasVerifiedPhone,
      hasLoadedStatus:
        partial.hasLoadedStatus ?? latestSnapshotRef.current.hasLoadedStatus,
      phoneNumber:
        partial.phoneNumber !== undefined
          ? partial.phoneNumber
          : latestSnapshotRef.current.phoneNumber,
      fullName:
        partial.fullName !== undefined
          ? partial.fullName
          : latestSnapshotRef.current.fullName,
      transactionSummary:
        partial.transactionSummary ?? latestSnapshotRef.current.transactionSummary,
    };
    latestSnapshotRef.current = next;
    setTier(next.tier);
    setPooledWalletCount(next.pooledWalletCount);
    setIsPhoneVerified(next.isPhoneVerified);
    setIdentityHasVerifiedPhone(next.identityHasVerifiedPhone);
    setHasLoadedStatus(next.hasLoadedStatus);
    setPhoneNumber(next.phoneNumber);
    setFullName(next.fullName);
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
        // The remaining figure covers every wallet on this identity, so say so —
        // otherwise the number looks wrong to anyone with more than one wallet.
        const pooled = sharedAllowanceNote(
          latestSnapshotRef.current.pooledWalletCount,
        );
        return {
          allowed: false,
          reason: `Transaction amount ($${amount}) exceeds remaining monthly limit ($${remaining.monthly})${pooled ? ` ${pooled}` : ""}`,
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
        const authHeaders = await buildKycAuthHeaders();
        if (
          walletAddressRef.current?.toLowerCase() !== snapshot.toLowerCase()
        ) {
          return false;
        }
        if (!authHeaders) return false;

        const response = await fetch(`/api/kyc/transaction-summary`, {
          headers: authHeaders,
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
    [walletAddress, buildKycAuthHeaders, applySnapshot],
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
        const authHeaders = await buildKycAuthHeaders();
        if (
          walletAddressRef.current?.toLowerCase() !== snapshot.toLowerCase()
        ) {
          return false;
        }
        if (!authHeaders) return false;

        const response = await fetch(`/api/kyc/status`, {
          headers: authHeaders,
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
          pooledWalletCount: Math.max(1, Number(data.pooledWalletCount) || 1),
          isPhoneVerified: Boolean(data.isPhoneVerified),
          identityHasVerifiedPhone: Boolean(
            data.identityHasVerifiedPhone ?? data.isPhoneVerified,
          ),
          hasLoadedStatus: true,
          phoneNumber: data.phoneNumber ?? null,
          fullName: data.fullName ?? null,
        });
        return true;
      } catch {
        return false;
      } finally {
        guards[key] = "done";
      }
    },
    [walletAddress, buildKycAuthHeaders, applySnapshot],
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

      const run = async (): Promise<KYCStatusSnapshot | null> => {
        const guards = fetchGuardsRef.current;
        delete guards[`${guardKey}_kyc`];
        delete guards[`${guardKey}_tx`];

        const fetchOpts = { force: true as const };
        const [kycOk] = await Promise.all([
          fetchKYCStatus(fetchOpts),
          fetchTransactionSummary(fetchOpts),
        ]);

        // Only a successful status fetch counts as fresh. Stamping on failure would serve
        // the reset (tier-0) snapshot for the whole staleness window — verified users would
        // transiently read as unverified and get re-prompted for phone verification.
        if (kycOk) {
          lastFetchTimeRef.current = Date.now();
        }
        return latestSnapshotRef.current;
      };

      const inFlight = refreshInFlightRef.current;
      if (inFlight) {
        if (!force) {
          return inFlight;
        }
        // A forced refresh must observe data fetched AFTER the caller's action (e.g. an OTP
        // promotion) — piggybacking on an older in-flight fetch would hand back pre-action
        // data and the caller would still see the user as unverified.
        const chained = inFlight.catch(() => null).then(run);
        refreshInFlightRef.current = chained;
        try {
          return await chained;
        } finally {
          if (refreshInFlightRef.current === chained) {
            refreshInFlightRef.current = null;
          }
        }
      }

      const current = run();
      refreshInFlightRef.current = current;
      try {
        return await current;
      } finally {
        if (refreshInFlightRef.current === current) {
          refreshInFlightRef.current = null;
        }
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
      setPooledWalletCount(empty.pooledWalletCount);
      setIsPhoneVerified(empty.isPhoneVerified);
      setIdentityHasVerifiedPhone(empty.identityHasVerifiedPhone);
      setHasLoadedStatus(empty.hasLoadedStatus);
      setPhoneNumber(empty.phoneNumber);
      setFullName(empty.fullName);
      setTransactionSummary({ ...EMPTY_TX_SUMMARY });
      fetchGuardsRef.current = {};
      lastFetchTimeRef.current = 0;
      // Detach any refresh still in flight for the PREVIOUS wallet. A forced refresh chains
      // onto whatever is in flight, so leaving it attached would make this wallet's status
      // wait on an unrelated (and untimed) fetch before it even starts. The run's own
      // ownership check means the detached promise can't clobber this wallet's state.
      refreshInFlightRef.current = null;
      void refreshStatus(true);
    }
  }, [walletAddress, refreshStatus]);

  return (
    <KYCContext.Provider
      value={{
        tier,
        pooledWalletCount,
        isPhoneVerified,
        identityHasVerifiedPhone,
        hasLoadedStatus,
        phoneNumber,
        fullName,
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
