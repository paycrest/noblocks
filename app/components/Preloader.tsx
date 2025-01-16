"use client";
import Rive, { useRive } from "@rive-app/react-canvas";
import { motion, AnimatePresence } from "framer-motion";

export const Preloader = ({ isLoading }: { isLoading: boolean }) => {
  const { RiveComponent } = useRive({
    src: "/rive/noblocks-loader.riv",
    stateMachines: "Looping rotation",
    autoplay: true,
  });

  return (
    <AnimatePresence>
      {isLoading && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="pointer-events-none fixed inset-0 z-50 grid min-h-screen cursor-progress place-items-center gap-4 bg-white dark:bg-neutral-900"
        >
          <div className="size-80">
            <RiveComponent />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
