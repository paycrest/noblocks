"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { LeftNav } from "./components/LeftNav";
import { TopBar } from "./components/TopBar";
import { useIsBelowMd } from "./components/useIsBelowMd";
import { WalletRouteGuard } from "./components/WalletRouteGuard";
import { FeatureFlagRouteGuard } from "./components/FeatureFlagRouteGuard";
import { WALLET_DRAWER_SLOT_ID } from "@/app/components/drawer/walletDrawerSlot";

export default function WalletShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isBelowMd = useIsBelowMd();
  const mobileMainInert = isBelowMd && mobileNavOpen;
  const mobileNavToggleRef = useRef<HTMLButtonElement>(null);
  const wasMobileNavOpenRef = useRef(false);

  useLayoutEffect(() => {
    if (wasMobileNavOpenRef.current && !mobileNavOpen) {
      mobileNavToggleRef.current?.focus({ focusVisible: false } as FocusOptions);
    }
    wasMobileNavOpenRef.current = mobileNavOpen;
  }, [mobileNavOpen]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileNavOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileNavOpen]);

  return (
    <FeatureFlagRouteGuard>
      <div className="flex h-dvh w-full bg-white dark:bg-surface-canvas">
        <LeftNav
          mobileOpen={mobileNavOpen}
          onMobileOpenChange={setMobileNavOpen}
        />
        <div
          className="flex h-dvh min-w-0 flex-1 flex-col"
          {...(mobileMainInert ? ({ inert: true } as const) : {})}
        >
          <TopBar
            mobileNavOpen={mobileNavOpen}
            onMobileNavToggle={() => setMobileNavOpen((open) => !open)}
            mobileNavToggleRef={mobileNavToggleRef}
          />
          <div className="relative mb-2.5 mr-2.5 flex min-h-0 flex-1 overflow-hidden rounded-[20px] bg-background-neutral shadow-[0_0_2px_1px_rgba(18,18,23,0.02)] ring-1 ring-border-light dark:bg-white/5 dark:ring-white/10">
            {/* Vertical page scroll is owned by <main> (overflow-y-auto), not the document. */}
            <main className="min-w-0 flex-1 overflow-y-auto px-6 py-6">
              <WalletRouteGuard>{children}</WalletRouteGuard>
            </main>
            <div
              id={WALLET_DRAWER_SLOT_ID}
              className="flex h-full shrink-0 overflow-hidden"
            />
          </div>
        </div>
      </div>
    </FeatureFlagRouteGuard>
  );
}
