"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export const useBlockFestReferral = () => {
  const searchParams = useSearchParams();
  const [isBlockFestReferral, setIsBlockFestReferral] = useState(false);

  useEffect(() => {
    // Guard against null searchParams (SSR or edge cases)
    if (!searchParams) {
      if (isBlockFestReferral !== false) {
        setIsBlockFestReferral(false);
      }
      return;
    }

    const ref = searchParams.get("ref");
    const isBlockFest = ref === "blockfest";

    // Only update state if the value actually changed
    if (isBlockFest !== isBlockFestReferral) {
      setIsBlockFestReferral(isBlockFest);
    }
  }, [searchParams, isBlockFestReferral]);

  return { isBlockFestReferral };
};
