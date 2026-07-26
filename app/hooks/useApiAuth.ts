"use client";

import { useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useInjectedWallet } from "../context/InjectedWalletContext";

export type ApiAuth = {
  accessToken: string | null;
  injectedToken: string | null;
};

/**
 * Resolves the credential our API routes accept: a Privy Bearer token for Privy wallets, or the
 * injected wallet's SIWE session token (`x-injected-token`) in embed/widget mode. The middleware
 * accepts either; a connected injected wallet on its own is not authentication.
 *
 * Pass `interactive: false` from background work (pollers, hydration effects) so a missing session
 * never pops a signature request — the caller should skip that cycle instead. Use
 * `interactive: true` only on paths the user just triggered.
 */
export function useApiAuth() {
  const { getAccessToken } = usePrivy();
  const { isInjectedWallet, getInjectedToken } = useInjectedWallet();

  const resolveAuth = useCallback(
    async (opts?: { interactive?: boolean }): Promise<ApiAuth> => {
      const interactive = opts?.interactive ?? true;
      const accessToken = isInjectedWallet ? null : await getAccessToken();
      const injectedToken = isInjectedWallet
        ? await getInjectedToken({ interactive })
        : null;
      return { accessToken, injectedToken };
    },
    [isInjectedWallet, getAccessToken, getInjectedToken],
  );

  return { resolveAuth };
}
