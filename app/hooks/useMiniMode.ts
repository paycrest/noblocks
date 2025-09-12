"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

/**
 * Custom hook to detect if the app is in mini mode
 * @returns boolean indicating if mini mode is active
 */
export function useMiniMode(): boolean {
  const searchParams = useSearchParams();
  
  return useMemo(() => {
    return searchParams.get("mini") === "true";
  }, [searchParams]);
}
