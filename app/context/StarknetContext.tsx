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

interface StarknetWalletState {
  walletId: string | null;
  address: string | null;
  publicKey: string | null;
  deployed: boolean;
  isCreating: boolean;
  isDeploying: boolean;
  error: string | null;
}

interface StarknetContextType extends StarknetWalletState {
  createWallet: () => Promise<void>;
  deployWallet: () => Promise<void>;
  resetError: () => void;
  refreshWalletState: () => Promise<void>;
  ensureWalletExists: () => Promise<void>; // Auto-create wallet if needed
}

const StarknetContext = createContext<StarknetContextType | undefined>(
  undefined,
);

const STORAGE_PREFIX = "starknet_";

export function StarknetProvider({ children }: { children: ReactNode }) {
  const { user, authenticated, getAccessToken } = usePrivy();

  const [walletId, setWalletId] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [deployed, setDeployed] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check for Starknet wallet in user's linked accounts
  useEffect(() => {
    if (authenticated && user) {
      const linkedAccounts = user.linkedAccounts || [];
      const starknetWallet = linkedAccounts.find(
        (account: any) =>
          account.type === "wallet" &&
          (account.chainType === "starknet" ||
            account.chain_type === "starknet"),
      );

      if (starknetWallet) {
        const wallet = starknetWallet as any;
        const walletId = wallet.id || null;
        const address = wallet.address || null;
        const pk = wallet.publicKey || wallet.public_key;

        setWalletId(walletId);
        setAddress(address);
        if (pk) setPublicKey(pk);
        setDeployed(true);

        saveToLocalStorage({
          walletId,
          address,
          publicKey: pk,
          deployed: true,
        });
      }
    }
  }, [authenticated, user]);

  // Load wallet state from localStorage on mount
  useEffect(() => {
    if (authenticated && user?.id) {
      const storedWalletId = localStorage.getItem(
        `${STORAGE_PREFIX}walletId_${user.id}`,
      );
      const storedAddress = localStorage.getItem(
        `${STORAGE_PREFIX}address_${user.id}`,
      );
      const storedPublicKey = localStorage.getItem(
        `${STORAGE_PREFIX}publicKey_${user.id}`,
      );
      const storedDeployed = localStorage.getItem(
        `${STORAGE_PREFIX}deployed_${user.id}`,
      );

      if (storedWalletId) setWalletId(storedWalletId);
      if (storedAddress) setAddress(storedAddress);
      if (storedPublicKey) setPublicKey(storedPublicKey);
      if (storedDeployed === "true") setDeployed(true);
    } else if (!user) {
      setWalletId(null);
      setAddress(null);
      setPublicKey(null);
      setDeployed(false);
      setError(null);
    }
  }, [authenticated, user]);

  // Save wallet state to localStorage
  const saveToLocalStorage = (data: Partial<StarknetWalletState>) => {
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
    if (data.publicKey !== undefined) {
      localStorage.setItem(
        `${STORAGE_PREFIX}publicKey_${user.id}`,
        data.publicKey || "",
      );
    }
    if (data.deployed !== undefined) {
      localStorage.setItem(
        `${STORAGE_PREFIX}deployed_${user.id}`,
        String(data.deployed),
      );
    }
  };

  const createWallet = async (): Promise<string> => {
    if (!authenticated || !user?.id) {
      setError("User not authenticated");
      throw new Error("User not authenticated");
    }

    try {
      setError(null);
      setIsCreating(true);

      const token = await getAccessToken();

      // Step 1: Create the wallet
      const response = await fetch("/api/starknet/create-wallet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ownerId: user.id }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create Starknet wallet");
      }

      const wallet = data.wallet || {};
      const newWalletId = wallet.id || null;
      const newAddress = wallet.address || null;
      let newPublicKey = wallet.public_key || wallet.publicKey || null;

      // Step 2: If no public key, derive it via signing
      if (!newPublicKey && newWalletId) {
        try {
          const pkResponse = await fetch("/api/starknet/get-public-key", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ walletId: newWalletId }),
          });

          const pkData = await pkResponse.json();
          if (pkResponse.ok && pkData.publicKey) {
            newPublicKey = pkData.publicKey;
          }
        } catch (pkError) {
          console.error("Failed to derive public key:", pkError);
        }
      }

      setWalletId(newWalletId);
      setAddress(newAddress);
      setPublicKey(newPublicKey);

      saveToLocalStorage({
        walletId: newWalletId,
        address: newAddress,
        publicKey: newPublicKey,
      });

      return newWalletId;
    } catch (err: any) {
      setError(err.message || "Failed to create Starknet wallet");
      throw err;
    } finally {
      setIsCreating(false);
    }
  };

  const deployWallet = async (walletIdToUse?: string) => {
    const targetWalletId = walletIdToUse || walletId;

    if (!authenticated || !targetWalletId) {
      setError("No wallet to deploy");
      throw new Error("No wallet to deploy");
    }

    try {
      setError(null);
      setIsDeploying(true);

      const token = await getAccessToken();
      const response = await fetch("/api/starknet/deploy-wallet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          walletId: targetWalletId,
          publicKey: publicKey, // Pass the public key we derived earlier
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to deploy Starknet wallet");
      }

      setDeployed(true);
      setAddress(data.address);

      saveToLocalStorage({
        deployed: true,
        address: data.address,
      });
    } catch (err: any) {
      setError(err.message || "Failed to deploy Starknet wallet");
      throw err;
    } finally {
      setIsDeploying(false);
    }
  };

  const refreshWalletState = async () => {
    if (!authenticated || !user?.id) return;

    try {
      const token = await getAccessToken();
      const response = await fetch(
        `/api/starknet/wallet-state?userId=${user.id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (response.ok) {
        const data = await response.json();
        if (data.walletId) setWalletId(data.walletId);
        if (data.address) setAddress(data.address);
        if (data.publicKey) setPublicKey(data.publicKey);
        if (data.deployed !== undefined) setDeployed(data.deployed);

        saveToLocalStorage(data);
      }
    } catch (err) {
      console.error("Failed to refresh Starknet wallet state:", err);
    }
  };

  /**
   * Ensures a Starknet wallet exists for the user
   * Auto-creates and deploys if needed (silent operation)
   */
  const ensureWalletExists = async () => {
    // If wallet already exists and is deployed, do nothing
    if (walletId && deployed) {
      return;
    }

    // If already creating or deploying, do nothing
    if (isCreating || isDeploying) {
      return;
    }

    try {
      resetError();

      let currentWalletId = walletId;

      // Step 1: Create wallet if not exists
      if (!currentWalletId) {
        const createToastId = toast.loading("Creating Starknet wallet...");
        try {
          currentWalletId = await createWallet();
          toast.success("Starknet wallet created!", { id: createToastId });
        } catch (error) {
          toast.error("Failed to create Starknet wallet", {
            id: createToastId,
          });
          throw error;
        }
      }

      // // Step 2: Deploy wallet if not deployed
      // if (!deployed && currentWalletId) {
      //   const deployToastId = toast.loading("Deploying Starknet wallet...");
      //   try {
      //     await deployWallet(currentWalletId);
      //     toast.success("Starknet wallet deployed!", { id: deployToastId });
      //   } catch (error) {
      //     toast.error("Failed to deploy Starknet wallet", {
      //       id: deployToastId,
      //     });
      //     throw error;
      //   }
      // }
    } catch (err) {
      console.error("Failed to ensure Starknet wallet exists:", err);
      // Don't throw - fail silently for better UX
    }
  };

  const resetError = () => setError(null);

  // Wrapper functions to match the interface (void return type)
  const createWalletWrapper = async () => {
    await createWallet();
  };

  const deployWalletWrapper = async () => {
    await deployWallet();
  };

  return (
    <StarknetContext.Provider
      value={{
        walletId,
        address,
        publicKey,
        deployed,
        isCreating,
        isDeploying,
        error,
        createWallet: createWalletWrapper,
        deployWallet: deployWalletWrapper,
        resetError,
        refreshWalletState,
        ensureWalletExists,
      }}
    >
      {children}
    </StarknetContext.Provider>
  );
}

export function useStarknet() {
  const context = useContext(StarknetContext);
  if (context === undefined) {
    throw new Error("useStarknet must be used within a StarknetProvider");
  }
  return context;
}
