"use client";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { usePrivy } from "@privy-io/react-auth";
import { toast } from "sonner";
import { TronContextType, TronWalletState } from "../types";
import config from "../lib/config";

const TronContext = createContext<TronContextType | undefined>(undefined);

const STORAGE_PREFIX = "tron_";

export function TronProvider({ children }: { children: ReactNode }) {
  const { user, authenticated, getAccessToken } = usePrivy();

  const [walletId, setWalletId] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!config.tronEnabled) return;
    if (authenticated && user) {
      const linkedAccounts = user.linkedAccounts || [];
      const tronWallet = linkedAccounts.find(
        (account: { type?: string; chainType?: string; chain_type?: string }) =>
          account.type === "wallet" &&
          (account.chainType === "tron" || account.chain_type === "tron"),
      );

      if (tronWallet) {
        const wallet = tronWallet as {
          id?: string;
          address?: string;
        };
        const nextWalletId = wallet.id || null;
        const nextAddress = wallet.address?.trim() || null;

        setWalletId(nextWalletId);
        setAddress(nextAddress);
        saveToLocalStorage({
          walletId: nextWalletId,
          address: nextAddress,
        });
      } else {
        setWalletId(null);
        setAddress(null);
        saveToLocalStorage({ walletId: null, address: null });
      }
    }
  }, [authenticated, user]);

  useEffect(() => {
    if (!config.tronEnabled) return;
    if (authenticated && user?.id) {
      const storedWalletId = localStorage.getItem(
        `${STORAGE_PREFIX}walletId_${user.id}`,
      );
      const storedAddress = localStorage.getItem(
        `${STORAGE_PREFIX}address_${user.id}`,
      );

      const nextWalletId =
        storedWalletId && storedWalletId !== "" ? storedWalletId : null;
      const nextAddress =
        storedAddress && storedAddress !== "" ? storedAddress : null;

      setWalletId(nextWalletId);
      setAddress(nextAddress);

      if (!nextWalletId && !nextAddress) {
        saveToLocalStorage({ walletId: null, address: null });
      }
    } else if (!user) {
      setWalletId(null);
      setAddress(null);
      setError(null);
    }
  }, [authenticated, user]);

  const saveToLocalStorage = (data: Partial<TronWalletState>) => {
    if (!user?.id) return;

    if (data.walletId !== undefined) {
      localStorage.setItem(
        `${STORAGE_PREFIX}walletId_${user.id}`,
        data.walletId || "",
      );
    }
    if (data.address !== undefined) {
      localStorage.setItem(
        `${STORAGE_PREFIX}address_${user.id}`,
        data.address || "",
      );
    }
  };

  const createWallet = async (): Promise<string> => {
    if (!config.tronEnabled) {
      throw new Error("Tron is not enabled");
    }
    if (!authenticated || !user?.id) {
      setError("User not authenticated");
      throw new Error("User not authenticated");
    }

    try {
      setError(null);
      setIsCreating(true);

      const token = await getAccessToken();
      if (!token) {
        throw new Error("Authentication required. Please sign in.");
      }

      const response = await fetch("/api/tron/create-wallet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ownerId: user.id }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create Tron wallet");
      }

      const wallet = data.wallet || {};
      const newWalletId = wallet.id || null;
      const newAddress = wallet.address?.trim() || null;

      if (!newWalletId) {
        throw new Error("Created wallet missing id");
      }

      setWalletId(newWalletId);
      setAddress(newAddress);
      saveToLocalStorage({ walletId: newWalletId, address: newAddress });

      return newWalletId;
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to create Tron wallet";
      setError(message);
      throw err;
    } finally {
      setIsCreating(false);
    }
  };

  const ensureWalletExists = async () => {
    if (!config.tronEnabled) return;
    if (walletId && address) return;
    if (isCreating) return;

    resetError();
    if (!walletId) {
      const createToastId = toast.loading("Creating Tron wallet...");
      try {
        await createWallet();
        toast.success("Tron wallet created!", { id: createToastId });
      } catch (err) {
        toast.error("Failed to create Tron wallet", { id: createToastId });
        console.error("Failed to ensure Tron wallet exists:", err);
        throw err instanceof Error
          ? err
          : new Error("Failed to create Tron wallet");
      }
    }
  };

  const resetError = () => setError(null);

  const createWalletWrapper = async () => {
    await createWallet();
  };

  const value: TronContextType = {
    walletId,
    address,
    isCreating,
    error,
    createWallet: createWalletWrapper,
    resetError,
    ensureWalletExists,
  };

  return (
    <TronContext.Provider value={value}>{children}</TronContext.Provider>
  );
}

export function useTron() {
  const context = useContext(TronContext);
  if (context === undefined) {
    throw new Error("useTron must be used within a TronProvider");
  }
  return context;
}
