"use client";
import { useState, useEffect, memo } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { getBlockFestTimeRemaining } from "../../utils";

function BlockFestBanner() {
  const [timeLeft, setTimeLeft] = useState(getBlockFestTimeRemaining());

  // Countdown timer effect
  useEffect(() => {
    const calculateTimeLeft = () => {
      const remaining = getBlockFestTimeRemaining();
      setTimeLeft(remaining);
      return remaining;
    };

    // Initial calculation
    calculateTimeLeft();

    const timer = setInterval(() => {
      const remaining = calculateTimeLeft();
      if (remaining === 0) {
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Format time remaining
  const formatTime = (milliseconds: number) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const days = Math.floor(totalSeconds / (24 * 60 * 60));
    const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
    const seconds = totalSeconds % 60;

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    }
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  const isExpired = timeLeft === 0;

  if (isExpired) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="mb-4 flex justify-center"
    >
      <div className="flex w-full max-w-[27.3125rem] flex-col gap-px">
        {/* BlockFest Logo */}
        <div className="inline-flex w-fit flex-col items-center justify-center gap-5 rounded-bl-sm rounded-br-xl rounded-tl-xl rounded-tr-xl bg-gray-50 px-1.5 py-1 dark:bg-white/10">
          <div className="relative h-5 w-20">
            <Image
              src="/images/blockfest/blockfest-logo.svg"
              alt="BlockFest Africa Logo"
              width={85}
              height={22}
              className="h-5 w-20"
              priority
            />
          </div>
        </div>

        {/* Banner with background */}
        <div className="bg-top-center w-full rounded-bl-2xl rounded-br-2xl rounded-tl-sm rounded-tr-2xl bg-[url('/images/blockfest/blockfest-banner-bg.svg')] bg-cover py-2.5 pl-16 pr-4">
          <div className="w-full">
            <span className="text-sm text-white">
              Enjoy up to 2% cashback on all transactions on Base Network Today!
              Offer expires in{" "}
            </span>
            <span className="text-sm font-semibold leading-tight text-white">
              {formatTime(timeLeft)}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// Memoize to prevent parent re-renders from countdown timer
export default memo(BlockFestBanner);
