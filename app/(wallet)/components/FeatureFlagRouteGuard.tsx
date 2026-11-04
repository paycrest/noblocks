"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isFeatureEnabled } from "@/app/lib/flags";
import { walletRouteRequiresFeature } from "@/app/lib/wallet-routes";

export function FeatureFlagRouteGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const requiredFlag = walletRouteRequiresFeature(pathname);

  useEffect(() => {
    if (!requiredFlag) return;
    if (!isFeatureEnabled(requiredFlag)) {
      router.replace("/");
    }
  }, [pathname, requiredFlag, router]);

  if (requiredFlag && !isFeatureEnabled(requiredFlag)) {
    return null;
  }

  return <>{children}</>;
}
