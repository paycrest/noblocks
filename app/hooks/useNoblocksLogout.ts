"use client";

import { useCallback, useState } from "react";
import { useLogout, usePrivy } from "@privy-io/react-auth";
import { clearUserSessionData } from "../lib/session-cleanup";
import { useWalletDisconnect } from "./useWalletDisconnect";
import { resetNetworkModalDismissed } from "../lib/networkModalStore";

/**
 * Shared Privy sign-out flow (same behavior as MobileDropdown / SettingsDropdown).
 */
export function useNoblocksLogout() {
  const { user } = usePrivy();
  const { disconnectWallet } = useWalletDisconnect();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { logout } = useLogout({
    onSuccess: () => {
      setIsLoggingOut(false);
      resetNetworkModalDismissed();
    },
  });

  const signOut = useCallback(async () => {
    setIsLoggingOut(true);
    try {
      clearUserSessionData(user?.id, user?.wallet?.address);
      await logout();

      if (typeof window !== "undefined" && window.ethereum) {
        try {
          await disconnectWallet();
        } catch (disconnectError) {
          console.warn("Wallet disconnect failed:", disconnectError);
        }
      }
    } catch (error) {
      console.error("Error during logout:", error);
    } finally {
      setIsLoggingOut(false);
    }
  }, [disconnectWallet, logout, user?.id, user?.wallet?.address]);

  return { signOut, isLoggingOut };
}
