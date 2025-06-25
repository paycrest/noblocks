import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { InformationCircleIcon } from "hugeicons-react";
import config from "@/app/lib/config";

export const PausedNetworkNotice: React.FC<{ show?: boolean }> = ({
  show = true,
}) => {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="flex w-full items-start gap-2"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.2, type: "spring" }}
        >
          <InformationCircleIcon
            className="mt-1 size-3.5 flex-shrink-0 text-text-secondary dark:text-white/30"
            aria-hidden="true"
          />
          <div className="flex-1 text-sm">
            <span className="font-medium text-black dark:text-white">Lisk</span>
            <span className="font-normal text-text-secondary dark:text-white/50">
              {" "}
              and{" "}
            </span>
            <span className="font-medium text-black dark:text-white">
              BNB Chain
            </span>
            <span className="font-normal text-text-secondary dark:text-white/50">
              {" "}
              transactions are currently paused due to technical constraints.
              We're working on it — please try again soon or{" "}
            </span>
            <a
              href={config.contactSupportUrl}
              className="font-medium text-black hover:underline dark:text-white"
              target="_blank"
              rel="noopener noreferrer"
            >
              contact support
            </a>
            <span className="font-normal text-text-secondary dark:text-white/50">
              {" "}
              for more info.
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PausedNetworkNotice;
