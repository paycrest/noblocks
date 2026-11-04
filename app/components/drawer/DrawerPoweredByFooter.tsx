"use client";

import { classNames } from "@/app/utils";

import { PaycrestWordmark } from "./PaycrestWordmark";
import { drawerSecondaryText } from "./drawerStyles";

export function DrawerPoweredByFooter({ className = "" }: { className?: string }) {
  return (
    <div
      className={classNames(
        "flex w-full items-center justify-center gap-[2.77px] text-[8.6px] font-medium leading-[14.33px] tracking-[-0.086px]",
        drawerSecondaryText,
        className,
      )}
    >
      <span>Powered by</span>
      <PaycrestWordmark className="h-[11.093px] w-[53.156px] text-black dark:text-white" />
      <span className="sr-only">paycrest</span>
    </div>
  );
}
