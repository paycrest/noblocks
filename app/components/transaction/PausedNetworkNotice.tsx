import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { InformationCircleIcon } from "hugeicons-react";
import config from "@/app/lib/config";

interface PausedNetworkNoticeProps {
  show?: boolean;
  networks?: string | string[];
}

export const PausedNetworkNotice: React.FC<PausedNetworkNoticeProps> = ({
  show = true,
  networks = "",
}) => {
  const networkText = Array.isArray(networks)
    ? networks.length > 1
      ? `${networks.slice(0, -1).join(", ")} and ${networks[networks.length - 1]}`
      : networks[0]
    : networks;
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
            className="mt-1 size-3.5 shrink-0 text-text-secondary dark:text-white/30"
            aria-hidden="true"
          />
          <div className="flex-1 text-sm">
            <span className="font-medium text-black dark:text-white">
              {networkText}
            </span>
            <span className="font-normal text-text-secondary dark:text-white/50">
              {" "}
              {Array.isArray(networks) && networks.length > 1
                ? "swaps are"
                : "swaps are"}{" "}
              currently paused due to an ongoing migration. Please try again
              soon or contact support for more info.
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PausedNetworkNotice;
