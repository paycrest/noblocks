// Extend the Window interface for our in-memory phone fetch guard
declare global {
  interface Window {
    __PHONE_FETCH_GUARDS__?: Record<string, string>;
  }
}
import { useState, useEffect, useCallback } from 'react';
import { useWallets } from '@privy-io/react-auth';

interface PhoneVerificationStatus {
  isVerified: boolean;
  phoneNumber: string | null;
  verifiedAt: string | null;
  provider: 'termii' | 'twilio' | null;
  isLoading: boolean;
  error: string | null;
}

export function usePhoneVerification() {

  const { wallets } = useWallets();
  const embeddedWallet = wallets.find(
    (wallet) => wallet.walletClientType === "privy",
  );
  const walletAddress = embeddedWallet?.address;

  // In-memory guards for fetches per wallet
  const fetchGuards = (typeof window !== 'undefined') ? (window.__PHONE_FETCH_GUARDS__ = window.__PHONE_FETCH_GUARDS__ || {}) : {};
  const guardKey = walletAddress || 'no_wallet';

  const [status, setStatus] = useState<PhoneVerificationStatus>({
    isVerified: false,
    phoneNumber: null,
    verifiedAt: null,
    provider: null,
    isLoading: false,
    error: null,
  });

  const checkVerificationStatus = useCallback(async () => {
    if (!walletAddress) {
      setStatus(prev => ({
        ...prev,
        isVerified: false,
        phoneNumber: null,
        verifiedAt: null,
        provider: null,
        isLoading: false,
      }));
      return;
    }
    if (fetchGuards[`${guardKey}_phone`] === 'fetching') return;
    fetchGuards[`${guardKey}_phone`] = 'fetching';
    setStatus(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await fetch(`/api/phone/status?walletAddress=${encodeURIComponent(walletAddress)}`);
      const data = await response.json();
      if (data.success) {
        setStatus(prev => ({
          ...prev,
          isVerified: data.verified,
          phoneNumber: data.phoneNumber,
          verifiedAt: data.verifiedAt,
          provider: data.provider,
          isLoading: false,
        }));
      } else {
        setStatus(prev => ({
          ...prev,
          error: data.error || 'Failed to check verification status',
          isLoading: false,
        }));
      }
    } catch (error) {
      console.error('Error checking phone verification status:', error);
      setStatus(prev => ({
        ...prev,
        error: 'Failed to check verification status',
        isLoading: false,
      }));
    } finally {
      fetchGuards[`${guardKey}_phone`] = 'done';
    }
  }, [walletAddress]);

  const markAsVerified = useCallback((phoneNumber: string, provider: 'termii' | 'twilio' = 'termii') => {
    setStatus(prev => ({
      ...prev,
      isVerified: true,
      phoneNumber,
      verifiedAt: new Date().toISOString(),
      provider,
    }));
  }, []);

  // Check status when wallet address changes
  useEffect(() => {
    checkVerificationStatus();
  }, [checkVerificationStatus]);

  return {
    ...status,
    refreshStatus: checkVerificationStatus,
    markAsVerified,
  };
}