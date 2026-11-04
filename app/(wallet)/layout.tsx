"use client";

import { LeftNav } from "./components/LeftNav";
import { TopBar } from "./components/TopBar";
import { WalletRouteGuard } from "./components/WalletRouteGuard";
import { FeatureFlagRouteGuard } from "./components/FeatureFlagRouteGuard";

export default function WalletShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <FeatureFlagRouteGuard>
      <div className="flex min-h-dvh w-full bg-white dark:bg-neutral-900">
        <LeftNav />
        <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
          <TopBar />
          <WalletRouteGuard>
            <div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>
          </WalletRouteGuard>
        </div>
      </div>
    </FeatureFlagRouteGuard>
  );
}
