"use client";
import { TiInfo } from "react-icons/ti";
import { AnimatePresence, motion } from "framer-motion";

export const InputError = ({ message }: { message: string | any }) => (
  <AnimatePresence>
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="text-lavender-500 flex gap-1 text-xs font-medium"
    >
      <TiInfo className="text-sm" />
      <p>{message}</p>
    </motion.div>
  </AnimatePresence>
);
