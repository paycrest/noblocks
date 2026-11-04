"use client";

import { usePathname } from "next/navigation";

import { LeftNav } from "./components/LeftNav";
import { TopBar } from "./components/TopBar";
import { WalletRouteGuard } from "./components/WalletRouteGuard";
import { FeatureFlagRouteGuard } from "./components/FeatureFlagRouteGuard";
import { WALLET_DRAWER_SLOT_ID } from "@/app/components/drawer/walletDrawerSlot";

function WalletContentArea({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden">
      <main className="min-w-0 flex-1 overflow-y-auto px-6 py-6">{children}</main>
      <div
        id={WALLET_DRAWER_SLOT_ID}
        className="flex h-full shrink-0 self-stretch"
      />
    </div>
  );
}

export default function WalletShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isKan954Harness =
    process.env.NODE_ENV === "development" &&
    pathname?.startsWith("/kan954-harness");

  return (
    <FeatureFlagRouteGuard>
      <div className="flex min-h-dvh w-full bg-white dark:bg-neutral-900">
        <LeftNav />
        <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
          <TopBar />
          {isKan954Harness ? (
            <WalletContentArea>{children}</WalletContentArea>
          ) : (
            <WalletRouteGuard>
              <WalletContentArea>{children}</WalletContentArea>
            </WalletRouteGuard>
          )}
        </div>
      </div>
    </FeatureFlagRouteGuard>
  );
}
