"use client";

import { PaycrestLogo } from "@/app/components/ImageAssets";

export function DrawerPoweredByFooter({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex w-full items-center justify-center gap-1.5 text-xs text-white/50 ${className}`}
    >
      <span>Powered by</span>
      <PaycrestLogo className="h-3 w-auto" />
    </div>
  );
}
