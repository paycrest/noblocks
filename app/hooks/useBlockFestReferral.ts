"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export const useBlockFestReferral = () => {
  const searchParams = useSearchParams();
  const [isBlockFestReferral, setIsBlockFestReferral] = useState(false);

  useEffect(() => {
    const ref = searchParams.get("ref");
    const isBlockFest = ref === "blockfest";
    setIsBlockFestReferral(isBlockFest);
  }, [searchParams]);

  return { isBlockFestReferral };
};
