"use client";

import { classNames } from "@/app/utils";

import { PaycrestWordmark } from "./PaycrestWordmark";
import { drawerSecondaryText } from "./drawerStyles";

export function DrawerPoweredByFooter({ className = "" }: { className?: string }) {
  return (
    <div
      // Stable hook so `/widget` (globals.css, scoped to body.widget-experience)
      // can hide this — WidgetShell already renders its own "Secured by
      // Noblocks" footer below the scrollable content, so a step's own copy
      // would otherwise stack a second footer right above it.
      data-drawer-powered-by-footer
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
