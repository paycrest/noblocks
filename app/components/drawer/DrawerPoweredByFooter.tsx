"use client";

import Image from "next/image";

import { classNames } from "@/app/utils";

export function DrawerPoweredByFooter({ className = "" }: { className?: string }) {
  return (
    <div
      className={classNames(
        "flex w-full items-center justify-center gap-[2.77px] text-[8.6px] font-medium leading-[14.33px] tracking-[-0.086px] text-white/50",
        className,
      )}
    >
      <span>Powered by</span>
      <Image
        src="/images/paycrest-wordmark.svg"
        alt="paycrest"
        width={53}
        height={11}
        className="h-[11.093px] w-[53.156px] shrink-0"
      />
    </div>
  );
}
