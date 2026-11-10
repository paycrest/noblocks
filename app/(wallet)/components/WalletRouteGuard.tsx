"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLogin, usePrivy } from "@privy-io/react-auth";
import {
  AUTH_RETURN_STORAGE_KEY,
  sanitizeAuthReturnPath,
} from "@/app/lib/wallet-auth";
import { useLoginWithScrollPin } from "@/app/hooks/useLoginWithScrollPin";
import { WalletAuthPageSkeleton } from "./WalletPageSkeletons";

export function WalletRouteGuard({ children }: { children: React.ReactNode }) {
  const { ready, authenticated } = usePrivy();
  const pathname = usePathname();
  const router = useRouter();
  const loginTriggeredRef = useRef(false);

  const { login } = useLogin({
    onComplete: () => {
      const stored = sanitizeAuthReturnPath(
        sessionStorage.getItem(AUTH_RETURN_STORAGE_KEY),
      );
      sessionStorage.removeItem(AUTH_RETURN_STORAGE_KEY);
      if (stored && stored !== pathname) {
        router.replace(stored);
      }
    },
  });

  const loginWithPin = useLoginWithScrollPin(login);

  useEffect(() => {
    if (!ready || authenticated) {
      loginTriggeredRef.current = false;
      return;
    }
    if (loginTriggeredRef.current) return;
    loginTriggeredRef.current = true;
    const returnPath = sanitizeAuthReturnPath(pathname) ?? "/";
    sessionStorage.setItem(AUTH_RETURN_STORAGE_KEY, returnPath);
    loginWithPin();
  }, [authenticated, loginWithPin, pathname, ready]);

  if (!ready || !authenticated) {
    return <WalletAuthPageSkeleton pathname={pathname} />;
  }

  return <>{children}</>;
}
