"use client";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets as useSolanaPrivyWallets } from "@privy-io/react-auth/solana";
import config from "../lib/config";
import { isValidSolanaAddress } from "../lib/validation";
import type { SolanaContextType } from "../types";

const SolanaContext = createContext<SolanaContextType | undefined>(undefined);

const STORAGE_PREFIX = "solana_";

const emptyValue: SolanaContextType = {
  address: null,
};

function readLinkedSolanaAddress(
  linkedAccounts: Array<{ type?: string; chainType?: string; chain_type?: string; address?: string }>,
): string | null {
  const wallet = linkedAccounts.find(
    (account) =>
      account.type === "wallet" &&
      (account.chainType === "solana" || account.chain_type === "solana"),
  );
  const raw = wallet?.address?.trim();
  return raw && isValidSolanaAddress(raw) ? raw : null;
}

function readStoredSolanaAddress(userId: string): string | null {
  const stored = localStorage.getItem(`${STORAGE_PREFIX}address_${userId}`);
  return stored && isValidSolanaAddress(stored) ? stored : null;
}

function SolanaProviderEnabled({ children }: { children: ReactNode }) {
  const { user, authenticated } = usePrivy();
  const { wallets: solanaWallets } = useSolanaPrivyWallets();
  const [address, setAddress] = useState<string | null>(null);

  const linkedSolanaAddress = useMemo(
    () =>
      user ? readLinkedSolanaAddress(user.linkedAccounts ?? []) : null,
    [user?.id, user?.linkedAccounts],
  );

  const solanaWalletAddressKey = solanaWallets
    .map((wallet) => wallet.address ?? "")
    .join("|");

  const connectedExternalAddress = useMemo(() => {
    for (const wallet of solanaWallets) {
      const raw = wallet.address?.trim();
      if (raw && isValidSolanaAddress(raw)) return raw;
    }
    return null;
  }, [solanaWalletAddressKey, solanaWallets]);

  useEffect(() => {
    if (!config.solanaEnabled) return;

    if (!authenticated || !user?.id) {
      setAddress(null);
      return;
    }

    const live = connectedExternalAddress ?? linkedSolanaAddress;
    const stored = readStoredSolanaAddress(user.id);
    const restored =
      stored &&
      (stored === connectedExternalAddress || stored === linkedSolanaAddress)
        ? stored
        : null;
    const next = live ?? restored;

    setAddress(next ?? null);

    if (next) {
      localStorage.setItem(`${STORAGE_PREFIX}address_${user.id}`, next);
    } else {
      localStorage.removeItem(`${STORAGE_PREFIX}address_${user.id}`);
    }
  }, [
    authenticated,
    user?.id,
    connectedExternalAddress,
    linkedSolanaAddress,
  ]);

  const value = useMemo(() => ({ address }), [address]);

  return (
    <SolanaContext.Provider value={value}>{children}</SolanaContext.Provider>
  );
}

export function SolanaProvider({ children }: { children: ReactNode }) {
  if (!config.solanaEnabled) {
    return (
      <SolanaContext.Provider value={emptyValue}>{children}</SolanaContext.Provider>
    );
  }
  return <SolanaProviderEnabled>{children}</SolanaProviderEnabled>;
}

export function useSolana() {
  const context = useContext(SolanaContext);
  if (context === undefined) {
    throw new Error("useSolana must be used within a SolanaProvider");
  }
  return context;
}
