"use client";

import { toast } from "sonner";
import { CheckmarkCircle01Icon } from "hugeicons-react";

/**
 * Success toast pattern from Figma (2631:134140): green title + divider + body.
 */
export function showActionSuccessToast(title: string, description: string) {
  toast.custom(
    () => (
      <div
        role="status"
        className="w-[min(100vw-2rem,20rem)] overflow-hidden rounded-xl border border-white/10 bg-[#202020] shadow-2xl"
      >
        <div className="flex items-center gap-2.5 px-3.5 py-2.5">
          <CheckmarkCircle01Icon className="size-4 shrink-0 text-[#39c65d]" />
          <p className="text-sm font-medium text-[#39c65d]">{title}</p>
        </div>
        <hr className="border-white/10" />
        <p className="px-3.5 py-2.5 text-sm text-white/80">{description}</p>
      </div>
    ),
    { duration: 5000 },
  );
}
