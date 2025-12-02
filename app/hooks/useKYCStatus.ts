// Extend the Window interface for our in-memory fetch guard
declare global {
  interface Window {
    __KYC_FETCH_GUARDS__?: Record<string, string>;
  }
}
import { useState, useEffect, useCallback } from 'react';
import { useWallets, usePrivy } from '@privy-io/react-auth';

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
    name: 'Tier 1',
    limits: {
      monthly: 100,
    },
    requirements: ['Phone number']
  },
  2: {
    level: 2,
    name: 'Tier 2',
    limits: {
      monthly: 15000,
    },
    requirements: ['Government ID', 'Selfie verification']
  }
};

interface UserTransactionSummary {
  dailySpent: number;
  monthlySpent: number;
  lastTransactionDate: string | null;
}

interface KYCStatus {
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

export function useKYCStatus(): KYCStatus {

  const { wallets } = useWallets();
  const { getAccessToken } = usePrivy();
  const embeddedWallet = wallets.find(
    (wallet) => wallet.walletClientType === "privy",
  );
  const walletAddress = embeddedWallet?.address;

  // In-memory guards for fetches per wallet
  const fetchGuards = (typeof window !== 'undefined') ? (window.__KYC_FETCH_GUARDS__ = window.__KYC_FETCH_GUARDS__ || {}) : {};
  const guardKey = walletAddress || 'no_wallet';

  const [tier, setTier] = useState<0 | 1 | 2>(0);
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [isFullyVerified, setIsFullyVerified] = useState(false);
  const [transactionSummary, setTransactionSummary] = useState<UserTransactionSummary>({
    dailySpent: 0,
    monthlySpent: 0,
    lastTransactionDate: null,
  });

  const getCurrentLimits = useCallback((): TransactionLimits => {
    if (tier > 0){
    return KYC_TIERS[tier].limits;
    } else {
      return { monthly: 0 };
    }
  }, [tier]);

  const getRemainingLimits = useCallback((): TransactionLimits => {
    const currentLimits = getCurrentLimits();
    return {
      monthly: Math.max(0, currentLimits.monthly - transactionSummary.monthlySpent),
    };
  }, [getCurrentLimits, transactionSummary]);

  const canTransact = useCallback((amount: number): { allowed: boolean; reason?: string } => {
    const remaining = getRemainingLimits();


    if (amount > remaining.monthly) {
      return {
        allowed: false,
        reason: `Transaction amount ($${amount}) exceeds remaining monthly limit ($${remaining.monthly})`
      };
    }

    return { allowed: true };
  }, [getCurrentLimits, getRemainingLimits, tier]);


  const fetchTransactionSummary = useCallback(async () => {
    if (!walletAddress) return;
    if (fetchGuards[`${guardKey}_tx`] === 'fetching') return;
    fetchGuards[`${guardKey}_tx`] = 'fetching';
    try {
      const response = await fetch(`/api/kyc/transaction-summary?walletAddress=${encodeURIComponent(walletAddress)}`);
      const data = await response.json();
      if (data.success) {
        setTransactionSummary({
          dailySpent: data.dailySpent,
          monthlySpent: data.monthlySpent,
          lastTransactionDate: data.lastTransactionDate,
        });
      } else {
        console.error('Error fetching transaction summary:', data.error);
      }
    } catch (error) {
      console.error('Error calculating transaction summary:', error);
    } finally {
      fetchGuards[`${guardKey}_tx`] = 'done';
    }
  }, [walletAddress]);


  const fetchKYCStatus = useCallback(async () => {
    if (!walletAddress) return;
    if (fetchGuards[`${guardKey}_kyc`] === 'fetching') return;
    fetchGuards[`${guardKey}_kyc`] = 'fetching';
    try {
      // Get access token for JWT authentication
      const accessToken = await getAccessToken();
      if (!accessToken) {
        console.error('Failed to get access token for KYC status');
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
        console.error('Error fetching KYC status:', data.error);
      }
    } catch (error) {
      console.error('Error fetching KYC status:', error);
    } finally {
      fetchGuards[`${guardKey}_kyc`] = 'done';
    }
  }, [walletAddress, getAccessToken]);

  const refreshStatus = useCallback(async () => {
    await Promise.all([
      fetchKYCStatus(),
      fetchTransactionSummary()
    ]);
  }, [fetchKYCStatus, fetchTransactionSummary]);

  // Initial load and wallet address change
  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  return {
    tier,
    isPhoneVerified,
    phoneNumber,
    isFullyVerified,
    transactionSummary,
    canTransact,
    getCurrentLimits,
    getRemainingLimits,
    refreshStatus,
  };
}