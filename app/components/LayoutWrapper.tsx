"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";

interface LayoutWrapperProps {
  children: ReactNode;
  footer: ReactNode;
}

export function LayoutWrapper({ children, footer }: LayoutWrapperProps) {
  return (
    <motion.div
      className="relative mx-auto flex min-h-dvh flex-col items-center transition-all"
      layout
      transition={{ duration: 0.6, ease: "easeInOut" }}
    >
      {children}
      {footer}
    </motion.div>
  );
}
