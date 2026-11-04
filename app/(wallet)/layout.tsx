"use client";

import { LeftNav } from "./components/LeftNav";
import { TopBar } from "./components/TopBar";
import { WalletRouteGuard } from "./components/WalletRouteGuard";
import { FeatureFlagRouteGuard } from "./components/FeatureFlagRouteGuard";
import { WALLET_DRAWER_SLOT_ID } from "@/app/components/drawer/walletDrawerSlot";

function WalletContentArea({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mb-2.5 mr-2.5 flex min-h-0 flex-1 overflow-hidden rounded-[20px] bg-background-neutral shadow-[0_0_2px_1px_rgba(18,18,23,0.02)] ring-1 ring-border-light dark:bg-white/5 dark:ring-white/10">
      {/* Vertical page scroll is owned by <main> (overflow-y-auto), not the document. */}
      <main className="min-w-0 flex-1 overflow-y-auto px-6 py-6">{children}</main>
      <div
        id={WALLET_DRAWER_SLOT_ID}
        className="flex h-full shrink-0 overflow-hidden"
      />
    </div>
  );
}

export default function WalletShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <FeatureFlagRouteGuard>
      <div className="flex h-dvh w-full bg-white dark:bg-surface-canvas">
        <LeftNav />
        <div className="flex h-dvh min-w-0 flex-1 flex-col">
          <TopBar />
          <WalletRouteGuard>
            <WalletContentArea>{children}</WalletContentArea>
          </WalletRouteGuard>
        </div>
      </div>
    </FeatureFlagRouteGuard>
  );
}
