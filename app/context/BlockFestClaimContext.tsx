"use client";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import axios from "axios";
import { isBlockFestActive } from "../utils";

type ClaimState = {
  claimed: boolean | null;
  loading: boolean;
  error?: string | null;
  checkClaim: (walletAddress: string) => Promise<void>;
  markClaimed: () => void;
  resetClaim: () => void;
};

const Ctx = createContext<ClaimState | undefined>(undefined);

export function BlockFestClaimProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [claimed, setClaimed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkClaim = useCallback(async (walletAddress: string) => {
    if (!walletAddress) return;

    // Early return if BlockFest campaign has expired
    if (!isBlockFestActive()) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(
        `/api/blockfest/participants/${encodeURIComponent(walletAddress)}`,
      );
      if (!res.data.success) {
        throw new Error(res.data.error || "Failed to check status");
      }
      setClaimed(Boolean(res.data.exists));
    } catch (e: any) {
      setError(e?.message || "Failed to check status");
      // Keep claimed state as-is if already true, otherwise set to null (unknown)
      // This prevents reopening the modal for users who already claimed
      setClaimed((prev) => (prev === true ? true : null));
    } finally {
      setLoading(false);
    }
  }, []);

  const markClaimed = useCallback(() => setClaimed(true), []);

  const resetClaim = useCallback(() => {
    setClaimed(null);
    setError(null);
    setLoading(false);
  }, []);

  const value = useMemo(
    () => ({ claimed, loading, error, checkClaim, markClaimed, resetClaim }),
    [claimed, loading, error, checkClaim, markClaimed, resetClaim],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBlockFestClaim() {
  const ctx = useContext(Ctx);
  if (!ctx)
    throw new Error(
      "useBlockFestClaim must be used within BlockFestClaimProvider",
    );
  return ctx;
}
