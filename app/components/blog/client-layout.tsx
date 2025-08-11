"use client";
import React from "react";
import { useHotjar } from "@/app/hooks/analytics/useHotjar";
import { useMixpanel } from "@/app/hooks/analytics/useMixpanel";
import { motion } from "framer-motion";
import { fadeBlur } from "@/app/components/blog/shared/animations";

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useHotjar();
  useMixpanel();
  return (
    <motion.div
      variants={fadeBlur}
      initial="initial"
      animate="animate"
      className="flex min-h-screen flex-col bg-white dark:bg-surface-canvas"
    >
      {children}
    </motion.div>
  );
}
