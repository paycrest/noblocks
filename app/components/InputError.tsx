"use client";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircleIcon } from "hugeicons-react";

export const InputError = ({ message }: { message: string | any }) => (
  <AnimatePresence>
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="text-accent-red flex items-center justify-between"
    >
      <p className="bg-background-accent-red rounded-lg px-3 py-1 text-sm dark:bg-white/10">
        {message}
      </p>
      <AlertCircleIcon className="size-4" />
    </motion.div>
  </AnimatePresence>
);
