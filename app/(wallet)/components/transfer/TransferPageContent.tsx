"use client";

import { useRouter } from "next/navigation";

import { TransferForm } from "@/app/components/TransferForm";

/** Home full-page Transfer widget (Figma 2620:124938, "Transfer section" 2620:121198). */
export function TransferPageContent() {
  const router = useRouter();

  return (
    <div className="mx-auto flex w-full max-w-[483px] flex-col items-center gap-[49px] pb-8">
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="font-inter text-[30px] font-semibold leading-9 tracking-[-0.9px] text-text-body dark:text-white">
          Transfer funds
        </h1>
        <p className="font-inter text-sm font-medium leading-5 tracking-[-0.14px] text-text-secondary dark:text-white/50">
          Send any token to any network
        </p>
      </div>

      <div className="w-full">
        <TransferForm chrome="page" onClose={() => router.push("/")} />
      </div>
    </div>
  );
}
