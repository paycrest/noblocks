"use client";
import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { AnimatedComponent, fadeInOut } from "./";

interface TransactionHelperTextProps {
  isVisible?: boolean;
  showAfterMs?: number;
  forceShow?: boolean;
  className?: string;
  title: string;
  message: string | React.ReactNode;
}

/**
 * Helper text component that appears after a delay during long-running transactions
 */
export const TransactionHelperText = ({
  isVisible = true,
  showAfterMs = 45000,
  forceShow = false,
  className = "w-full space-y-6",
  title,
  message,
}: TransactionHelperTextProps) => {
  const [showHelperText, setShowHelperText] = useState<boolean>(forceShow);

  useEffect(() => {
    if (!isVisible || forceShow) return;

    // Show helper text after specified delay
    const timeoutId = setTimeout(() => {
      setShowHelperText(true);
    }, showAfterMs);

    // Cleanup function
    return () => {
      clearTimeout(timeoutId);
    };
  }, [isVisible, forceShow, showAfterMs]);

  if (!isVisible && !forceShow) return null;

  return (
    <AnimatePresence>
      {(showHelperText || forceShow) && (
        <AnimatedComponent variant={fadeInOut} className={className}>
          <hr className="w-full border-dashed border-gray-200 dark:border-white/10" />

          <div className="space-y-2 rounded-xl bg-background-neutral px-4 py-3 text-sm dark:bg-white/5">
            <p className="font-medium text-text-body dark:text-white/80">
              {title}
            </p>
            <div className="text-text-secondary dark:text-white/50">
              {typeof message === "string" ? <p>{message}</p> : message}
            </div>
          </div>
        </AnimatedComponent>
      )}
    </AnimatePresence>
  );
};
