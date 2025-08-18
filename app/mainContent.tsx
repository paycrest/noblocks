"use client";

import React from "react";
import { usePathname } from "next/navigation";

function MainContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const getMaxWidthClass = (): string => {
    const widerRoutes = ["/privacy-policy", "/terms"];
    return widerRoutes.includes(pathname) ? "max-w-xl" : "max-w-full";
  };

  return (
    <main className={`w-full flex-grow ${getMaxWidthClass()}`}>
      {children}
    </main>
  );
}

export default MainContent;
