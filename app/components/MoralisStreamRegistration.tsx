"use client";

import { useEffect, useRef } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";

/**
 * After email signup / login with an embedded wallet, register the EOA on the Moralis
 * stream (server-side). Deduplicated per user + EOA in localStorage.
 */
export function MoralisStreamRegistration() {
  const { ready, authenticated, getAccessToken, user } = usePrivy();
  const { wallets } = useWallets();
  const ranForSession = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || !authenticated || !user?.id) {
      return;
    }
    if (!user?.email?.address) {
      return;
    }
    const embedded = wallets.find((w) => w.walletClientType === "privy");
    const eoa = embedded?.address?.toLowerCase();
    if (!eoa || !eoa.startsWith("0x") || eoa.length !== 42) {
      return;
    }

    const sessionKey = `${user.id}:${eoa}`;
    if (ranForSession.current === sessionKey) {
      return;
    }

    const storageKey = `noblocks_moralis_stream_eoa_${user.id}`;
    if (typeof localStorage !== "undefined") {
      try {
        if (localStorage.getItem(storageKey) === eoa) {
          ranForSession.current = sessionKey;
          return;
        }
      } catch {
        /* private mode or quota */
      }
    }

    ranForSession.current = sessionKey;
    let cancelled = false;
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      let token: string | null = null;
      try {
        token = await getAccessToken();
      } catch {
        ranForSession.current = null;
        return;
      }
      if (cancelled || !token) {
        ranForSession.current = null;
        return;
      }
      timeoutId = setTimeout(() => controller.abort(), 8_000);
      let res: Response;
      try {
        res = await fetch("/api/v1/wallets/moralis-stream/register", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
      } catch {
        ranForSession.current = null;
        return;
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        timeoutId = undefined;
      }
      if (cancelled) {
        ranForSession.current = null;
        return;
      }
      if (res.ok) {
        try {
          localStorage.setItem(storageKey, eoa);
        } catch {
          /* ignore */
        }
        return;
      }
      if (res.status === 503) {
        if (process.env.NODE_ENV === "development") {
          console.warn(
            "[MoralisStreamRegistration] Moralis not configured, skip",
          );
        }
        return;
      }
      ranForSession.current = null;
      if (process.env.NODE_ENV === "development") {
        const body = await res.text();
        console.warn(
          "[MoralisStreamRegistration] register failed",
          res.status,
          body,
        );
      }
    })();

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      controller.abort();
    };
  }, [
    ready,
    authenticated,
    getAccessToken,
    user?.id,
    user?.email?.address,
    wallets,
  ]);

  return null;
}
